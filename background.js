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

// --- UPDATED: Function to fetch and parse metadata for a URL by injecting script into active tab ---
async function fetchAndParseMetadata(url) {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            console.warn("No active tab found to delegate metadata parsing. Falling back to basic info.");
            return { title: '', description: '', image: '', siteName: new URL(url).hostname };
        }
        const activeTabId = tabs[0].id;

        // Function to be injected and executed in the target tab
        // It's crucial this function is self-contained and serializable
        const metadataExtractionFunction = async (targetUrl) => {
            try {
                const response = await fetch(targetUrl);
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
                const siteName = getMetaContent('og:site_name') || doc.querySelector('meta[name="application-name"]')?.getAttribute('content') || new URL(targetUrl).hostname;

                return { title, description, image, siteName, success: true };
            } catch (error) {
                console.error('Injected script: Error fetching or parsing metadata for', targetUrl, error);
                const fallbackSiteName = new URL(targetUrl).hostname; // Ensure URL is always defined here
                return { title: '', description: '', image: '', siteName: fallbackSiteName, success: false, error: error.message };
            }
        };

        const results = await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            function: metadataExtractionFunction,
            args: [url] // Pass the URL as an argument to the injected function
        });
        
        if (results && results[0] && results[0].result) {
            const metadata = results[0].result;
            if (metadata.success) {
                return {
                    title: metadata.title || '',
                    description: metadata.description || '',
                    image: metadata.image || '',
                    siteName: metadata.siteName || new URL(url).hostname
                };
            } else {
                console.error('Failed to get metadata from injected script:', metadata.error);
                return { title: '', description: '', image: '', siteName: new URL(url).hostname }; // Fallback
            }
        } else {
            console.error('No results or invalid results from injected metadata script.');
            return { title: '', description: '', image: '', siteName: new URL(url).hostname }; // Fallback
        }
    } catch (error) {
        console.error('Error in background script orchestrating metadata parsing for', url, error);
        return { title: '', description: '', image: '', siteName: new URL(url).hostname }; // Fallback
    }
}


