document.addEventListener('DOMContentLoaded', () => {
  const foldersContainer = document.getElementById('folders-container');
  const addFolderButton = document.getElementById('add-folder-button');
  const addFolderInputArea = document.getElementById('add-folder-input-area');
  const newFolderNameInput = document.getElementById('new-folder-name');
  const createFolderBtn = document.getElementById('create-folder-btn');
  const apiKeyStatusBar = document.getElementById('api-key-status');
  const configureApiKeyLink = document.getElementById('configure-api-key-link');
  const postsContainer = document.getElementById('posts-container');
  const currentFolderTitle = document.getElementById('current-folder-title');
  const totalLinksCountSpan = document.getElementById('total-links-count');
  const folderCountSpan = document.getElementById('folder-count');
  const lastSavedTimeSpan = document.getElementById('last-saved-time');
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const initialMessage = document.querySelector('.initial-message');
  const noAIFoldersMessage = document.querySelector('.no-ai-folders-message');

  const moveButtonDropdown = document.getElementById('move-to-dropdown');
  const moveToFolderOptions = document.getElementById('move-to-folder-options');
  const moveCancelBtn = document.getElementById('move-cancel-btn');

  const addTagsModal = document.getElementById('add-tags-modal');
  const tagInput = document.getElementById('tag-input');
  const saveTagsBtn = document.getElementById('save-tags-btn');
  const cancelTagsBtn = document.getElementById('cancel-tags-btn');

  let currentSelectedFolder = 'All Links';
  let activeMovePost = null;
  let activeTagPost = null;
  let currentSearchTerm = '';

  // --- Initial Render and Setup ---
  checkApiKeyStatus();
  renderAllData();

  // --- Event Listeners ---
  addFolderButton.addEventListener('click', () => {
    addFolderInputArea.style.display = addFolderInputArea.style.display === 'none' ? 'flex' : 'none';
    if (addFolderInputArea.style.display === 'flex') {
      newFolderNameInput.focus();
    }
  });

  createFolderBtn.addEventListener('click', () => {
    const folderName = newFolderNameInput.value.trim();
    if (folderName && folderName !== 'All Links' && folderName !== 'Uncategorized') {
      chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        if (!folders[folderName]) {
          folders[folderName] = [];
          chrome.storage.local.set({ folders }, () => {
            newFolderNameInput.value = '';
            addFolderInputArea.style.display = 'none';
            chrome.runtime.sendMessage({ action: 'reevaluatePostsForNewFolder', folderName });
            chrome.runtime.sendMessage({ action: 'notifyUser', message: `Folder "${folderName}" created!`});
          });
        } else {
          alert('Folder already exists!');
        }
      });
    } else if (folderName === 'All Links' || folderName === 'Uncategorized') {
        alert('This is a reserved name. Please choose a different folder name.');
    }
  });

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim().toLowerCase();
    renderAllData();
  });

  searchButton.addEventListener('click', () => {
    currentSearchTerm = searchInput.value.trim().toLowerCase();
    renderAllData();
  });

  // Clear search when Enter is pressed on empty input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentSearchTerm = searchInput.value.trim().toLowerCase();
      renderAllData();
    }
  });

  configureApiKeyLink.addEventListener('click', (e) => {
    e.preventDefault();
    const width = 400;
    const height = 300;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    chrome.windows.create({
      url: chrome.runtime.getURL("apikey_popup.html"),
      type: "popup",
      width: width,
      height: height,
      left: Math.round(left),
      top: Math.round(top)
    });
  });

  // Listener for storage changes to auto-refresh UI
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.folders) {
      console.log("Storage 'folders' changed, refreshing UI.");
      renderAllData();
      checkApiKeyStatus();
    }
    if (namespace === 'sync' && changes.apiKey) {
        checkApiKeyStatus();
    }
  });

  // --- Move To Dropdown Logic ---
  moveCancelBtn.addEventListener('click', () => {
      moveButtonDropdown.style.display = 'none';
      activeMovePost = null;
  });

  moveToFolderOptions.addEventListener('click', (e) => {
      if (e.target.classList.contains('dropdown-option') && activeMovePost) {
          const newFolderName = e.target.dataset.folderName;
          const { postId, currentFolder } = activeMovePost;

          if (newFolderName === currentFolder) {
              chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Link is already in that folder.' });
              moveButtonDropdown.style.display = 'none';
              activeMovePost = null;
              return;
          }

          chrome.storage.local.get(['folders'], (result) => {
              let folders = result.folders || {};

              let postToMove = null;
              const indexInCurrent = folders[currentFolder].findIndex(p => p.id === postId);
              if (indexInCurrent !== -1) {
                  postToMove = folders[currentFolder].splice(indexInCurrent, 1)[0];
              }

              if (postToMove) {
                  folders[newFolderName] = folders[newFolderName] || [];
                  folders[newFolderName].push(postToMove);
                  
                  chrome.storage.local.set({ folders }, () => {
                      chrome.runtime.sendMessage({ action: 'notifyUser', message: `Link moved to "${newFolderName}".` });
                      moveButtonDropdown.style.display = 'none';
                      activeMovePost = null;
                  });
              } else {
                  chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Error: Link not found in its current folder.' });
                  moveButtonDropdown.style.display = 'none';
                  activeMovePost = null;
              }
          });
      }
  });

  // --- Add Tags Modal Logic ---
  cancelTagsBtn.addEventListener('click', () => {
      addTagsModal.style.display = 'none';
      activeTagPost = null;
      tagInput.value = '';
  });

  saveTagsBtn.addEventListener('click', () => {
      if (activeTagPost) {
          const newTags = tagInput.value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          const { postId, currentFolder } = activeTagPost;

          chrome.storage.local.get(['folders'], (result) => {
              let folders = result.folders || {};
              const postIndex = folders[currentFolder].findIndex(p => p.id === postId);

              if (postIndex !== -1) {
                  folders[currentFolder][postIndex].tags = newTags;
                  chrome.storage.local.set({ folders }, () => {
                      chrome.runtime.sendMessage({ action: 'notifyUser', message: `Tags updated for link!` });
                      addTagsModal.style.display = 'none';
                      activeTagPost = null;
                      tagInput.value = '';
                  });
              } else {
                  chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Error: Link not found to update tags.' });
                  addTagsModal.style.display = 'none';
                  activeTagPost = null;
                  tagInput.value = '';
              }
          });
      }
  });


  // --- Render Functions ---
  async function checkApiKeyStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'getApiKeyStatus' });
    const hasApiKey = response.hasApiKey;

    chrome.storage.local.get('folders', (result) => {
      const folders = result.folders || {};
      const folderCount = Object.keys(folders).length;

      if (!hasApiKey) {
        apiKeyStatusBar.style.display = 'flex';
        if (folderCount === 0) {
            noAIFoldersMessage.style.display = 'block';
            initialMessage.style.display = 'none';
        } else {
            noAIFoldersMessage.style.display = 'none';
            initialMessage.style.display = 'none';
        }
      } else {
        apiKeyStatusBar.style.display = 'none';
        noAIFoldersMessage.style.display = 'none';
        initialMessage.style.display = 'none';
      }
      if (folderCount > 0 && getAllPosts(folders).length === 0) {
        initialMessage.style.display = 'block';
      } else if (getAllPosts(folders).length > 0) {
        initialMessage.style.display = 'none';
      }
    });
  }

  function renderFolders(folders) {
    foldersContainer.innerHTML = '';

    const allLinksBtn = document.createElement('button');
    allLinksBtn.classList.add('folder-item');
    if (currentSelectedFolder === 'All Links') allLinksBtn.classList.add('active');
    allLinksBtn.innerHTML = `
      <span class="folder-name">All Links</span>
      <span class="folder-count">${getAllPosts(folders).length}</span>
    `;
    allLinksBtn.addEventListener('click', () => {
      currentSelectedFolder = 'All Links';
      renderAllData();
    });
    foldersContainer.appendChild(allLinksBtn);

    const folderNames = Object.keys(folders).sort();
    if (folderNames.length > 0) {
      folderNames.forEach(folderName => {
        const button = document.createElement('button');
        button.classList.add('folder-item');
        if (currentSelectedFolder === folderName) button.classList.add('active');
        button.innerHTML = `
          <span class="folder-name">${folderName}</span>
          <span class="folder-count">${folders[folderName].length}</span>
          <span class="delete-folder-btn" data-folder-name="${folderName}">×</span>
        `;
        button.addEventListener('click', (e) => {
          if (!e.target.classList.contains('delete-folder-btn')) {
            currentSelectedFolder = folderName;
            renderAllData();
          }
        });
        foldersContainer.appendChild(button);
      });
      addDeleteFolderListeners();
    }
  }

  function addDeleteFolderListeners() {
    foldersContainer.querySelectorAll('.delete-folder-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderName = e.target.dataset.folderName;
        deleteFolder(folderName);
      });
    });
  }

  function deleteFolder(folderName) {
    if (confirm(`Are you sure you want to delete the folder "${folderName}"? All links inside will be permanently deleted.`)) {
      chrome.storage.local.get(['folders'], (result) => {
        let folders = result.folders || {};
        delete folders[folderName];
        chrome.storage.local.set({ folders }, () => {
          if (currentSelectedFolder === folderName) {
            currentSelectedFolder = 'All Links';
          }
          chrome.runtime.sendMessage({ action: 'notifyUser', message: `Folder "${folderName}" and its links deleted.` });
          renderAllData();
        });
      });
    }
  }

  function getAllPosts(folders) {
      let all = [];
      for (const folderName in folders) {
          all = all.concat(folders[folderName].map(post => ({ ...post, folder: folderName })));
      }
      return all;
  }

  function renderAllData() {
    chrome.storage.local.get(['folders'], (result) => {
        const folders = result.folders || {};
        renderFolders(folders);

        postsContainer.innerHTML = '';
        
        let postsToDisplay = [];
        let folderTitle = '';

        if (currentSelectedFolder === 'All Links') {
            postsToDisplay = getAllPosts(folders);
            folderTitle = 'All Saved Links';
        } else if (folders[currentSelectedFolder]) {
            postsToDisplay = folders[currentSelectedFolder].map(post => ({ ...post, folder: currentSelectedFolder }));
            folderTitle = `Folder: ${currentSelectedFolder}`;
        } else {
            currentSelectedFolder = 'All Links';
            postsToDisplay = getAllPosts(folders);
            folderTitle = 'All Saved Links';
        }
        
        totalLinksCountSpan.textContent = `${getAllPosts(folders).length} total links`;
        folderCountSpan.textContent = `${Object.keys(folders).length} folders`;

        // Apply search filter if there's a search term
        if (currentSearchTerm) {
            postsToDisplay = postsToDisplay.filter(post => {
                const titleMatch = (post.title || '').toLowerCase().includes(currentSearchTerm);
                const urlMatch = post.url.toLowerCase().includes(currentSearchTerm);
                const tagsMatch = (post.tags || []).some(tag => tag.toLowerCase().includes(currentSearchTerm));
                return titleMatch || urlMatch || tagsMatch;
            });
        }

        const allPostsFlat = getAllPosts(folders);
        if (allPostsFlat.length > 0) {
            allPostsFlat.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const lastSavedDate = new Date(allPostsFlat[0].timestamp);
            lastSavedTimeSpan.textContent = `Last saved ${formatTimeAgo(lastSavedDate)}`;
        } else {
            lastSavedTimeSpan.textContent = `Last saved Never`;
        }

        postsToDisplay.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (postsToDisplay.length > 0) {
            postsToDisplay.forEach(post => {
                const li = document.createElement('div');
                li.className = 'link-card';
                
                const siteHostname = post.siteName || new URL(post.url).hostname;
                const formattedDate = new Date(post.timestamp).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
                const viewsText = (post.views || 0) > 0 ? `${post.views} view${post.views === 1 ? '' : 's'}` : '0 views';
                
                // Truncate description if it's too long
                const description = post.description ? 
                    (post.description.length > 120 ? post.description.substring(0, 120) + '...' : post.description) : '';

                li.innerHTML = `
                    <div class="link-card-content">
                        ${post.image ? `<img src="${post.image}" alt="${post.title}" class="link-image">` : ''}
                        <div class="link-details">
                            <a href="${post.url}" target="_blank" class="link-title" data-post-id="${post.id}">${post.title || post.url}</a>
                            <div class="link-url">${post.url}</div>
                            ${description ? `<div class="link-description" style="font-size: 0.9em; color: #666; margin-bottom: 12px; line-height: 1.4;">${description}</div>` : ''}
                            <div class="link-meta-info">
                                <span class="meta-text">Saved ${formattedDate}</span>
                                ${post.aiCategorized ? `<span class="meta-text">AI Categorized</span>` : ''}
                                <span class="meta-text">${viewsText}</span>
                            </div>
                            <div class="link-tags">
                                ${post.tags && post.tags.length > 0 ? post.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('') : ''}
                            </div>
                            <div class="link-actions">
                                <button class="move-post-btn" data-post-id="${post.id}" data-current-folder="${post.folder}">
                                    Move
                                </button>
                                <button class="add-tags-btn" data-post-id="${post.id}" data-current-folder="${post.folder}" data-tags='${JSON.stringify(post.tags || [])}'>
                                    Tags
                                </button>
                                <button class="delete-post-btn" data-post-id="${post.id}" data-current-folder="${post.folder}">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                postsContainer.appendChild(li);
            });
            addLinkActionListeners(folders);
        } else {
            const message = currentSearchTerm ? 
                `No links found matching "${currentSearchTerm}". Try a different search term.` :
                `No links saved yet. Copy a link and press Ctrl+Shift+L (Windows) or Cmd+Shift+L (Mac) to save.`;
            postsContainer.innerHTML = `<p class="initial-message">${message}</p>`;
            if (Object.keys(folders).length === 0) {
                 noAIFoldersMessage.style.display = 'block';
                 postsContainer.querySelector('p:last-of-type').style.display = 'none';
            }
        }
    });
  }

  function addLinkActionListeners(folders) {
    document.querySelectorAll('.link-title').forEach(link => {
        link.addEventListener('click', (e) => {
            const postId = e.target.dataset.postId;
            if (postId) {
                chrome.runtime.sendMessage({ action: 'updatePostViews', postId: postId });
            }
        });
    });

    document.querySelectorAll('.move-post-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const postId = e.target.dataset.postId;
            const currentFolder = e.target.dataset.currentFolder;
            
            activeMovePost = { postId, currentFolder };
            showMoveToDropdown(folders, currentFolder, e.target);
        });
    });

    document.querySelectorAll('.add-tags-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const postId = e.target.dataset.postId;
            const currentFolder = e.target.dataset.currentFolder;
            const existingTags = JSON.parse(e.target.dataset.tags || '[]');
            
            activeTagPost = { postId, currentFolder };
            tagInput.value = existingTags.join(', ');
            addTagsModal.style.display = 'flex';
        });
    });

    document.querySelectorAll('.delete-post-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const postId = e.target.dataset.postId;
        const currentFolder = e.target.dataset.currentFolder;

        if (confirm('Are you sure you want to delete this link?')) {
          chrome.storage.local.get(['folders'], (result) => {
            let folders = result.folders || {};
            if (folders[currentFolder]) {
              folders[currentFolder] = folders[currentFolder].filter(post => post.id !== postId);
              chrome.storage.local.set({ folders }, () => {
                chrome.runtime.sendMessage({ action: 'notifyUser', message: 'Link deleted.' });
              });
            }
          });
        }
      });
    });
  }

  function showMoveToDropdown(folders, currentFolder, targetButton) {
      moveToFolderOptions.innerHTML = '';
      const folderNames = Object.keys(folders).sort();

      folderNames.forEach(folderName => {
          if (folderName !== currentFolder) {
              const option = document.createElement('button');
              option.classList.add('dropdown-option');
              option.dataset.folderName = folderName;
              option.textContent = folderName;
              moveToFolderOptions.appendChild(option);
          }
      });

      if (folderNames.length === 1 && folderNames[0] === currentFolder) {
          moveToFolderOptions.innerHTML = '<p class="no-other-folders">No other folders to move to.</p>';
      } else if (folderNames.length === 0) {
          moveToFolderOptions.innerHTML = '<p class="no-other-folders">No folders available. Create one first!</p>';
      }

      const rect = targetButton.getBoundingClientRect();
      moveButtonDropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
      moveButtonDropdown.style.left = `${rect.left + window.scrollX}px`;
      moveButtonDropdown.style.display = 'block';
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " year" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " month" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " day" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hour" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minute" + (Math.floor(interval) === 1 ? "" : "s") + " ago";
    return Math.floor(seconds) + " second" + (Math.floor(seconds) === 1 ? "" : "s") + " ago";
  }

});