document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-key-btn');
  const removeApiKeyBtn = document.getElementById('remove-api-key-btn');
  const statusMessage = document.getElementById('status-message');

  // Load existing API key
  chrome.runtime.sendMessage({ action: 'getApiKeyStatus' }, (response) => {
    if (response && response.hasApiKey) {
      // Don't display actual key, just show it's configured
      apiKeyInput.value = '********** (Key configured)'; 
      removeApiKeyBtn.style.display = 'inline-block';
      apiKeyInput.disabled = true; // Disable input when key is set
      saveApiKeyBtn.textContent = 'Update Key';
      statusMessage.textContent = 'API key is currently configured.';
      statusMessage.style.color = 'green';
    }
  });

  saveApiKeyBtn.addEventListener('click', () => {
    let keyToSave = apiKeyInput.value.trim();
    if (keyToSave === '********** (Key configured)') {
        keyToSave = ''; // Don't save the placeholder if not actually changed
    }
    
    if (keyToSave) {
      chrome.runtime.sendMessage({ action: 'setApiKey', apiKey: keyToSave }, (response) => {
        if (response && response.success) {
          statusMessage.textContent = 'API key saved successfully!';
          statusMessage.style.color = 'green';
          removeApiKeyBtn.style.display = 'inline-block';
          apiKeyInput.disabled = true;
          saveApiKeyBtn.textContent = 'Update Key';
          // Auto-close after a short delay
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          statusMessage.textContent = 'Failed to save API key.';
          statusMessage.style.color = 'red';
        }
      });
    } else {
      statusMessage.textContent = 'Please enter an API key.';
      statusMessage.style.color = 'red';
    }
  });

  removeApiKeyBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to remove your OpenAI API key? AI categorization will be disabled.')) {
      chrome.runtime.sendMessage({ action: 'removeApiKey' }, (response) => {
        if (response && response.success) {
          statusMessage.textContent = 'API key removed.';
          statusMessage.style.color = 'red';
          apiKeyInput.value = '';
          apiKeyInput.disabled = false;
          removeApiKeyBtn.style.display = 'none';
          saveApiKeyBtn.textContent = 'Save API Key';
        } else {
          statusMessage.textContent = 'Failed to remove API key.';
          statusMessage.style.color = 'red';
        }
      });
    }
  });
});