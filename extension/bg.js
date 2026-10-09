// Background service worker for browser automation extension
// PRD Appendix F.3 implementation

const BACKEND_URL = 'http://localhost:3000';
let currentSessionId = null;
let currentTabId = null;
let isRunning = false;

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    sessionId: currentSessionId,
    tabId: currentTabId,
    data
  };
  
  console.log(`[BACKGROUND:${level.toUpperCase()}] ${timestamp} - ${message}`, data ? data : '');
  
  // Store logs for debugging (in production, send to backend)
  if (!self.automationLogs) {
    self.automationLogs = [];
  }
  self.automationLogs.push(logEntry);
  
  // Keep only last 1000 logs
  if (self.automationLogs.length > 1000) {
    self.automationLogs = self.automationLogs.slice(-1000);
  }
}

log('info', 'Background service worker initialized', { backendUrl: BACKEND_URL });

// Backtracking function
async function attemptBacktracking(sessionId, tabId) {
  log('info', 'Attempting backtracking', { sessionId });
  
  try {
    // Get navigation history from backend
    const response = await fetch(`${BACKEND_URL}/v1/navigation/history/${sessionId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const history = await response.json();
    
    // Look for previous steps with untried actions (going backwards)
    for (let i = history.navigationHistory.length - 1; i >= 0; i--) {
      const step = history.navigationHistory[i];
      const untriedActions = step.alternativeActions?.filter(action => {
        const actionKey = `${action.op}-${action.locator?.value || 'none'}`;
        return !step.triedActions?.includes(actionKey);
      }) || [];
      
      if (untriedActions.length > 0) {
        log('info', 'Found step with untried actions', { 
          stepIndex: i,
          untriedActions: untriedActions.length 
        });
        
        // Mark the current failed action as tried
        await fetch(`${BACKEND_URL}/v1/navigation/mark-tried/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            stepIndex: i,
            actionKey: 'current-failed-action' // This will be updated with actual action key
          })
        });
        
        return { 
          success: true, 
          stepIndex: i, 
          actions: untriedActions 
        };
      }
    }
    
    log('warn', 'No backtracking options found', { 
      totalSteps: history.navigationHistory.length 
    });
    return { success: false, reason: 'NO_BACKTRACK_OPTIONS' };
    
  } catch (error) {
    log('error', 'Backtracking failed', { error: error.message });
    return { success: false, reason: 'BACKTRACK_ERROR' };
  }
}

// API functions
async function createSession(goal) {
  log('info', 'Creating session', { goal });
  
  try {
    const response = await fetch(`${BACKEND_URL}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    log('info', 'Session created successfully', { sessionId: data.sessionId });
    return data.sessionId;
  } catch (error) {
    log('error', 'Session creation failed', { error: error.message, goal });
    throw error;
  }
}

async function postObservation(sessionId, observation) {
  log('debug', 'Posting observation', { 
    sessionId, 
    elementCount: observation.elements?.length || 0,
    stateSig: observation.stateSig?.substring(0, 16) + '...',
    errorCount: observation.errors?.length || 0
  });
  
  try {
    const response = await fetch(`${BACKEND_URL}/v1/steps/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, observation })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    log('debug', 'Observation posted successfully', { stepId: data.stepId });
    return data;
  } catch (error) {
    log('error', 'Observation posting failed', { error: error.message, sessionId });
    throw error;
  }
}

async function postDecision(sessionId, observation, intent) {
  log('info', 'Requesting decision', { 
    sessionId, 
    intent,
    elementCount: observation.elements?.length || 0,
    stateSig: observation.stateSig?.substring(0, 16) + '...'
  });
  
  try {
    const response = await fetch(`${BACKEND_URL}/v1/steps/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, observation, intent })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    // Log full LLM decision in a table format
    if (data.decision?.actions) {
      console.table(data.decision.actions.map((action, index) => ({
        actionIndex: index + 1,
        operation: action.op,
        strategy: action.locator?.strategy,
        value: action.locator?.value,
        notes: action.notes,
        confidence: action.confidence
      })));
    }
    
    log('info', 'Decision received', { 
      stepId: data.stepId,
      plan: data.decision?.plan,
      actionCount: data.decision?.actions?.length || 0,
      finishReason: data.decision?.finish?.reason
    });
    
    if (data.decision?.finish) {
      log('info', 'Automation finished by LLM', { 
        reason: data.decision.finish.reason,
        userPrompt: data.decision.finish.user_prompt 
      });
    }
    
    return data;
  } catch (error) {
    log('error', 'Decision request failed', { error: error.message, sessionId });
    throw error;
  }
}

async function postExecute(sessionId, result) {
  log('debug', 'Posting execution result', { 
    sessionId, 
    success: result.success,
    reason: result.reason,
    error: result.error 
  });
  
  try {
    const response = await fetch(`${BACKEND_URL}/v1/steps/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, result })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    log('debug', 'Execution result posted successfully', { stepId: data.stepId });
    return data;
  } catch (error) {
    log('error', 'Execution result posting failed', { error: error.message, sessionId });
    throw error;
  }
}

