chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePost') {
    // Retrieve existing posts from storage
    chrome.storage.local.get(['savedPosts'], (result) => {
      let posts = result.savedPosts || [];
      const newPost = {
        url: request.url,
        content: request.content,
        timestamp: new Date().toISOString()
      };
      
      posts.push(newPost);
      
      // Save the updated list back to storage
      chrome.storage.local.set({ savedPosts: posts }, () => {
        console.log('Post saved successfully!');
      });
    });
  }
});