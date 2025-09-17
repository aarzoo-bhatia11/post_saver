// Function to read clipboard from the active tab's context
async function readClipboardFromActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs.length === 0) {
        return reject(new Error("No active tab found to read clipboard."));
      }
      const activeTabId = tabs[0].id;

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          function: () => navigator.clipboard.readText()
        });
        
        if (results && results[0] && results[0].result !== undefined) {
          resolve(results[0].result);
        } else {
          reject(new Error("Failed to read clipboard from tab."));
        }
      } catch (e) {
        reject(new Error(`Scripting API error: ${e.message}`));
      }
    });
  });
}

// --- NEW: Function to fetch and parse metadata for a URL ---
async function fetchAndParseMetadata(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const getMetaContent = (prop) => {
            let tag = doc.querySelector(`meta[property="${prop}"]`) || doc.querySelector(`meta[name="${prop}"]`);
            return tag ? tag.getAttribute('content') : '';
        };

        const title = doc.querySelector('title')?.textContent || getMetaContent('og:title') || '';
        const description = getMetaContent('og:description') || getMetaContent('description') || '';
        const image = getMetaContent('og:image') || '';
        const siteName = getMetaContent('og:site_name') || doc.querySelector('meta[name="application-name"]')?.getAttribute('content') || new URL(url).hostname;


        return { title, description, image, siteName };
    } catch (error) {
        console.error('Error fetching or parsing metadata for', url, error);
        return { title: '', description: '', image: '', siteName: new URL(url).hostname };
    }
}


// --- NEW: Listener for extension icon click to open tab.html ---
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tab.html") });
});


// Listener for commands (keyboard shortcuts)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save_clipboard_link") {
    console.log("Keyboard shortcut Cmd+Shift+L pressed.");
    try {
      const text = await readClipboardFromActiveTab(); 
      
      const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
      if (urlRegex.test(text)) {
        console.log("Valid URL found in clipboard:", text);
        
        chrome.storage.local.get(['folders'], async (result) => {
          let folders = result.folders || {};
          const folderNames = Object.keys(folders).filter(name => name !== 'Uncategorized'); // Filter out uncategorized if it exists

          // --- NEW: Fetch metadata ---
          const metadata = await fetchAndParseMetadata(text);

          const newPost = {
            url: text,
            title: metadata.title || text, // Use title from metadata, fallback to URL
            description: metadata.description || '',
            image: metadata.image || '',
            siteName: metadata.siteName || new URL(text).hostname,
            timestamp: new Date().toISOString()
          };

          const apiKeyResult = await chrome.storage.sync.get('apiKey');
          const apiKey = apiKeyResult.apiKey;

          // --- NEW: Handle no folders scenario ---
          if (folderNames.length === 0 && !apiKey) { // If no folders created AND no API key for auto-categorization
              chrome.notifications.create({
                  type: 'basic',
                  iconUrl: 'images/icon48.png',
                  title: 'Clipboard Link Saver',
                  message: 'No folders found and API key not configured. Please create a folder first to save links.',
                  priority: 1
              });
              console.log("No folders and no API key. Skipping save.");
              return;
          }


          // Determine initial category
          let targetFolder = 'Uncategorized'; // Default, will be updated or replaced by user action
          if (apiKey && folderNames.length > 0) { // Only auto-categorize if API key is present AND folders exist
              const categorizedFolders = await categorizePost(newPost, folders);
              // Find which folder the newPost was actually added to.
              // This is a bit tricky, as categorizePost modifies `folders` in place and returns it.
              // We need to find the specific folder where this 'newPost' landed.
              for (const fName in categorizedFolders) {
                  if (categorizedFolders[fName].some(p => p.url === newPost.url && p.timestamp === newPost.timestamp)) {
                      targetFolder = fName;
                      break;
                  }
              }
              folders = categorizedFolders; // Update folders with categorized data
          } else {
             // If no API key or no custom folders, ask user to choose or create
             chrome.notifications.create({
                type: 'basic',
                iconUrl: 'images/icon48.png',
                title: 'Clipboard Link Saver',
                message: 'Link saved to default location. Open tab to assign to a folder!',
                priority: 0
             });
             // We'll temporarily store it somewhere that the tab.js can pick up to prompt the user.
             // For now, let's stick to "Uncategorized" internally if no API/folders,
             // and tab.js will let them move it.
             if (!folders['Uncategorized']) folders['Uncategorized'] = [];
             folders['Uncategorized'].push(newPost);
          }
          
          chrome.storage.local.set({ folders }, () => {
            console.log('Link saved and categorized/defaulted:', text);
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'images/icon48.png',
              title: 'Clipboard Link Saver',
              message: `Link "${newPost.title.substring(0, 50)}..." saved!`,
              priority: 0
            });
          });
        });
      } else {
        console.log("Clipboard content is not a valid URL:", text);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: 'Clipboard Link Saver',
          message: 'Clipboard content is not a valid URL. Please copy a link.',
          priority: 0
        });
      }
    } catch (err) {
      console.error('Failed to read clipboard contents:', err);
      let errorMessage = 'Could not read clipboard.';
      if (err.message.includes('permission')) {
          errorMessage += ' Ensure the current page has permission to read clipboard.';
      } else if (err.message.includes('No active tab')) {
          errorMessage += ' No active tab found.';
      }
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'images/icon48.png',
        title: 'Clipboard Link Saver',
        message: errorMessage,
        priority: 0
      });
    }
  }
});