async function postRating(sessionId, rating, note) {
  log('info', 'Posting rating', { sessionId, rating, note });
  
  try {
    const response = await fetch(`${BACKEND_URL}/v1/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, rating, note })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    log('info', 'Rating posted successfully', { sessionId, rating });
    return data;
  } catch (error) {
    log('error', 'Rating posting failed', { error: error.message, sessionId });
    throw error;
  }
}

// Main automation loop
async function automationLoop(sessionId, tabId, goal) {
  log('info', 'Starting automation loop iteration', { sessionId, tabId, goal });
  
  try {
    // Step 1: COLLECT
    log('debug', 'Step 1: Collecting observation...');
    const collectResult = await chrome.tabs.sendMessage(tabId, { type: 'COLLECT', intent: goal });
    
    if (collectResult.error) {
      log('error', 'Collection failed', { error: collectResult.error });
      return { success: false, reason: collectResult.error };
    }
    
    log('debug', 'Collection successful', { 
      elementCount: collectResult.observation.elements?.length || 0,
      stateSig: collectResult.observation.stateSig?.substring(0, 16) + '...',
      errorCount: collectResult.observation.errors?.length || 0
    });
    
    // Step 2: POST /observe
    log('debug', 'Step 2: Posting observation...');
    await postObservation(sessionId, collectResult.observation);
    
    // Step 3: POST /decide
    log('debug', 'Step 3: Getting decision...');
    const decideResult = await postDecision(sessionId, collectResult.observation, goal);
    
    if (decideResult.error) {
      log('error', 'Decision failed', { error: decideResult.error });
      return { success: false, reason: decideResult.error };
    }
    
    const decision = decideResult;
    log('debug', 'Decision received', { 
      plan: decision.decision?.plan,
      actionCount: decision.decision?.actions?.length || 0,
      finishReason: decision.decision?.finish?.reason
    });
    
    // Check if finished
    if (decision.decision?.finish) {
      log('info', 'Automation finished', { 
        reason: decision.decision.finish.reason,
        userPrompt: decision.decision.finish.user_prompt 
      });
      return { success: true, reason: decision.decision.finish.reason };
    }
    
    // Step 4: EXECUTE
    log('debug', 'Step 4: Executing actions...');
    let executeResult = { success: true };
    
    // Execute each action in the decision, trying alternatives if one fails
    let actionSuccess = false;
    
    for (let i = 0; i < decision.decision.actions.length && !actionSuccess; i++) {
      const action = decision.decision.actions[i];
      
      // Log LLM decision details in a table format
      console.table([{
        actionIndex: i + 1,
        totalActions: decision.decision.actions.length,
        operation: action.op,
        strategy: action.locator?.strategy,
        value: action.locator?.value,
        notes: action.notes,
        confidence: action.confidence
      }]);
      
      log('debug', `Trying action ${i + 1}/${decision.decision.actions.length}`, { 
        op: action.op,
        locator: action.locator,
        expect: action.expect 
      });
      
      executeResult = await chrome.tabs.sendMessage(tabId, { 
        type: 'EXECUTE', 
        action: action 
      });
      
      log('debug', 'Action execution result', { 
        success: executeResult.success,
        reason: executeResult.reason,
        error: executeResult.error 
      });
      
      if (executeResult.success) {
        log('info', 'Action succeeded', { 
          actionIndex: i,
          op: action.op,
          reason: executeResult.reason 
        });
        actionSuccess = true;
        
        // Wait for expected events
        if (action.expect?.event) {
          log('debug', 'Waiting for expected event', { 
            event: action.expect.event,
            timeoutMs: action.expect.timeoutMs 
          });
          
          // In a real implementation, we would wait for the specific event
          // For now, we'll just wait a bit
          await new Promise(resolve => setTimeout(resolve, action.expect.timeoutMs || 1000));
        }
      } else {
        log('warn', 'Action failed, trying next alternative', { 
          actionIndex: i,
          op: action.op,
          reason: executeResult.reason 
        });
        
        // If this was the last action and it failed, break
        if (i === decision.decision.actions.length - 1) {
          log('error', 'All actions failed', { 
            totalActions: decision.decision.actions.length,
            lastReason: executeResult.reason 
          });
          break;
        }
      }
    }
    
    // If no action succeeded, try backtracking
    if (!actionSuccess) {
      log('warn', 'All actions failed, attempting backtracking', { 
        totalActions: decision.decision.actions.length 
      });
      
      // Try to find a previous step with untried actions
      const backtrackResult = await attemptBacktracking(sessionId, tabId);
      
      if (backtrackResult.success) {
        log('info', 'Backtracking successful', { 
          backtrackedToStep: backtrackResult.stepIndex,
          alternativeActions: backtrackResult.actions.length 
        });
        
        // Execute the alternative actions from the backtracked step
        let backtrackActionSuccess = false;
        
        for (let i = 0; i < backtrackResult.actions.length && !backtrackActionSuccess; i++) {
          const action = backtrackResult.actions[i];
          
          log('debug', `Trying backtracked action ${i + 1}/${backtrackResult.actions.length}`, { 
            op: action.op,
            locator: action.locator 
          });
          
          const backtrackExecuteResult = await chrome.tabs.sendMessage(tabId, { 
            type: 'EXECUTE', 
            action: action 
          });
          
          if (backtrackExecuteResult.success) {
            log('info', 'Backtracked action succeeded', { 
              actionIndex: i,
              op: action.op 
            });
            backtrackActionSuccess = true;
            executeResult = { success: true, reason: 'BACKTRACK_SUCCESS' };
          } else {
            log('warn', 'Backtracked action failed', { 
              actionIndex: i,
              op: action.op,
              reason: backtrackExecuteResult.reason 
            });
          }
        }
        
        if (!backtrackActionSuccess) {
          log('error', 'All backtracked actions also failed', { 
            totalBacktrackActions: backtrackResult.actions.length 
          });
          executeResult = { success: false, reason: 'BACKTRACK_FAILED' };
        }
      } else {
        log('error', 'Backtracking failed', { 
          reason: backtrackResult.reason 
        });
        executeResult = { success: false, reason: 'ALL_ACTIONS_FAILED_NO_BACKTRACK' };
      }
    }
    
    // Step 5: POST /execute
    log('debug', 'Step 5: Posting execution result...');
    await postExecute(sessionId, executeResult);
    
    log('debug', 'Automation loop iteration completed', { 
      success: executeResult.success,
      reason: executeResult.reason 
    });
    
    return { success: executeResult.success, reason: executeResult.reason };
    
  } catch (error) {
    log('error', 'Automation loop error', { error: error.message, sessionId });
    return { success: false, reason: 'EXCEPTION', error: error.message };
  }
}

// Start automation
async function startAutomation(tabId, goal) {
  log('info', 'Starting automation', { tabId, goal });
  
  if (isRunning) {
    log('warn', 'Automation already running, ignoring start request');
    return;
  }
  
  try {
    isRunning = true;
    currentTabId = tabId;
    
    // Notify popup that automation has started
    notifyPopupStatusChange();
    
    // Content script is already injected via manifest, no need to inject again
    log('info', 'Content script should be available via manifest injection');
    
    // Create session
    currentSessionId = await createSession(goal);
    log('info', 'Session created, starting automation loop', { sessionId: currentSessionId });
    
    // Run automation loop
    while (isRunning) {
      const result = await automationLoop(currentSessionId, tabId, goal);
      
      if (!result.success) {
        log('error', 'Automation failed', { reason: result.reason });
        await finishAutomation(result.reason);
        break;
      }
      
      if (result.reason && result.reason !== 'SUCCESS') {
        log('info', 'Automation completed with reason', { reason: result.reason });
        await finishAutomation(result.reason);
        break;
      }
      
      // Continue to next iteration
      log('debug', 'Continuing to next automation iteration');
    }
    
  } catch (error) {
    log('error', 'Automation error', { error: error.message });
    await finishAutomation('EXCEPTION');
  }
}

async function finishAutomation(reason) {
  log('info', 'Finishing automation', { reason });
  
  isRunning = false;
  currentTabId = null;
  
  // Notify popup of status change
  notifyPopupStatusChange();
  
  if (currentSessionId) {
    // Prompt for rating
    const rating = await promptRating();
    if (rating) {
      await postRating(currentSessionId, rating.rating, rating.note);
    }
    currentSessionId = null;
  }
  
  log('info', 'Automation finished', { reason });
}

function notifyPopupStatusChange() {
  // Notify any open popups about status change
  chrome.runtime.sendMessage({ 
    type: 'STATUS_UPDATE', 
    isRunning: isRunning 
  }).catch(() => {
    // Ignore errors if no popup is listening
  });
}

async function promptRating() {
  log('debug', 'Prompting for rating');
  
  // For MVP, we'll skip the rating prompt in service worker
  // In a full implementation, we would show a notification or use a different approach
  log('info', 'Skipping rating prompt in service worker');
  return null;
}

// Extension action click handler - now opens popup instead of direct automation
chrome.action.onClicked.addListener(async (tab) => {
  log('info', 'Extension action clicked - opening popup', { tabId: tab.id, url: tab.url });
  
  // The popup will handle goal input and automation start
  // No need to do anything here as the popup will send a message
});



// Handle tab updates (for SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && currentTabId === tabId && isRunning) {
    log('info', 'Tab updated, continuing automation', { tabId, url: tab.url });
    // The automation loop will continue on the next iteration
  }
});

// Handle tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (currentTabId === tabId && isRunning) {
    log('warn', 'Tab closed, finishing automation', { tabId });
    finishAutomation('TAB_CLOSED');
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('debug', 'Message received', { type: message.type, sender: sender?.tab?.id });
  
  if (message.type === 'START_AUTOMATION') {
    log('info', 'START_AUTOMATION message received', { tabId: message.tabId, goal: message.goal });
    
    if (isRunning) {
      log('warn', 'Automation already running');
      sendResponse({ success: false, error: 'Automation already running' });
      return;
    }
    
    const { tabId, goal } = message;
    if (!goal || !goal.trim()) {
      log('warn', 'No goal provided');
      sendResponse({ success: false, error: 'No goal provided' });
      return;
    }
    
    log('info', 'Starting automation from popup', { tabId, goal });
    startAutomation(tabId, goal).then(() => {
      log('info', 'Automation started successfully');
      sendResponse({ success: true });
    }).catch(error => {
      log('error', 'Failed to start automation', { error: error.message });
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'GET_STATUS') {
    sendResponse({ isRunning });
    return false;
  }
  
  if (message.type === 'CAPTURE_SCREENSHOT') {
    log('debug', 'Screenshot capture request received', { 
      tabId: sender.tab?.id,
      elementCount: message.elements?.length || 0 
    });
    
    captureScreenshotWithBoxes(sender.tab.id, message.elements)
      .then(screenshot => {
        log('debug', 'Screenshot captured successfully', { 
          success: !!screenshot,
          dataLength: screenshot?.length || 0 
        });
        sendResponse({ screenshot });
      })
      .catch(error => {
        log('error', 'Screenshot capture failed', { error: error.message });
        sendResponse({ screenshot: null });
      });
    return true; // Keep message channel open for async response
  }
  
  if (message.type === 'LOG') {
    // Forward content script logs
    log('content', message.logEntry.message, message.logEntry.data);
    return false;
  }
});

// Capture screenshot with element bounding boxes overlay
async function captureScreenshotWithBoxes(tabId, elements) {
  try {
    log('debug', 'Capturing screenshot', { tabId, elementCount: elements?.length || 0 });
    
    // Capture the visible tab
    const screenshot = await chrome.tabs.captureVisibleTab(tabId, {
      format: 'png',
      quality: 80
    });
    
    log('debug', 'Screenshot captured', { 
      success: !!screenshot,
      dataLength: screenshot?.length || 0 
    });
    
    // For MVP, we'll return the base64 screenshot
    // In a full implementation, we would overlay bounding boxes on the image
    // This would require canvas manipulation or server-side processing
    
    return screenshot;
  } catch (error) {
    log('error', 'Screenshot capture error', { error: error.message, tabId });
    return null;
  }
}

log('info', 'Background service worker setup complete');
