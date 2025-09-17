document.addEventListener('DOMContentLoaded', () => {
  const postsContainer = document.getElementById('posts-container');
  const foldersContainer = document.getElementById('folders-container');
  const addFolderBtn = document.getElementById('add-folder-btn');
  const newFolderNameInput = document.getElementById('new-folder-name');
  const apiKeyContainer = document.getElementById('api-key-container');
  const addFolderToggleBtn = document.getElementById('add-folder-toggle');
  const addFolderSection = document.getElementById('add-folder-section');
  const optionsBtn = document.getElementById('options-btn');
  const currentFolderTitle = document.getElementById('current-folder-title');
  const noFolderMessage = document.querySelector('.no-folder-message');

  let currentSelectedFolder = 'All'; // Default view

  // --- Initial Render and Setup ---
  checkApiKeyAndRender();
  renderAllData();

  // --- Event Listeners ---
  addFolderToggleBtn.addEventListener('click', () => {
    addFolderSection.style.display = addFolderSection.style.display === 'none' ? 'flex' : 'none';
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  addFolderBtn.addEventListener('click', () => {
    const folderName = newFolderNameInput.value.trim();
    if (folderName) {
      chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        if (!folders[folderName]) {
          folders[folderName] = [];
          chrome.storage.local.set({ folders }, () => {
            newFolderNameInput.value = '';
            addFolderSection.style.display = 'none'; // Hide after adding
            // Re-evaluate existing posts for categorization into the new folder
            chrome.runtime.sendMessage({ action: 'reevaluatePostsForNewFolder', folderName });
            chrome.runtime.sendMessage({ action: 'notifyUser', message: `Folder "${folderName}" created!`});
          });
        } else {
          alert('Folder already exists!');
        }
      });
    }
  });

  // --- Storage Change Listener for Auto-Refresh ---
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.folders) {
      console.log("Storage 'folders' changed, refreshing tab UI.");
      renderAllData();
      checkApiKeyAndRender(); // Re-check if folder message needs to be shown
    }
    if (namespace === 'sync' && changes.apiKey) {
        checkApiKeyAndRender(); // Re-check API key status
    }
  });

  // --- Render Functions ---

  function checkApiKeyAndRender() {
    chrome.storage.sync.get('apiKey', (data) => {
      chrome.storage.local.get('folders', (result) => {
        const folders = result.folders || {};
        const folderCount = Object.keys(folders).length;

        if (!data.apiKey) {
          apiKeyContainer.innerHTML = `
            <div class="api-key-warning">
              AI categorization disabled. <a href="#" id="options-link">Configure API key</a> to enable automatic folder suggestions.
            </div>
          `;
          document.getElementById('options-link').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
          });

          if (folderCount === 0) {
            noFolderMessage.style.display = 'block';
            postsContainer.querySelector('p:first-of-type').style.display = 'none'; // Hide initial no links message
          } else {
            noFolderMessage.style.display = 'none';
            postsContainer.querySelector('p:first-of-type').style.display = 'block';
          }
        } else {
          apiKeyContainer.innerHTML = ''; // Hide warning if API key is present
          noFolderMessage.style.display = 'none';
          postsContainer.querySelector('p:first-of-type').style.display = 'block';
        }
      });
    });
  }

  function renderFolders(folders) {
    const folderListContainer = document.createElement('div');
    folderListContainer.className = 'folder-list';
    
    // "All Links" button
    const allLinksBtn = document.createElement('button');
    allLinksBtn.classList.add('folder-nav-button');
    if (currentSelectedFolder === 'All') allLinksBtn.classList.add('active');
    allLinksBtn.textContent = 'All Links';
    allLinksBtn.addEventListener('click', () => {
      currentSelectedFolder = 'All';
      renderAllData();
    });
    folderListContainer.appendChild(allLinksBtn);

    if (Object.keys(folders).length > 0) {
      for (const folderName in folders) {
        const button = document.createElement('button');
        button.classList.add('folder-nav-button');
        if (currentSelectedFolder === folderName) button.classList.add('active');
        button.textContent = folderName;
        button.addEventListener('click', () => {
          currentSelectedFolder = folderName;
          renderAllData();
        });

        const deleteIcon = document.createElement('span');
        deleteIcon.classList.add('delete-btn');
        deleteIcon.textContent = ' 🗑️'; // Added space for visual separation
        deleteIcon.title = `Delete folder "${folderName}"`;
        deleteIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent folder button click
            deleteFolder(folderName);
        });
        button.appendChild(deleteIcon);
        
        folderListContainer.appendChild(button);
      }
      foldersContainer.innerHTML = '';
      foldersContainer.appendChild(folderListContainer);

    } else {
      foldersContainer.innerHTML = '<p>No folders created. Create one above to start saving links!</p>';
    }
  }

  function deleteFolder(folderName) {
    if (confirm(`Are you sure you want to delete the folder "${folderName}"? All links inside will be moved to "Uncategorized".`)) {
      chrome.storage.local.get(['folders'], (result) => {
        let folders = result.folders || {};
        const postsToMove = folders[folderName] || [];
        
        delete folders[folderName];
        
        // Ensure "Uncategorized" exists to move posts into
        if (postsToMove.length > 0) {
            folders['Uncategorized'] = [...(folders['Uncategorized'] || []), ...postsToMove];
        }

        chrome.storage.local.set({ folders }, () => {
          if (currentSelectedFolder === folderName) {
            currentSelectedFolder = 'All'; // Switch view if deleted folder was active
          }
          chrome.runtime.sendMessage({ action: 'notifyUser', message: `Folder "${folderName}" deleted.`});
          renderAllData(); // Re-render to reflect changes
        });
      });
    }
  }

  function renderAllData() {
    chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        renderFolders(folders);

        postsContainer.innerHTML = ''; // Clear previous content

        let postsToDisplay = [];
        if (currentSelectedFolder === 'All') {
            for (const folderName in folders) {
                folders[folderName].forEach(post => {
                    postsToDisplay.push({ ...post, folder: folderName });
                });
            }
            currentFolderTitle.textContent = 'All Saved Links';
        } else if (folders[currentSelectedFolder]) {
            postsToDisplay = folders[currentSelectedFolder].map(post => ({ ...post, folder: currentSelectedFolder }));
            currentFolderTitle.textContent = `Folder: ${currentSelectedFolder}`;
        } else {
            currentFolderTitle.textContent = 'All Saved Links'; // Fallback if selected folder was deleted
            currentSelectedFolder = 'All';
            for (const folderName in folders) {
                folders[folderName].forEach(post => {
                    postsToDisplay.push({ ...post, folder: folderName });
                });
            }
        }
        
        // Sort posts by timestamp, newest first
        postsToDisplay.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (postsToDisplay.length > 0) {
            const ul = document.createElement('ul');
            postsToDisplay.forEach(post => {
                const li = document.createElement('li');
                li.className = 'link-card';
                li.innerHTML = `
                    ${post.image ? `<img src="${post.image}" alt="${post.title}" class="link-image">` : ''}
                    <div class="link-content">
                        <a href="${post.url}" target="_blank" class="link-title">${post.title || post.url}</a>
                        <p class="link-description">${post.description || ''}</p>
                        <small class="link-meta">
                            ${post.siteName ? `<span class="link-site-name">${post.siteName}</span> • ` : ''}
                            Saved: ${new Date(post.timestamp).toLocaleDateString()}
                            <span class="link-folder">(Folder: ${post.folder})</span>
                        </small>
                        <div class="link-actions">
                            <button class="move-post-btn" data-post-url="${post.url}" data-current-folder="${post.folder}">Move to...</button>
                            <button class="delete-post-btn" data-post-url="${post.url}" data-current-folder="${post.folder}">Delete</button>
                        </div>
                    </div>
                `;
                ul.appendChild(li);
            });
            postsContainer.appendChild(ul);
            addMovePostListeners(folders);
            addDeletePostListeners();
        } else {
            postsContainer.innerHTML += '<p>No links in this folder. Copy a link and press <kbd>Ctrl+Shift+L</kbd> (Windows) or <kbd>Cmd+Shift+L</kbd> (Mac) to save.</p>';
            if (Object.keys(folders).length === 0) {
                 noFolderMessage.style.display = 'block';
                 postsContainer.querySelector('p:last-of-type').style.display = 'none'; // Hide if no folders exist
            }
        }
    });
  }

  function addMovePostListeners(folders) {
    document.querySelectorAll('.move-post-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const postUrl = e.target.dataset.postUrl;
            const currentFolder = e.target.dataset.currentFolder;
            const folderNames = Object.keys(folders);
            
            const otherFolderNames = folderNames.filter(name => name !== currentFolder).join(', ');

            const newFolderName = prompt(`Move link to (current: ${currentFolder}). Enter a folder name:\n\nAvailable folders: ${otherFolderNames}\n\nType a new name to create and move.`);

            if (newFolderName) {
                if (newFolderName === currentFolder) {
                    chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Link is already in that folder.'});
                    return;
                }

                chrome.storage.local.get(['folders'], (result) => {
                    let updatedFolders = result.folders || {};

                    let postToMove = null;
                    // Find post in current folder and remove it
                    const indexInCurrent = updatedFolders[currentFolder].findIndex(p => p.url === postUrl);
                    if (indexInCurrent !== -1) {
                        postToMove = updatedFolders[currentFolder].splice(indexInCurrent, 1)[0];
                    }

                    if (postToMove) {
                        // Add post to new folder (create if it doesn't exist)
                        updatedFolders[newFolderName] = updatedFolders[newFolderName] || [];
                        updatedFolders[newFolderName].push(postToMove);
                        
                        chrome.storage.local.set({ folders: updatedFolders }, () => {
                            if (!folderNames.includes(newFolderName)) {
                                chrome.runtime.sendMessage({ action: 'reevaluatePostsForNewFolder', folderName: newFolderName });
                            }
                            chrome.runtime.sendMessage({ action: 'notifyUser', message: `Link moved to "${newFolderName}".`});
                            // renderAllData() will be called by storage.onChanged
                        });
                    } else {
                        chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Error: Link not found in its current folder.'});
                    }
                });
            }
        });
    });
  }

  function addDeletePostListeners() {
    document.querySelectorAll('.delete-post-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const postUrl = e.target.dataset.postUrl;
        const currentFolder = e.target.dataset.currentFolder;

        if (confirm('Are you sure you want to delete this link?')) {
          chrome.storage.local.get(['folders'], (result) => {
            let folders = result.folders || {};
            if (folders[currentFolder]) {
              folders[currentFolder] = folders[currentFolder].filter(post => post.url !== postUrl);
              chrome.storage.local.set({ folders }, () => {
                chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Link deleted.'});
                // renderAllData() will be called by storage.onChanged
              });
            }
          });
        }
      });
    });
  }

});