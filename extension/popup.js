// Popup script for browser automation extension

document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const startBtn = document.getElementById('startBtn');
  const goalInput = document.getElementById('goalInput');
  const versionSpan = document.getElementById('version');
  
  // Get extension version from manifest
  chrome.management.getSelf(function(extensionInfo) {
    if (versionSpan && extensionInfo.version) {
      versionSpan.textContent = `v${extensionInfo.version}`;
    }
  });
  
  // Check current status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function(response) {
    updateStatus(response?.isRunning || false);
  });
  
  // Load saved goal from storage
  chrome.storage.local.get(['savedGoal'], function(result) {
    if (result.savedGoal) {
      goalInput.value = result.savedGoal;
    }
  });
  
  startBtn.addEventListener('click', function() {
    const goal = goalInput.value.trim();
    
    if (!goal) {
      goalInput.focus();
      goalInput.style.borderColor = '#dc3545';
      goalInput.style.boxShadow = '0 0 0 2px rgba(220, 53, 69, 0.25)';
      setTimeout(() => {
        goalInput.style.borderColor = '#ddd';
        goalInput.style.boxShadow = 'none';
      }, 2000);
      return;
    }
    
    // Save goal to storage
    chrome.storage.local.set({ savedGoal: goal });
    
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.runtime.sendMessage({ 
          type: 'START_AUTOMATION', 
          tabId: tabs[0].id,
          goal: goal
        }, function(response) {
          if (response && response.success) {
            updateStatus(true);
          } else {
            console.error('Failed to start automation:', response?.error || 'Unknown error');
            updateStatus(false);
          }
        });
      }
    });
  });
  
  // Handle Enter key in textarea
  goalInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
      startBtn.click();
    }
  });
  
  function updateStatus(isRunning) {
    if (isRunning) {
      statusDiv.textContent = 'Status: Running';
      statusDiv.className = 'status running';
      startBtn.textContent = 'Automation Running...';
      startBtn.disabled = true;
    } else {
      statusDiv.textContent = 'Status: Stopped';
      statusDiv.className = 'status stopped';
      startBtn.textContent = 'Start Automation';
      startBtn.disabled = false;
    }
  }
  
  // Listen for status updates
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.type === 'STATUS_UPDATE') {
      updateStatus(message.isRunning);
    }
  });
});