// Listener for messages from tab.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'reevaluatePostsForNewFolder') {
    console.log(`Received reevaluatePostsForNewFolder action for folder: ${request.folderName}`);
    reevaluatePosts(request.folderName);
  } else if (request.action === 'notifyUser') { // Generic notification from tab.js
      chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: 'Clipboard Link Saver',
          message: request.message,
          priority: 0
      });
  }
});


// Function to categorize post using GPT
async function categorizePost(post, currentFolders) {
  const result = await chrome.storage.sync.get('apiKey');
  const apiKey = result.apiKey;

  // No API key check here, assumed to be handled before calling this.
  // This function assumes an API key IS present.

  let folderNames = Object.keys(currentFolders);
  if (folderNames.length === 0) { // Should not happen if API key is present and we're categorizing
      console.warn('No folders available for categorization. Defaulting to first folder if it exists, or skipping.');
      return currentFolders; // Cannot categorize without folders
  }
  
  const prompt = `Categorize the following link into one of these folders: ${folderNames.join(', ')}. If none are a good fit, return 'Uncategorized'.\n\nLink: ${post.url}\nTitle: ${post.title || 'N/A'}\nDescription: ${post.description || 'N/A'}\n\nCategory:`;

  let category = folderNames[0]; // Default to first folder if AI fails or no "Uncategorized"
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
        temperature: 0.5
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      let gptCategory = data.choices[0].message.content.trim();
      gptCategory = gptCategory.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      
      // Ensure suggested category actually exists, otherwise default to first folder
      if (currentFolders[gptCategory]) {
          category = gptCategory;
      } else {
          console.warn(`GPT suggested non-existent folder "${gptCategory}". Falling back to first folder "${folderNames[0]}".`);
          category = folderNames[0];
      }
    }
    
  } catch (error) {
    console.error('GPT API call failed:', error);
    // If API fails, keep the default category (first folder)
  }

  currentFolders[category] = currentFolders[category] || [];
  currentFolders[category].push(post);

  return currentFolders;
}

// Function for re-evaluating posts when a new folder is created
async function reevaluatePosts(newFolderName) {
  console.log(`Starting re-evaluation for posts due to new folder: ${newFolderName}`);
  const result = await chrome.storage.local.get(['folders']);
  let folders = result.folders || {};
  const apiKeyResult = await chrome.storage.sync.get('apiKey');
  const apiKey = apiKeyResult.apiKey;

  if (!apiKey) {
    console.warn('API key not found for re-evaluation. Skipping re-evaluation.');
    return;
  }

  let allPosts = [];
  for (const folderName in folders) {
      folders[folderName].forEach(post => {
          allPosts.push({ ...post, currentFolder: folderName });
      });
  }
  
  // Clear all existing folders to rebuild them
  folders = {};

  // Re-categorize each post
  for (const post of allPosts) {
      const updatedFoldersAfterCategorization = await categorizePost(post, folders);
      folders = updatedFoldersAfterCategorization;
  }
  
  chrome.storage.local.set({ folders }, () => {
    console.log(`Links re-evaluated with new folder "${newFolderName}".`);
  });
}