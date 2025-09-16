document.addEventListener('DOMContentLoaded', () => {
  const postsContainer = document.getElementById('posts-container');
  const foldersContainer = document.getElementById('folders-container');
  const addFolderBtn = document.getElementById('add-folder-btn');
  const newFolderNameInput = document.getElementById('new-folder-name');
  const saveClipboardBtn = document.getElementById('save-clipboard-btn');
  const clipboardContentDisplay = document.getElementById('clipboard-content');

  // Load and render folders and posts on startup
  renderAllData();

  // --- Clipboard Functionality ---
  let currentClipboardLink = '';

  // Function to read clipboard
  async function readClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      // Basic check if it looks like a URL
      if (text.startsWith('http://') || text.startsWith('https://')) {
        currentClipboardLink = text;
        clipboardContentDisplay.textContent = `Current: ${text.substring(0, 50)}...`;
      } else {
        currentClipboardLink = '';
        clipboardContentDisplay.textContent = 'Clipboard does not contain a valid link.';
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      clipboardContentDisplay.textContent = 'Permission to read clipboard denied or no text found.';
    }
  }

  // Read clipboard immediately and on paste events
  readClipboard();
  document.addEventListener('paste', readClipboard);


  saveClipboardBtn.addEventListener('click', () => {
    if (currentClipboardLink) {
        chrome.runtime.sendMessage({
            action: 'savePost',
            url: currentClipboardLink,
            content: currentClipboardLink // Or try to fetch title later
        });
        alert('Link from clipboard sent for saving!');
        currentClipboardLink = ''; // Clear after sending
        clipboardContentDisplay.textContent = 'Paste a link here (Ctrl+V or Cmd+V).';
    } else {
        alert('No valid link found in clipboard to save.');
    }
  });


  // --- Folder Management Functionality ---
  // Add folder functionality
  addFolderBtn.addEventListener('click', () => {
    const folderName = newFolderNameInput.value.trim();
    if (folderName) {
      chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        if (!folders[folderName]) {
          folders[folderName] = []; // Create a new empty folder
          chrome.storage.local.set({ folders }, () => {
            newFolderNameInput.value = '';
            renderFolders(folders);
            // Request GPT to re-evaluate existing posts for the new folder
            chrome.runtime.sendMessage({ action: 'reevaluatePostsForNewFolder', folderName });
          });
        } else {
          alert('Folder already exists!');
        }
      });
    }
  });
  
  // Render function for folders
  function renderFolders(folders) {
    if (Object.keys(folders).length > 0) {
      foldersContainer.innerHTML = '<ul></ul>';
      const ul = foldersContainer.querySelector('ul');
      for (const folderName in folders) {
        const li = document.createElement('li');
        li.className = 'folder-item';
        li.innerHTML = `
          <span>${folderName}</span>
          <span class="delete-btn" data-folder-name="${folderName}">🗑️</span>
        `;
        ul.appendChild(li);
      }
      addFolderListeners(folders);
    } else {
      foldersContainer.innerHTML = '<p>No folders yet. Add one below!</p>';
    }
  }

  // Add listeners for folder items
  function addFolderListeners(folders) {
    foldersContainer.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) {
          deleteFolder(e.target.dataset.folderName);
        } else {
          // You can add logic to show posts within a folder here
          console.log(`Clicked on folder: ${e.target.innerText}`);
        }
      });
    });
  }

  // Delete folder functionality
  function deleteFolder(folderName) {
    if (confirm(`Are you sure you want to delete the folder "${folderName}"? All posts inside will be moved to "Uncategorized".`)) {
      chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        const uncategorizedPosts = folders[folderName] || [];
        
        // Remove the folder and move posts to 'Uncategorized'
        delete folders[folderName];
        
        // Ensure 'Uncategorized' folder exists if posts are moved into it
        if (uncategorizedPosts.length > 0) {
            folders['Uncategorized'] = [...(folders['Uncategorized'] || []), ...uncategorizedPosts];
        }

        chrome.storage.local.set({ folders }, () => {
          renderFolders(folders);
          renderAllData();
        });
      });
    }
  }

  // Render all data function (now also considers folder structure)
  function renderAllData() {
    chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        
        renderFolders(folders); // Render folders list first

        postsContainer.innerHTML = '<h4>All Saved Links</h4>';
        const ul = document.createElement('ul');
        postsContainer.appendChild(ul);

        let allPosts = [];
        for (const folderName in folders) {
            folders[folderName].forEach(post => {
                allPosts.push({ ...post, folder: folderName }); // Add folder info to each post
            });
        }

        if (allPosts.length > 0) {
            allPosts.forEach(post => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="${post.url}" target="_blank">${post.content || post.url}</a>
                    <br><small>Saved: ${new Date(post.timestamp).toLocaleDateString()} (Folder: ${post.folder})</small>
                    <button class="move-post-btn" data-post-url="${post.url}" data-current-folder="${post.folder}">Move to...</button>
                `;
                ul.appendChild(li);
            });
            addMovePostListeners(folders);
        } else {
            postsContainer.innerHTML += '<p>No posts saved yet.</p>';
        }
    });
  }

  // Add listeners for 'Move to...' buttons
  function addMovePostListeners(folders) {
    document.querySelectorAll('.move-post-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const postUrl = e.target.dataset.postUrl;
            const currentFolder = e.target.dataset.currentFolder;
            const folderNames = Object.keys(folders);
            
            // Exclude the current folder from choices for easier selection
            const otherFolderNames = folderNames.filter(name => name !== currentFolder);

            const folderChoices = otherFolderNames.join(', ');
            const newFolderName = prompt(`Move post to (current: ${currentFolder}). Enter a new folder name:\n\nAvailable folders: ${folderChoices}\n\nType "new folder name" to create and move.`);

            if (newFolderName) {
                if (newFolderName === currentFolder) {
                    alert('Post is already in that folder.');
                    return;
                }

                chrome.storage.local.get(['folders'], (result) => {
                    let updatedFolders = result.folders || {};

                    let postToMove = null;
                    const indexInCurrent = updatedFolders[currentFolder].findIndex(p => p.url === postUrl);
                    if (indexInCurrent !== -1) {
                        postToMove = updatedFolders[currentFolder].splice(indexInCurrent, 1)[0];
                    }

                    if (postToMove) {
                        if (updatedFolders[newFolderName]) {
                            // Folder exists, just push
                            updatedFolders[newFolderName].push(postToMove);
                            alert(`Post moved to "${newFolderName}".`);
                        } else {
                            // New folder, create it and add post
                            updatedFolders[newFolderName] = [postToMove];
                            alert(`New folder "${newFolderName}" created and post moved.`);
                        }
                        
                        chrome.storage.local.set({ folders: updatedFolders }, () => {
                            renderAllData();
                            // If a new folder was created, re-evaluate all posts
                            if (!folderNames.includes(newFolderName)) {
                                chrome.runtime.sendMessage({ action: 'reevaluatePostsForNewFolder', folderName: newFolderName });
                            }
                        });
                    } else {
                        alert('Error: Post not found in its current folder.');
                    }
                });
            }
        });
    });
  }

});