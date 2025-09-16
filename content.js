// This is a simplified example. You'll need to refine selectors for each site.
document.addEventListener('mouseup', (event) => {
  // Check if the user has selected text
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    // Send a message to the background script
    chrome.runtime.sendMessage({
      action: 'savePost',
      url: window.location.href,
      content: selectedText
    });
  }
});

// A better way would be to add a button to each post element
// Example (pseudo-code):
// const posts = document.querySelectorAll('.post-element-selector');
// posts.forEach(post => {
//   const saveButton = document.createElement('button');
//   saveButton.innerText = 'Save Post';
//   saveButton.addEventListener('click', () => {
//     chrome.runtime.sendMessage({
//       action: 'savePost',
//       url: window.location.href
//     });
//   });
//   post.appendChild(saveButton);
// });