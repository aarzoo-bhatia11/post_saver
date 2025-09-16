chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePost') {
    chrome.storage.local.get(['folders'], async (result) => {
      let folders = result.folders || {};

      const newPost = {
        url: request.url,
        content: request.content || request.url, // Ensure content has a value
        timestamp: new Date().toISOString()
      };
      
      // Ensure 'Uncategorized' exists initially if no other folders
      if (!folders['Uncategorized']) {
          folders['Uncategorized'] = [];
      }

      // Categorize the post using GPT
      const categorizedFolders = await categorizePost(newPost, folders);
      chrome.storage.local.set({ folders: categorizedFolders });
      sendResponse({ status: 'Post saved and categorized!' }); // Acknowledge message
    });
    return true; // Indicate that sendResponse will be called asynchronously
  } else if (request.action === 'reevaluatePostsForNewFolder') {
      reEvaluatePosts(request.folderName);
  }
});

// Function to categorize post using GPT
async function categorizePost(post, currentFolders) {
  const result = await chrome.storage.sync.get('apiKey');
  const apiKey = result.apiKey;

  if (!apiKey) {
    console.warn('API key not found. Post will be added to "Uncategorized".');
    // If no API key, default to 'Uncategorized'
    currentFolders['Uncategorized'] = currentFolders['Uncategorized'] || [];
    currentFolders['Uncategorized'].push(post);
    return currentFolders;
  }

  // Exclude 'Uncategorized' from GPT's choice list unless it's the only option
  let folderNames = Object.keys(currentFolders).filter(name => name !== 'Uncategorized');
  if (folderNames.length === 0) { // If only Uncategorized exists
      folderNames = ['Uncategorized'];
  }
  
  const prompt = `Categorize the following link into one of these folders: ${folderNames.join(', ')}. If none are a good fit, return 'Uncategorized'.\n\nLink: ${post.url}\nContent: ${post.content || 'No specific content available, consider URL.'}\n\nCategory:`;

  let category = 'Uncategorized'; // Default category if GPT fails or no API key

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
        max_tokens: 50, // Keep response concise
        temperature: 0.5 // Some creativity but focused
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      // Clean the response to match a folder name
      let gptCategory = data.choices[0].message.content.trim();
      gptCategory = gptCategory.replace(/[^a-zA-Z0-9\s]/g, '').trim(); // Remove punctuation
      
      // Check if GPT suggested an existing folder or 'Uncategorized'
      if (currentFolders[gptCategory] || gptCategory === 'Uncategorized') {
          category = gptCategory;
      } else {
          console.warn(`GPT suggested non-existent folder "${gptCategory}". Falling back to "Uncategorized".`);
      }
    }
    
  } catch (error) {
    console.error('GPT API call failed:', error);
    // Fallback to 'Uncategorized' on API error
  }

  // Add the post to the determined category
  currentFolders[category] = currentFolders[category] || [];
  currentFolders[category].push(post);

  return currentFolders;
}

// Function for re-evaluating posts when a new folder is created
async function reEvaluatePosts(newFolderName) {
  const result = await chrome.storage.local.get(['folders']);
  let folders = result.folders || {};
  const apiKeyResult = await chrome.storage.sync.get('apiKey');
  const apiKey = apiKeyResult.apiKey;

  if (!apiKey) {
    console.warn('API key not found for re-evaluation. Skipping re-evaluation.');
    return;
  }

  // Temporarily flatten all posts to re-evaluate them
  let allPosts = [];
  for (const folderName in folders) {
      folders[folderName].forEach(post => {
          allPosts.push({ ...post, currentFolder: folderName });
      });
      folders[folderName] = []; // Clear all folders temporarily
  }

  // Re-categorize each post against the updated set of folders
  for (const post of allPosts) {
      const updatedFoldersAfterCategorization = await categorizePost(post, folders);
      folders = updatedFoldersAfterCategorization; // Update folders in loop
  }
  
  chrome.storage.local.set({ folders }, () => {
    console.log(`Posts re-evaluated with new folder "${newFolderName}".`);
  });
}