// Listener for extension icon click to open tab.html
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
          // Filter out any existing 'Uncategorized' if it somehow got created previously
          let folderNames = Object.keys(folders).filter(name => name !== 'Uncategorized'); 

          // --- Fetch metadata using the new delegated function ---
          const metadata = await fetchAndParseMetadata(text);

          const newPost = {
            id: Date.now().toString(), // Unique ID for each post
            url: text,
            title: metadata.title || text, // Use title from metadata, fallback to URL
            description: metadata.description || '',
            image: metadata.image || '',
            siteName: metadata.siteName || new URL(text).hostname,
            timestamp: new Date().toISOString(),
            tags: [], // Initialize with empty tags
            aiCategorized: false, // Flag if AI categorized it
            views: 0 // Initialize views
          };

          const apiKeyResult = await chrome.storage.sync.get('apiKey');
          const apiKey = apiKeyResult.apiKey;

          // --- Handle no folders scenario / categorization ---
          if (folderNames.length === 0) {
              chrome.notifications.create({
                  type: 'basic',
                  iconUrl: 'images/icon48.png',
                  title: 'Clipboard Link Saver',
                  message: 'No folders found. Please open the main UI tab and create a folder.',
                  priority: 1
              });
              console.log("No folders created. Skipping save.");
              return; // Crucially, stop here if no folders exist
          }

          let targetFolder = folderNames[0]; // Default to the first created folder if no AI or API key issue
          if (apiKey) { 
              const categorizedFolders = await categorizePost(newPost, folders);
              // Find which folder the newPost was actually added to.
              for (const fName in categorizedFolders) {
                  if (categorizedFolders[fName].some(p => p.url === newPost.url && p.timestamp === newPost.timestamp)) {
                      targetFolder = fName;
                      newPost.aiCategorized = true; // Mark as AI categorized
                      break;
                  }
              }
              folders = categorizedFolders; // Update folders with categorized data
          } else {
             // If no API key, default to the first folder created
             if (!folders[targetFolder]) { // Should ideally exist due to `folderNames.length === 0` check above
                 folders[targetFolder] = [];
             }
             folders[targetFolder].push(newPost);
          }
          
          chrome.storage.local.set({ folders }, () => {
            console.log(`Link saved to "${targetFolder}" folder:`, text);
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'images/icon48.png',
              title: 'Clipboard Link Saver',
              message: `Link "${newPost.title.substring(0, 50)}..." saved to "${targetFolder}"!`,
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

// Listener for messages from tab.js and apikey_popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'reevaluatePostsForNewFolder') {
    console.log(`Received reevaluatePostsForNewFolder action for folder: ${request.folderName}`);
    reevaluatePosts(request.folderName);
  } else if (request.action === 'notifyUser') { // Generic notification
      chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon48.png',
          title: 'Clipboard Link Saver',
          message: request.message,
          priority: 0
      });
  } else if (request.action === 'getApiKeyStatus') {
      chrome.storage.sync.get('apiKey', (data) => {
          sendResponse({ hasApiKey: !!data.apiKey });
      });
      return true; // Indicates asynchronous response
  } else if (request.action === 'setApiKey') {
      chrome.storage.sync.set({ apiKey: request.apiKey }, () => {
          sendResponse({ success: true });
      });
      return true; // Indicates asynchronous response
  } else if (request.action === 'removeApiKey') {
      chrome.storage.sync.remove('apiKey', () => {
          sendResponse({ success: true });
      });
      return true; // Indicates asynchronous response
  } else if (request.action === 'updatePostViews') {
      chrome.storage.local.get(['folders'], (result) => {
          let folders = result.folders || {};
          let changed = false;
          for (const folderName in folders) {
              const postIndex = folders[folderName].findIndex(p => p.id === request.postId);
              if (postIndex !== -1) {
                  folders[folderName][postIndex].views = (folders[folderName][postIndex].views || 0) + 1;
                  changed = true;
                  break;
              }
          }
          if (changed) {
              chrome.storage.local.set({ folders });
          }
      });
  }
});


// Function to categorize post using GPT
async function categorizePost(post, currentFolders) {
  const result = await chrome.storage.sync.get('apiKey');
  const apiKey = result.apiKey;

  if (!apiKey) {
    console.warn('API key not found during categorization. Skipping AI categorization and returning current folders.');
    return currentFolders; // Do not categorize if no API key
  }

  // Filter out any existing 'Uncategorized' when getting folder names for AI
  let folderNames = Object.keys(currentFolders).filter(name => name !== 'Uncategorized'); 
  
  if (folderNames.length === 0) {
      console.warn('No custom folders available for categorization. Link cannot be AI categorized.');
      // If no custom folders, we can't categorize.
      // We will fall back to adding to the first-created folder in the calling function.
      return currentFolders; 
  }
  
  const prompt = `Categorize the following link into one of these folders: ${folderNames.join(', ')}. Return only the folder name. If none are a good fit, return the name of the most generally applicable folder from the list.\n\nLink: ${post.url}\nTitle: ${post.title || 'N/A'}\nDescription: ${post.description || 'N/A'}\n\nCategory:`;

  let category = folderNames[0]; // Default to the first folder if AI fails

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
          category = folderNames[0]; // Fallback to first custom folder
      }
    }
    
  } catch (error) {
    console.error('GPT API call failed:', error);
    // If API fails, keep the default category (first custom folder)
  }

  // Ensure the target folder exists and add the post
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
  // Extract all posts and then clear all folders
  for (const folderName in folders) {
      folders[folderName].forEach(post => {
          allPosts.push({ ...post, currentFolder: folderName });
      });
  }
  
  // Clear all existing folders before rebuilding
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