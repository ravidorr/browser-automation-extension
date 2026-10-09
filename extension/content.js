// Content script for browser automation extension
// PRD Appendix F.2 implementation

console.log('[CONTENT] Content script starting... VERSION 1.0.54', new Date().toISOString());

// Simple duplicate injection check
if (window.browserAutomationInitialized) {
  console.log('[CONTENT] Browser automation already initialized, skipping duplicate injection');
} else {
  window.browserAutomationInitialized = true;

// Configuration system - all features enabled by default
const config = {
  screenshotEnabled: true,
  elementRankingEnabled: true,
  stateSignatureEnabled: true,
  topK: 60,
  maxRetries: 1,
  consecutiveFailureLimit: 5,
  replanLimit: 3,
  attemptFailureLimit: 2,
  loggingEnabled: true,
  debugLogging: true,  // Enable debug logging temporarily
  logLevel: 'info'      // Only log info, warn, and error levels
};

// Logging utility
function log(level, message, data = null) {
  if (!config.loggingEnabled) return;
  
  // Skip debug logs if debug logging is disabled
  if (level === 'debug' && !config.debugLogging) return;
  
  // Skip logs below the configured level
  const levels = ['debug', 'info', 'warn', 'error'];
  const currentLevelIndex = levels.indexOf(level);
  const configLevelIndex = levels.indexOf(config.logLevel);
  if (currentLevelIndex < configLevelIndex) return;
  
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    url: window.location.href,
    data
  };
  
  console.log(`[CONTENT:${level.toUpperCase()}] ${timestamp} - ${message}`, data ? data : '');
  
  // Send to background script for centralized logging
  // Only try to send if extension context is valid and chrome.runtime is available
  if (extensionContextValid) {
    try {
      if (chrome && chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage({
          type: 'LOG',
          logEntry
        }).catch(() => {
          // Extension context might be invalidated
          extensionContextValid = false;
        });
      }
    } catch (error) {
      // Extension context is invalidated
      extensionContextValid = false;
    }
  }
}

// State tracking for reliability rules
let state = {
  failuresInARow: 0,
  attemptLedger: new Map(), // (op, locator.value) -> {count: number, lastStateSig: string}
  stateSig: null,
  replanCount: 0,
  lastStateSig: null,
  lastSuccessfulStateSig: null,
  navigationInProgress: false, // Flag to delay observations during navigation
  lastUrl: window.location.href, // Track URL for navigation detection
  // Navigation logic moved to backend
};

// Extension context tracking
let extensionContextValid = true;

// Event tracking system
let events = {
  route: [],
  dom: [],
  network: [],
  user: [],
  error: [],
  form: [],
  performance: [],
  a11y: [],
  visual: []
};

// Event tracking configuration with multiple profiles
const eventConfig = {
  // Event storage limits
  maxEvents: 10,
  
  // Thresholds for different event types
  thresholds: {
    route: {
      changeDelay: 100,        // ms to wait before considering route changed
      ignoreHashChanges: true, // Ignore #hash changes
      ignoreQueryParams: ['utm_', 'ref', 'fbclid'], // Ignore tracking params
      minTimeBetweenEvents: 1000 // Minimum time between route events
    },
    dom: {
      mutationDelay: 50,       // ms to wait before considering DOM changed
      batchSimilarMutations: true, // Group similar DOM changes
      ignoreStyleChanges: true, // Ignore pure style changes
      minElementSize: [10, 10], // Only track elements larger than 10x10px
      minTimeBetweenEvents: 100 // Minimum time between DOM events
    },
    network: {
      idleDelay: 500,          // ms to wait before considering network idle
      requestTimeout: 30000,   // ms before considering request timed out
      retryDelay: 1000,        // ms to wait before retrying failed requests
      minTimeBetweenEvents: 50 // Minimum time between network events
    },
    user: {
      clickDelay: 250,         // ms to wait before considering click significant
      typeDelay: 100,          // ms to wait before considering typing significant
      scrollDelay: 100,        // ms to wait before considering scroll significant
      minTimeBetweenEvents: 50 // Minimum time between user events
    },
    error: {
      captureJsErrors: true,   // Capture JavaScript errors
      captureNetworkErrors: true, // Capture network errors
      captureResourceErrors: true, // Capture resource loading errors
      maxErrorEvents: 5        // Maximum error events to keep
    },
    form: {
      submitDelay: 100,        // ms to wait before considering form submission
      validationDelay: 50,     // ms to wait before considering validation change
      minTimeBetweenEvents: 100 // Minimum time between form events
    },
    performance: {
      loadDelay: 1000,         // ms to wait before considering page loaded
      resourceDelay: 1000,     // ms to wait before considering resource loaded
      minTimeBetweenEvents: 1000 // Minimum time between performance events
    },
    a11y: {
      focusDelay: 50,          // ms to wait before considering focus change
      ariaDelay: 100,          // ms to wait before considering ARIA change
      minTimeBetweenEvents: 50 // Minimum time between accessibility events
    },
    visual: {
      visibilityDelay: 500,    // ms to wait before considering visibility change
      animationDelay: 200,     // ms to wait before considering animation
      minTimeBetweenEvents: 500 // Minimum time between visual events
    }
  },
  
  // Event filtering rules
  filters: {
    dom: {
      ignoreElements: ['script', 'style', 'meta', 'link', 'noscript'],
      significantAttributes: ['href', 'src', 'data-*', 'aria-*', 'role'],
      ignoreClasses: ['temp', 'loading', 'hidden']
    },
    network: {
      ignoreUrls: ['analytics', 'tracking', 'beacon'],
      ignoreMethods: ['OPTIONS', 'HEAD'],
      captureStatusCodes: [200, 201, 204, 400, 401, 403, 404, 500, 502, 503]
    },
    user: {
      ignoreElements: ['script', 'style', 'meta', 'link', 'noscript'],
      captureEvents: ['click', 'input', 'change', 'scroll', 'focus', 'blur']
    },
    form: {
      captureElements: ['form', 'input', 'select', 'textarea'],
      captureEvents: ['submit', 'change', 'input', 'validation']
    },
    performance: {
      captureMetrics: ['navigation', 'resource', 'paint', 'layout'],
      ignoreResources: ['analytics', 'tracking', 'beacon']
    },
    a11y: {
      captureElements: ['[role]', '[tabindex]', 'button', 'input', 'a'],
      captureEvents: ['focus', 'blur', 'aria-change', 'role-change']
    },
    visual: {
      captureElements: ['[data-visibility]'],
      captureEvents: ['visibilitychange', 'animationstart', 'animationend']
    }
  },
  
  // Performance settings
  performance: {
    sampleRate: 1.0,           // 100% of events (can be reduced for performance)
    burstLimit: 10,            // Max events per burst
    cooldownPeriod: 1000,      // ms to wait after burst
    maxEventSize: 1024,        // Max bytes per event
    truncateLongStrings: true  // Truncate long text content
  }
};

// Configuration profiles for different use cases
const configProfiles = {
  // High sensitivity - captures everything
  sensitive: {
    maxEvents: 20,
    thresholds: {
      route: { changeDelay: 50, minTimeBetweenEvents: 500 },
      dom: { mutationDelay: 25, minTimeBetweenEvents: 50 },
      network: { idleDelay: 250, minTimeBetweenEvents: 25 },
      user: { clickDelay: 100, typeDelay: 50, scrollDelay: 50 },
      error: { captureJsErrors: true, captureNetworkErrors: true, captureResourceErrors: true },
      form: { submitDelay: 50, validationDelay: 25, minTimeBetweenEvents: 50 },
      performance: { loadDelay: 500, resourceDelay: 250, minTimeBetweenEvents: 100 },
      a11y: { focusDelay: 25, ariaDelay: 50, minTimeBetweenEvents: 25 },
      visual: { visibilityDelay: 100, animationDelay: 50, minTimeBetweenEvents: 50 }
    },
    performance: { sampleRate: 1.0, burstLimit: 20 }
  },
  
  // Balanced - good for most use cases
  balanced: {
    maxEvents: 10,
    thresholds: {
      route: { changeDelay: 100, minTimeBetweenEvents: 1000 },
      dom: { mutationDelay: 50, minTimeBetweenEvents: 100 },
      network: { idleDelay: 500, minTimeBetweenEvents: 50 },
      user: { clickDelay: 250, typeDelay: 100, scrollDelay: 100 },
      error: { captureJsErrors: true, captureNetworkErrors: true, captureResourceErrors: false },
      form: { submitDelay: 100, validationDelay: 50, minTimeBetweenEvents: 100 },
      performance: { loadDelay: 1000, resourceDelay: 500, minTimeBetweenEvents: 200 },
      a11y: { focusDelay: 50, ariaDelay: 100, minTimeBetweenEvents: 50 },
      visual: { visibilityDelay: 200, animationDelay: 100, minTimeBetweenEvents: 100 }
    },
    performance: { sampleRate: 1.0, burstLimit: 10 }
  },
  
  // Conservative - minimal events for performance
  conservative: {
    maxEvents: 5,
    thresholds: {
      route: { changeDelay: 200, minTimeBetweenEvents: 2000 },
      dom: { mutationDelay: 100, minTimeBetweenEvents: 200 },
      network: { idleDelay: 1000, minTimeBetweenEvents: 100 },
      user: { clickDelay: 500, typeDelay: 200, scrollDelay: 200 },
      error: { captureJsErrors: true, captureNetworkErrors: false, captureResourceErrors: false },
      form: { submitDelay: 200, validationDelay: 100, minTimeBetweenEvents: 200 },
      performance: { loadDelay: 2000, resourceDelay: 1000, minTimeBetweenEvents: 500 },
      a11y: { focusDelay: 100, ariaDelay: 200, minTimeBetweenEvents: 100 },
      visual: { visibilityDelay: 500, animationDelay: 200, minTimeBetweenEvents: 200 }
    },
    performance: { sampleRate: 0.5, burstLimit: 5 }
  }
};

// Current active profile
let activeProfile = 'balanced';

// Function to update configuration
function updateEventConfig(newConfig) {
  if (typeof newConfig === 'string' && configProfiles[newConfig]) {
    // Apply a predefined profile
    activeProfile = newConfig;
    Object.assign(eventConfig, configProfiles[newConfig]);
    log('info', 'Event config updated to profile', { profile: newConfig });
  } else if (typeof newConfig === 'object') {
    // Apply custom configuration
    Object.assign(eventConfig, newConfig);
    log('info', 'Event config updated with custom settings', { config: newConfig });
  }
  
  // Reinitialize event tracking with new config
  reinitializeEventTracking();
}

// Function to get current configuration
function getEventConfig() {
  return {
    activeProfile,
    config: eventConfig,
    availableProfiles: Object.keys(configProfiles)
  };
}

// Route change tracking
let lastUrl = window.location.href;
let routeChangeTimer = null;

// DOM mutation tracking
let domObserver = null;
let domChangeTimer = null;

// Network event tracking
let lastNetworkActivity = Date.now();

log('info', 'Content script initialized', { config, url: window.location.href });

// Initialize event tracking
initializeEventTracking();

// Network idle detection
let inflightRequests = 0;
let networkIdleTimer = null;
let isNetworkIdle = false;

// Patch fetch to track requests (enhanced with event tracking)
const originalFetch = window.fetch;
window.fetch = function(...args) {
  inflightRequests++;
  log('debug', 'Fetch request started', { inflightRequests, url: args[0] });
  addNetworkEvent('request', { url: args[0], method: 'fetch' });
  return originalFetch.apply(this, args)
    .then(response => {
      addNetworkEvent('response', { 
        url: args[0], 
        status: response.status,
        method: 'fetch'
      });
      return response;
    })
    .catch(error => {
      addNetworkEvent('error', { 
        url: args[0], 
        error: error.message,
        method: 'fetch'
      });
      throw error;
    })
    .finally(() => {
      inflightRequests--;
      log('debug', 'Fetch request completed', { inflightRequests });
      updateNetworkIdle();
    });
};

// Patch XHR to track requests (enhanced with event tracking)
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(...args) {
  inflightRequests++;
  log('debug', 'XHR request started', { inflightRequests, url: args[1] });
  addNetworkEvent('request', { url: args[1], method: 'xhr' });
  return originalXHROpen.apply(this, args);
};
XMLHttpRequest.prototype.send = function(...args) {
  return originalXHRSend.apply(this, args)
    .then(() => {
      addNetworkEvent('response', { 
        url: this.responseURL, 
        status: this.status,
        method: 'xhr'
      });
    })
    .catch(error => {
      addNetworkEvent('error', { 
        url: this.responseURL, 
        error: error.message,
        method: 'xhr'
      });
    })
    .finally(() => {
      inflightRequests--;
      log('debug', 'XHR request completed', { inflightRequests });
      updateNetworkIdle();
    });
};

function updateNetworkIdle() {
  if (networkIdleTimer) {
    clearTimeout(networkIdleTimer);
  }
  
  // Be more lenient with network idle detection
  // If inflightRequests is 0 or very low, consider network idle
  if (inflightRequests <= 1) {
    networkIdleTimer = setTimeout(() => {
      isNetworkIdle = true;
      log('debug', 'Network idle detected', { inflightRequests });
      addNetworkEvent('networkIdle');
    }, eventConfig.thresholds.network.idleDelay);
  } else {
    isNetworkIdle = false;
    lastNetworkActivity = Date.now();
  }
}

// Event tracking functions with configuration support
function addRouteEvent(to) {
  // Check if we should ignore this route change
  const url = new URL(to);
  
  // Ignore hash changes if configured
  if (eventConfig.thresholds.route.ignoreHashChanges && url.hash) {
    log('debug', 'Ignoring hash change', { hash: url.hash });
    return;
  }
  
  // Ignore query params if configured
  if (eventConfig.thresholds.route.ignoreQueryParams) {
    const hasIgnoredParams = eventConfig.thresholds.route.ignoreQueryParams.some(param => 
      url.searchParams.has(param) || url.searchParams.toString().includes(param)
    );
    if (hasIgnoredParams) {
      log('debug', 'Ignoring route with tracking params', { params: url.searchParams.toString() });
      return;
    }
  }
  
  // Check minimum time between events
  const lastEvent = events.route[events.route.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.route.minTimeBetweenEvents) {
    log('debug', 'Skipping route event - too soon after last event');
    return;
  }
  
  const event = {
    type: 'route',
    to: to,
    timestamp: Date.now()
  };
  
  events.route.push(event);
  if (events.route.length > eventConfig.maxEvents) {
    events.route.shift();
  }
  
  log('debug', 'Route event added', { to, eventCount: events.route.length });
}

function addDOMEvent(changeType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.dom[events.dom.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.dom.minTimeBetweenEvents) {
    log('debug', 'Skipping DOM event - too soon after last event');
    return;
  }
  
  // Apply performance sampling
  if (Math.random() > eventConfig.performance.sampleRate) {
    log('debug', 'Skipping DOM event - sampling');
    return;
  }
  
  const event = {
    type: 'dom',
    changeType,
    details,
    timestamp: Date.now()
  };
  
  events.dom.push(event);
  if (events.dom.length > eventConfig.maxEvents) {
    events.dom.shift();
  }
  
  log('debug', 'DOM event added', { changeType, eventCount: events.dom.length });
}

function addNetworkEvent(eventType, details = {}) {
  // Check if we should ignore this network event
  if (details.url && eventConfig.filters.network.ignoreUrls) {
    const shouldIgnore = eventConfig.filters.network.ignoreUrls.some(ignorePattern => 
      details.url.includes(ignorePattern)
    );
    if (shouldIgnore) {
      log('debug', 'Ignoring network event - filtered URL', { url: details.url });
      return;
    }
  }
  
  // Check minimum time between events
  const lastEvent = events.network[events.network.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.network.minTimeBetweenEvents) {
    log('debug', 'Skipping network event - too soon after last event');
    return;
  }
  
  // Apply performance sampling
  if (Math.random() > eventConfig.performance.sampleRate) {
    log('debug', 'Skipping network event - sampling');
    return;
  }
  
  const event = {
    type: 'network',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.network.push(event);
  if (events.network.length > eventConfig.maxEvents) {
    events.network.shift();
  }
  
  log('debug', 'Network event added', { eventType, eventCount: events.network.length });
}

// User interaction event tracking
function addUserEvent(eventType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.user[events.user.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.user.minTimeBetweenEvents) {
    log('debug', 'Skipping user event - too soon after last event');
    return;
  }
  
  // Apply performance sampling
  if (Math.random() > eventConfig.performance.sampleRate) {
    log('debug', 'Skipping user event - sampling');
    return;
  }
  
  const event = {
    type: 'user',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.user.push(event);
  if (events.user.length > eventConfig.maxEvents) {
    events.user.shift();
  }
  
  log('debug', 'User event added', { eventType, eventCount: events.user.length });
}

// Error event tracking
function addErrorEvent(errorType, details = {}) {
  // Check if error tracking is enabled
  if (!eventConfig.thresholds.error[`capture${errorType.charAt(0).toUpperCase() + errorType.slice(1)}Errors`]) {
    return;
  }
  
  const event = {
    type: 'error',
    errorType,
    details,
    timestamp: Date.now()
  };
  
  events.error.push(event);
  if (events.error.length > eventConfig.thresholds.error.maxErrorEvents) {
    events.error.shift();
  }
  
  log('debug', 'Error event added', { errorType, eventCount: events.error.length });
}

// Form event tracking
function addFormEvent(eventType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.form[events.form.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.form.minTimeBetweenEvents) {
    log('debug', 'Skipping form event - too soon after last event');
    return;
  }
  
  const event = {
    type: 'form',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.form.push(event);
  if (events.form.length > eventConfig.maxEvents) {
    events.form.shift();
  }
  
  log('debug', 'Form event added', { eventType, eventCount: events.form.length });
}

// Performance event tracking
function addPerformanceEvent(eventType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.performance[events.performance.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.performance.minTimeBetweenEvents) {
    log('debug', 'Skipping performance event - too soon after last event');
    return;
  }
  
  const event = {
    type: 'performance',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.performance.push(event);
  if (events.performance.length > eventConfig.maxEvents) {
    events.performance.shift();
  }
  
  log('debug', 'Performance event added', { eventType, eventCount: events.performance.length });
}

// Accessibility event tracking
function addA11yEvent(eventType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.a11y[events.a11y.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.a11y.minTimeBetweenEvents) {
    log('debug', 'Skipping a11y event - too soon after last event');
    return;
  }
  
  const event = {
    type: 'a11y',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.a11y.push(event);
  if (events.a11y.length > eventConfig.maxEvents) {
    events.a11y.shift();
  }
  
  log('debug', 'A11y event added', { eventType, eventCount: events.a11y.length });
}

// Visual event tracking
function addVisualEvent(eventType, details = {}) {
  // Check minimum time between events
  const lastEvent = events.visual[events.visual.length - 1];
  if (lastEvent && (Date.now() - lastEvent.timestamp) < eventConfig.thresholds.visual.minTimeBetweenEvents) {
    log('debug', 'Skipping visual event - too soon after last event');
    return;
  }
  
  const event = {
    type: 'visual',
    eventType,
    details,
    timestamp: Date.now()
  };
  
  events.visual.push(event);
  if (events.visual.length > eventConfig.maxEvents) {
    events.visual.shift();
  }
  
  log('debug', 'Visual event added', { eventType, eventCount: events.visual.length });
}

// Initialize event tracking
function initializeEventTracking() {
  log('info', 'Initializing event tracking');
  
  // Route change tracking
  window.addEventListener('popstate', () => {
    const newUrl = window.location.href;
    if (newUrl !== lastUrl) {
      addRouteEvent(newUrl);
      lastUrl = newUrl;
    }
  });
  
  // DOM mutation tracking
  domObserver = new MutationObserver((mutations) => {
    if (domChangeTimer) {
      clearTimeout(domChangeTimer);
    }
    
    domChangeTimer = setTimeout(() => {
      const significantChanges = mutations.filter(mutation => {
        // Filter out insignificant changes based on configuration
        if (mutation.type === 'attributes') {
          const attrName = mutation.attributeName;
          
          // Ignore style changes if configured
          if (eventConfig.thresholds.dom.ignoreStyleChanges && attrName === 'style') {
            return false;
          }
          
          // Only track significant attributes
          if (eventConfig.filters.dom.significantAttributes) {
            const isSignificant = eventConfig.filters.dom.significantAttributes.some(pattern => {
              if (pattern.endsWith('*')) {
                return attrName.startsWith(pattern.slice(0, -1));
              }
              return attrName === pattern;
            });
            if (!isSignificant) return false;
          }
        }
        
        // Filter out ignored elements
        if (mutation.target && eventConfig.filters.dom.ignoreElements) {
          const tagName = mutation.target.tagName.toLowerCase();
          if (eventConfig.filters.dom.ignoreElements.includes(tagName)) {
            return false;
          }
        }
        
        // Check element size if configured
        if (mutation.target && eventConfig.thresholds.dom.minElementSize) {
          const rect = mutation.target.getBoundingClientRect();
          const [minWidth, minHeight] = eventConfig.thresholds.dom.minElementSize;
          if (rect.width < minWidth || rect.height < minHeight) {
            return false;
          }
        }
        
        return true;
      });
      
      if (significantChanges.length > 0) {
        addDOMEvent('mutation', {
          mutationCount: significantChanges.length,
          types: [...new Set(significantChanges.map(m => m.type))]
        });
      }
    }, eventConfig.thresholds.dom.mutationDelay);
  });
  
  domObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'src', 'data-*']
  });
  
  // Network activity tracking is already handled by the fetch/XHR patches above
  
  // User interaction tracking
  initializeUserEventTracking();
  
  // Error tracking
  initializeErrorTracking();
  
  // Form tracking
  initializeFormTracking();
  
  // Performance tracking
  initializePerformanceTracking();
  
  // Accessibility tracking
  initializeA11yTracking();
  
  // Visual tracking
  initializeVisualTracking();
  
  log('info', 'Event tracking initialized');
}

// User interaction event tracking initialization
function initializeUserEventTracking() {
  log('info', 'Initializing user interaction tracking');
  
  // Click tracking
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (eventConfig.filters.user.ignoreElements.includes(target.tagName.toLowerCase())) {
      return;
    }
    
    addUserEvent('click', {
      element: target.tagName.toLowerCase(),
      elementId: target.id || null,
      elementText: target.textContent?.trim().slice(0, 50) || null,
      coordinates: [event.clientX, event.clientY]
    });
  }, true);
  
  // Input tracking
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (eventConfig.filters.user.ignoreElements.includes(target.tagName.toLowerCase())) {
      return;
    }
    
    addUserEvent('input', {
      element: target.tagName.toLowerCase(),
      elementId: target.id || null,
      inputType: target.type || 'text',
      valueLength: target.value?.length || 0
    });
  }, true);
  
  // Scroll tracking
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }
    
    scrollTimer = setTimeout(() => {
      addUserEvent('scroll', {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        documentHeight: document.documentElement.scrollHeight
      });
    }, eventConfig.thresholds.user.scrollDelay);
  });
  
  // Focus tracking
  document.addEventListener('focus', (event) => {
    const target = event.target;
    if (eventConfig.filters.user.ignoreElements.includes(target.tagName.toLowerCase())) {
      return;
    }
    
    addUserEvent('focus', {
      element: target.tagName.toLowerCase(),
      elementId: target.id || null,
      elementText: target.textContent?.trim().slice(0, 50) || null
    });
  }, true);
  
  document.addEventListener('blur', (event) => {
    const target = event.target;
    if (eventConfig.filters.user.ignoreElements.includes(target.tagName.toLowerCase())) {
      return;
    }
    
    addUserEvent('blur', {
      element: target.tagName.toLowerCase(),
      elementId: target.id || null
    });
  }, true);
}

// Error tracking initialization
function initializeErrorTracking() {
  log('info', 'Initializing error tracking');
  
  // JavaScript error tracking
  window.addEventListener('error', (event) => {
    addErrorEvent('js', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || null
    });
  });
  
  // Unhandled promise rejection tracking
  window.addEventListener('unhandledrejection', (event) => {
    addErrorEvent('promise', {
      reason: event.reason?.toString() || 'Unknown promise rejection',
      promise: event.promise
    });
  });
  
  // Resource loading error tracking
  window.addEventListener('error', (event) => {
    if (event.target && event.target.tagName) {
      addErrorEvent('resource', {
        element: event.target.tagName.toLowerCase(),
        src: event.target.src || event.target.href || null,
        error: event.error?.message || 'Resource loading failed'
      });
    }
  }, true);
}

// Form tracking initialization
function initializeFormTracking() {
  log('info', 'Initializing form tracking');
  
  // Form submission tracking
  document.addEventListener('submit', (event) => {
    const form = event.target;
    addFormEvent('submit', {
      formId: form.id || null,
      formAction: form.action || null,
      formMethod: form.method || 'get',
      fieldCount: form.elements.length
    });
  }, true);
  
  // Form field change tracking
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (eventConfig.filters.form.captureElements.includes(target.tagName.toLowerCase())) {
      addFormEvent('change', {
        element: target.tagName.toLowerCase(),
        elementId: target.id || null,
        elementName: target.name || null,
        elementType: target.type || null,
        valueLength: target.value?.length || 0
      });
    }
  }, true);
  
  // Form validation tracking
  document.addEventListener('invalid', (event) => {
    const target = event.target;
    if (eventConfig.filters.form.captureElements.includes(target.tagName.toLowerCase())) {
      addFormEvent('validation', {
        element: target.tagName.toLowerCase(),
        elementId: target.id || null,
        elementName: target.name || null,
        validationMessage: target.validationMessage || null
      });
    }
  }, true);
}

// Performance tracking initialization
function initializePerformanceTracking() {
  log('info', 'Initializing performance tracking');
  
  // Page load performance
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const perfData = performance.getEntriesByType('navigation')[0];
      if (perfData) {
        addPerformanceEvent('navigation', {
          loadTime: perfData.loadEventEnd - perfData.loadEventStart,
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
          firstPaint: performance.getEntriesByType('paint')[0]?.startTime || null
        });
      }
    });
  } else {
    // Page already loaded
    const perfData = performance.getEntriesByType('navigation')[0];
    if (perfData) {
      addPerformanceEvent('navigation', {
        loadTime: perfData.loadEventEnd - perfData.loadEventStart,
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
        firstPaint: performance.getEntriesByType('paint')[0]?.startTime || null
      });
    }
  }
  
  // Resource loading performance
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'resource') {
        const url = entry.name;
        if (eventConfig.filters.performance.ignoreResources.some(pattern => url.includes(pattern))) {
          continue;
        }
        
        addPerformanceEvent('resource', {
          url: url,
          duration: entry.duration,
          size: entry.transferSize || null,
          type: entry.initiatorType
        });
      }
    }
  });
  
  try {
    observer.observe({ entryTypes: ['resource'] });
  } catch (e) {
    log('warn', 'PerformanceObserver not supported', { error: e.message });
  }
}

// Accessibility tracking initialization
function initializeA11yTracking() {
  log('info', 'Initializing accessibility tracking');
  
  // Focus tracking for accessibility
  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target.matches(eventConfig.filters.a11y.captureElements.join(',')) || 
        target.hasAttribute('aria-') || target.hasAttribute('role')) {
      addA11yEvent('focus', {
        element: target.tagName.toLowerCase(),
        elementId: target.id || null,
        role: target.getAttribute('role') || null,
        tabIndex: target.getAttribute('tabindex') || null
      });
    }
  }, true);
  
  document.addEventListener('focusout', (event) => {
    const target = event.target;
    if (target.matches(eventConfig.filters.a11y.captureElements.join(',')) || 
        target.hasAttribute('aria-') || target.hasAttribute('role')) {
      addA11yEvent('blur', {
        element: target.tagName.toLowerCase(),
        elementId: target.id || null,
        role: target.getAttribute('role') || null
      });
    }
  }, true);
  
  // ARIA state change tracking
  const ariaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName?.startsWith('aria-')) {
        const target = mutation.target;
        if (target.matches(eventConfig.filters.a11y.captureElements.join(','))) {
          addA11yEvent('aria-change', {
            element: target.tagName.toLowerCase(),
            elementId: target.id || null,
            attribute: mutation.attributeName,
            oldValue: mutation.oldValue,
            newValue: target.getAttribute(mutation.attributeName)
          });
        }
      }
    });
  });
  
  ariaObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['aria-expanded', 'aria-hidden', 'aria-selected', 'aria-checked', 'aria-pressed'],
    subtree: true
  });
}

// Visual tracking initialization
function initializeVisualTracking() {
  log('info', 'Initializing visual tracking');
  
  // Intersection Observer for visibility changes
  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const target = entry.target;
      const style = window.getComputedStyle(target);
      const hasAnimation = style.animationName !== 'none' || style.transitionProperty !== 'none';
      const hasAnimateClass = target.classList.contains('animate');
      const hasDataVisibility = target.hasAttribute('data-visibility');
      
      if (target.matches(eventConfig.filters.visual.captureElements.join(',')) || 
          hasAnimation || hasAnimateClass || hasDataVisibility) {
        addVisualEvent('visibilitychange', {
          element: target.tagName.toLowerCase(),
          elementId: target.id || null,
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          hasAnimation,
          hasAnimateClass,
          hasDataVisibility
        });
      }
    });
  }, {
    threshold: [0, 0.25, 0.5, 0.75, 1]
  });
  
  // Observe elements that match visual filters
  document.querySelectorAll(eventConfig.filters.visual.captureElements.join(',')).forEach((el) => {
    visibilityObserver.observe(el);
  });
  
  // Also observe elements with animations (using a different approach)
  document.querySelectorAll('*').forEach((el) => {
    const style = window.getComputedStyle(el);
    if (style.animationName !== 'none' || style.transitionProperty !== 'none' || 
        el.classList.contains('animate') || el.hasAttribute('data-visibility')) {
      visibilityObserver.observe(el);
    }
  });
  
  // Animation tracking
  document.addEventListener('animationstart', (event) => {
    if (event.target.matches(eventConfig.filters.visual.captureElements.join(','))) {
      addVisualEvent('animationstart', {
        element: event.target.tagName.toLowerCase(),
        elementId: event.target.id || null,
        animationName: event.animationName
      });
    }
  }, true);
  
  document.addEventListener('animationend', (event) => {
    if (event.target.matches(eventConfig.filters.visual.captureElements.join(','))) {
      addVisualEvent('animationend', {
        element: event.target.tagName.toLowerCase(),
        elementId: event.target.id || null,
        animationName: event.animationName,
        duration: event.elapsedTime
      });
    }
  }, true);
}

// Reinitialize event tracking with new configuration
function reinitializeEventTracking() {
  log('info', 'Reinitializing event tracking with new configuration');
  
  // Clean up existing observers
  if (domObserver) {
    domObserver.disconnect();
  }
  
  // Clear existing timers
  if (routeChangeTimer) {
    clearTimeout(routeChangeTimer);
  }
  if (domChangeTimer) {
    clearTimeout(domChangeTimer);
  }
  if (networkIdleTimer) {
    clearTimeout(networkIdleTimer);
  }
  
  // Clear existing events
  events.route = [];
  events.dom = [];
  events.network = [];
  events.user = [];
  events.error = [];
  events.form = [];
  events.performance = [];
  events.a11y = [];
  events.visual = [];
  
  // Reinitialize with new configuration
  initializeEventTracking();
}

// Get recent events for observation
function getRecentEvents() {
  // Only include events that are allowed by the backend schema
  const allEvents = [
    ...events.route.map(e => ({ type: 'route', to: e.to })),
    ...events.dom.map(e => ({ type: 'dom', changeType: e.changeType })),
    ...events.network.map(e => ({ type: 'network', eventType: e.eventType }))
  ];
  
  // Sort by timestamp and take the most recent
  allEvents.sort((a, b) => b.timestamp - a.timestamp);
  return allEvents.slice(0, eventConfig.maxEvents);
}

// SPA route change detection (enhanced with event tracking)
let currentUrl = window.location.href;
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  handleRouteChange();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  handleRouteChange();
};

function handleRouteChange() {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    log('info', 'Route change detected', { from: currentUrl, to: newUrl });
    currentUrl = newUrl;
    addRouteEvent(newUrl);
    // Reset network idle on route change
    isNetworkIdle = false;
    updateNetworkIdle();
  }
}



// Element ranking and selection
function topKElements(intent, K = config.topK) {
  log('debug', 'Starting element ranking', { intent, topK: K });
  
  // Use a more comprehensive selector to find all interactive elements
  const allElements = Array.from(document.querySelectorAll('*'))
    .filter(el => {
      // Basic visibility check
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      
      return rect.width > 0 && rect.height > 0 && 
             style.visibility !== 'hidden' &&
             style.display !== 'none' &&
             el.textContent?.trim().length > 0; // Must have text content
    });
  
  log('debug', 'Initial element collection', { 
    totalElements: allElements.length,
    sampleElements: allElements.slice(0, 3).map(el => ({
      tagName: el.tagName,
      text: el.textContent?.trim().substring(0, 20),
      role: el.getAttribute('role')
    }))
  });
  
  // Filter for interactive elements
  const elements = allElements.filter(el => {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const hasClickHandler = el.onclick != null || el.getAttribute('onclick') != null;
    const hasCursorPointer = window.getComputedStyle(el).cursor === 'pointer';
    const hasTabIndex = el.getAttribute('tabindex') != null;
    
    // Check for event listeners (click, mouseover, keydown, submit)
    const hasEventListeners = el.onclick != null || 
                             el.onmouseover != null || 
                             el.onkeydown != null || 
                             el.onsubmit != null ||
                             el.getAttribute('onclick') != null ||
                             el.getAttribute('onmouseover') != null ||
                             el.getAttribute('onkeydown') != null ||
                             el.getAttribute('onsubmit') != null;
    
    // Check for common interactive patterns
    const hasInteractivePatterns = el.getAttribute('data-action') != null ||
                                  el.getAttribute('data-toggle') != null ||
                                  el.getAttribute('data-target') != null ||
                                  el.getAttribute('data-bs-toggle') != null ||
                                  el.getAttribute('data-bs-target') != null ||
                                  el.getAttribute('ng-click') != null ||
                                  el.getAttribute('v-on:click') != null ||
                                  el.getAttribute('@click') != null ||
                                  el.getAttribute('onclick') != null ||
                                  el.getAttribute('onmousedown') != null ||
                                  el.getAttribute('onmouseup') != null ||
                                  el.getAttribute('ontouchstart') != null ||
                                  el.getAttribute('ontouchend') != null ||
                                  el.getAttribute('data-value') != null ||
                                  el.getAttribute('data-option') != null ||
                                  el.getAttribute('aria-selected') != null ||
                                  el.getAttribute('aria-expanded') != null;
    
    // Check for CSS classes that might indicate interactivity
    const hasInteractiveCSS = el.className && (
      el.className.includes('button') ||
      el.className.includes('click') ||
      el.className.includes('tile') ||
      el.className.includes('card') ||
      el.className.includes('link') ||
      el.className.includes('nav') ||
      el.className.includes('menu') ||
      el.className.includes('tab')
    );
    
    // Include elements that are likely interactive
    return tagName === 'button' || 
           tagName === 'a' || 
           tagName === 'input' ||
           tagName === 'select' ||
           tagName === 'option' ||
           role === 'button' || 
           role === 'link' || 
           role === 'menuitem' ||
           role === 'option' ||
           role === 'listbox' ||
           role === 'combobox' ||
           hasClickHandler ||
           hasCursorPointer ||
           hasTabIndex ||
           hasEventListeners ||
           hasInteractivePatterns ||
           hasInteractiveCSS ||
           el.getAttribute('data-testid') != null ||
           el.getAttribute('data-test-id') != null;
  })
    .map(el => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent?.trim() || '';
      const tagName = el.tagName.toLowerCase();
      
      // Simple element collection - scoring done in backend
      let score = 0;
      
      // Bonus for interactive elements
      if (el.getAttribute('role')) score += 0.3;
      
      return {
        element: el,
        score,
        text,
        tagName
      };
    })
    // Don't filter by score - let backend handle scoring
    .sort((a, b) => b.score - a.score)
    .slice(0, K)
    .map(item => buildElementEntry(item.element, item.text, item.tagName, item.score));
    
  log('debug', 'Element ranking completed', { 
    totalElements: elements.length, 
    topScore: elements[0]?.score || 0,
    intent 
  });
  
  // Debug: Log the top elements found
  if (elements.length > 0) {
    log('debug', 'Top elements found', {
      elements: elements.slice(0, 5).map(el => ({
        text: el.text?.substring(0, 20),
        role: el.role,
        tag: el.tag
      }))
    });
    

  } else {
    log('warn', 'No interactive elements found!', {
      allElementsCount: allElements.length,
      intent
    });
  }
  
  return elements;
}

// Build element entry with all PRD-required properties
function buildElementEntry(element, text, tagName, score = 0) {
  const rect = element.getBoundingClientRect();
  const role = element.getAttribute('role');
  const ariaLabel = element.getAttribute('aria-label');
  const dataTestId = element.getAttribute('data-testid') || element.getAttribute('data-testId');
  const idAttr = element.id;
  const classes = Array.from(element.classList).slice(0, 3);
  const inputType = element.tagName === 'INPUT' ? element.getAttribute('type') : null;
  const disabled = element.disabled || false;
  const hidden = !isVisible(element);
  
  // Generate unique ID and add it to the element for later retrieval
  const uniqueId = generateElementId(element);
  element.setAttribute('data-element-id', uniqueId);
  
  // Debug: Log the attribute setting
  log('debug', 'Element ID set', {
    elementId: uniqueId,
    tagName: element.tagName,
    text: element.textContent?.trim().substring(0, 30),
    hasAttribute: element.hasAttribute('data-element-id'),
    attributeValue: element.getAttribute('data-element-id')
  });
  
  // Extract href/src domains only (not full URLs)
  let hrefHost = null;
  if (element.tagName === 'A' && element.href) {
    try {
      const url = new URL(element.href);
      hrefHost = url.hostname;
    } catch (e) {
      hrefHost = null;
    }
  } else if (element.tagName === 'IMG' && element.src) {
    try {
      const url = new URL(element.src);
      hrefHost = url.hostname;
    } catch (e) {
      hrefHost = null;
    }
  }
  
  return {
    id: generateElementId(element),
    tag: tagName, // Added missing tag property
    role: role,
    text: text.length > 120 ? text.substring(0, 120) : text,
    ariaLabel: ariaLabel,
    dataTestId: dataTestId,
    idAttr: idAttr,
    classes: classes.length > 0 ? classes : null,
    hrefHost: hrefHost, // Now properly extracts domain only
    inputType: inputType,
    disabled: disabled,
    hidden: hidden,
    bbox: [rect.left, rect.top, rect.width, rect.height],
    visible: isVisible(element),
    score: score, // Add score for ranking
    cssSelector: generateUniqueSelector(element), // Unique CSS selector
    xpath: generateXPath(element) // Unique XPath
  };
}

function calculateStateSignature(elements) {
  try {
    // Include URL in state signature to detect navigation
    const url = window.location.href;
    const topTexts = elements
      .slice(0, 10)
      .map(el => el.text?.trim())
      .filter(text => text && text.length > 0 && text.length < 100)
      .join('|');
    
    const stateString = `${url}|${topTexts}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(stateString);
    
    // Use a simple hash function for synchronous operation
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    const hashString = hash.toString(16);
    return btoa(hashString).substring(0, 32);
  } catch (error) {
    log('error', 'State signature calculation failed', { error: error.message });
    return 'error';
  }
}

// Check if element is visible
function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 1 && rect.height > 1 && 
         style.visibility !== 'hidden' && 
         style.display !== 'none' &&
         style.opacity !== '0';
}

// Build observation with proper state signature
async function buildObservation(intent = '') {
  const currentUrl = window.location.href;
  
  // DEBUG: Log URL information
  log('debug', '🔍 URL DEBUG', {
    currentUrl: currentUrl,
    lastUrl: state.lastUrl,
    urlChanged: state.lastUrl && state.lastUrl !== currentUrl,
    isStalePage: state.lastUrl && state.lastUrl !== currentUrl
  });
  
  // Check if URL has changed (navigation occurred) - this should happen FIRST
  if (state.lastUrl && state.lastUrl !== currentUrl) {
    log('info', '🎉 PAGE NAVIGATION DETECTED!', {
      from: state.lastUrl,
      to: currentUrl
    });
    
    // Set navigation in progress flag
    state.navigationInProgress = true;
    setTimeout(() => {
      state.navigationInProgress = false;
      log('info', '🔄 Navigation complete, ready for next observation');
    }, 2000);
  }
  
  // Check if we're on a stale page (content script not re-injected after navigation)
  const isStalePage = state.lastUrl && state.lastUrl !== currentUrl;
  
  if (isStalePage) {
    log('warn', '🚨 STALE PAGE DETECTED! Content script not re-injected after navigation', {
      lastUrl: state.lastUrl,
      currentUrl: currentUrl,
      difference: 'Content script is running on old page while browser is on new page'
    });
    
    // Reset state for new page
    state.lastUrl = currentUrl;
    state.stateSig = null;
    state.lastStateSig = null;
    state.lastSuccessfulStateSig = null;
    state.replanCount = 0;
    state.failuresInARow = 0;
    state.attemptLedger.clear();
    state.navigationInProgress = false;
    
    log('info', '🔄 State reset for new page');
  }
  
  state.lastUrl = currentUrl;
  
  // Check if navigation is in progress
  if (state.navigationInProgress) {
    log('info', '⏳ Navigation in progress, delaying observation');
    return new Promise((resolve) => {
      const checkNavigation = () => {
        if (!state.navigationInProgress) {
          log('info', '✅ Navigation complete, proceeding with observation');
          resolve(buildObservation(intent));
        } else {
          setTimeout(checkNavigation, 100);
        }
      };
      checkNavigation();
    });
  }
  
  // Wait for document to be fully ready
  if (document.readyState !== 'complete') {
    log('info', '⏳ Document not ready, waiting...', { 
      readyState: document.readyState,
      url: window.location.href 
    });
    return new Promise((resolve) => {
      const checkReady = () => {
        if (document.readyState === 'complete') {
          log('info', '✅ Document ready, proceeding with observation');
          resolve(buildObservation(intent));
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }
  
  log('info', 'Building observation', { 
    intent, 
    url: window.location.href,
    readyState: document.readyState
  });
  
  const elements = topKElements(intent, config.topK);
  const newStateSig = calculateStateSignature(elements);
  
  // Update state signature tracking
  if (state.stateSig !== newStateSig) {
    if (state.stateSig !== null) {
      // State changed - reset replan count if it was a successful change
      if (state.lastSuccessfulStateSig !== state.stateSig) {
        state.replanCount = 0;
        log('info', 'State changed, reset replan count', { 
          oldSig: state.stateSig?.substring(0, 16) + '...',
          newSig: newStateSig?.substring(0, 16) + '...',
          replanCount: state.replanCount 
        });
      }
    }
    state.lastStateSig = state.stateSig;
    state.stateSig = newStateSig;
  } else {
    // State unchanged - increment replan count
    state.replanCount++;
    log('warn', 'State unchanged, incrementing replan count', { 
      replanCount: state.replanCount,
      stateSig: newStateSig?.substring(0, 16) + '...'
    });
  }
  
  const observation = {
    url: window.location.href,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screenshot: await captureScreenshot(elements),
    elements,
    events: getRecentEvents(),
    network: { inflight: inflightRequests },
    errors: [],
    stateSig: newStateSig
  };
  
  // Log elements found in a table format
  console.table(elements.map(el => ({
    id: el.id,
    tag: el.tag,
    text: el.text?.substring(0, 30),
    role: el.role,
    classes: el.classes?.join(', '),
    visible: el.visible,
    disabled: el.disabled
  })));
  
  log('info', 'Observation built', { 
    elementCount: elements.length,
    stateSig: newStateSig?.substring(0, 16) + '...',
    replanCount: state.replanCount,
    inflightRequests,
    hasScreenshot: !!observation.screenshot,
    screenshotLength: observation.screenshot?.length || 0
  });
  
  return observation;
}

// Capture screenshot with element bounding boxes overlay
async function captureScreenshot(elements) {
  if (!config.screenshotEnabled) {
    log('debug', 'Screenshot capture disabled');
    return null;
  }
  
  try {
    log('debug', 'Capturing screenshot', { elementCount: elements.length });
    
    // Request screenshot from background script
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      elements: elements.filter(el => el.visible).map(el => ({
        id: el.id,
        bbox: el.bbox
      }))
    });
    
    if (!response) {
      log('error', 'No response from background script for screenshot');
      return null;
    }
    
    log('debug', 'Screenshot captured', { 
      success: !!response.screenshot,
      dataLength: response.screenshot?.length || 0,
      responseKeys: Object.keys(response || {})
    });
    
    return response.screenshot;
  } catch (error) {
    log('error', 'Screenshot capture failed', { 
      error: error.message,
      stack: error.stack,
      extensionContextValid
    });
    return null;
  }
}

function generateElementId(element) {
  if (element.id) return element.id;
  if (element.getAttribute('data-testid')) return `testid-${element.getAttribute('data-testid')}`;
  
  // Generate a deterministic ID based on element properties
  const tagName = element.tagName.toLowerCase();
  const text = element.textContent?.trim().substring(0, 20) || '';
  const classes = Array.from(element.classList).join('');
  const position = getElementPosition(element);
  
  // Create a hash-like string from element properties
  const elementString = `${tagName}-${text}-${classes}-${position}`;
  let hash = 0;
  for (let i = 0; i < elementString.length; i++) {
    const char = elementString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `${tagName}-${Math.abs(hash).toString(36).substring(0, 6)}`;
}

function getElementPosition(element) {
  // Get element's position in the DOM tree
  let path = '';
  let current = element;
  let depth = 0;
  
  while (current && current.parentElement && depth < 5) {
    const parent = current.parentElement;
    const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
    const index = siblings.indexOf(current);
    path = `${index}${path}`;
    current = parent;
    depth++;
  }
  
  return path;
}

function generateUniqueSelector(element) {
  // Try ID first (most reliable)
  if (element.id) {
    return `#${element.id}`;
  }
  
  // Try data-testid
  if (element.getAttribute('data-testid')) {
    return `[data-testid="${element.getAttribute('data-testid')}"]`;
  }
  
  // Try aria-label
  if (element.getAttribute('aria-label')) {
    return `${element.tagName.toLowerCase()}[aria-label="${element.getAttribute('aria-label')}"]`;
  }
  
  // Try role
  if (element.getAttribute('role')) {
    return `${element.tagName.toLowerCase()}[role="${element.getAttribute('role')}"]`;
  }
  
  // Generate a unique CSS selector based on position and attributes
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).filter(cls => cls.length > 0);
  
  if (classes.length > 0) {
    // Use first class that's not too generic
    const specificClass = classes.find(cls => 
      !cls.includes('css-') && 
      !cls.includes('wdapp') && 
      !cls.includes('md') &&
      cls.length > 2
    );
    if (specificClass) {
      return `${tagName}.${specificClass}`;
    }
  }
  
  // Fallback: use tag name with nth-child
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(child => child.tagName === element.tagName);
    const index = siblings.indexOf(element) + 1;
    return `${tagName}:nth-child(${index})`;
  }
  
  // Last resort: tag name only
  return tagName;
}

function generateXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  if (element.getAttribute('data-testid')) {
    return `//*[@data-testid="${element.getAttribute('data-testid')}"]`;
  }
  
  // Generate XPath based on position
  let path = '';
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector += `[@id="${current.id}"]`;
      path = `//${selector}${path}`;
      break;
    }
    
    if (current.getAttribute('data-testid')) {
      selector += `[@data-testid="${current.getAttribute('data-testid')}"]`;
      path = `//${selector}${path}`;
      break;
    }
    
    // Add position
    const siblings = Array.from(current.parentElement?.children || []).filter(child => child.tagName === current.tagName);
    const position = siblings.indexOf(current) + 1;
    if (siblings.length > 1) {
      selector += `[${position}]`;
    }
    
    path = `/${selector}${path}`;
    current = current.parentElement;
  }
  
  return path;
}

// Action executor with proper reliability rules
async function executeAction(action) {
  log('info', 'Executing action', { 
    op: action.op, 
    locator: action.locator,
    failuresInARow: state.failuresInARow,
    replanCount: state.replanCount 
  });
  
  try {
    // Check for consecutive failures limit
    if (state.failuresInARow >= config.consecutiveFailureLimit) {
      log('error', 'Consecutive failures limit reached', { 
        failuresInARow: state.failuresInARow,
        limit: config.consecutiveFailureLimit 
      });
      return { success: false, reason: 'CONSECUTIVE_FAILURES' };
    }
    
    // Check for stuck loop
    if (state.replanCount >= config.replanLimit) {
      log('error', 'Stuck loop detected', { 
        replanCount: state.replanCount,
        limit: config.replanLimit 
      });
      return { success: false, reason: 'STUCK_LOOP' };
    }
    
    // Track attempt in ledger with state signature
    const attemptKey = `${action.op}-${action.locator?.value || 'none'}`;
    const currentStateSig = state.stateSig;
    const ledgerEntry = state.attemptLedger.get(attemptKey) || { count: 0, lastStateSig: null };
    
    // Check if same action failed twice without state change (PRD rule)
    if (ledgerEntry.count >= config.attemptFailureLimit && 
        ledgerEntry.lastStateSig === currentStateSig) {
      log('warn', 'Force replan triggered', { 
        attemptKey,
        count: ledgerEntry.count,
        lastStateSig: ledgerEntry.lastStateSig?.substring(0, 16) + '...',
        currentStateSig: currentStateSig?.substring(0, 16) + '...'
      });
      return { success: false, reason: 'FORCE_REPLAN' };
    }
    
    // Update ledger
    ledgerEntry.count++;
    ledgerEntry.lastStateSig = currentStateSig;
    state.attemptLedger.set(attemptKey, ledgerEntry);
    
    log('debug', 'Attempt ledger updated', { 
      attemptKey, 
      count: ledgerEntry.count,
      ledgerSize: state.attemptLedger.size 
    });
    
    switch (action.op) {
      case 'CLICK':
        if (action.locator) {
          log('info', '🔍 CLICK ACTION - Locator:', action.locator);
          const element = findElement(action.locator);
          log('info', '🔍 CLICK ACTION - Element found:', {
            found: !!element,
            tagName: element?.tagName,
            id: element?.id,
            text: element?.textContent?.trim().substring(0, 30)
          });
          
          if (element) {
            // Store current URL before click
            const urlBeforeClick = window.location.href;
            
            log('info', '🎯 SELECTED ELEMENT FOR CLICKING:', {
              elementId: element.id || '',
              tagName: element.tagName,
              text: element.textContent?.trim().substring(0, 30),
              role: element.getAttribute('role'),
              disabled: element.disabled,
              classes: Array.from(element.classList).join(', '),
              boundingRect: element.getBoundingClientRect()
            });
            
            // Add a visual highlight to the element being clicked
            const originalBackground = element.style.backgroundColor;
            element.style.backgroundColor = 'red';
            element.style.border = '3px solid yellow';
            element.style.zIndex = '9999';
            setTimeout(() => {
              element.style.backgroundColor = originalBackground;
              element.style.border = '';
              element.style.zIndex = '';
            }, 2000);
            
            log('debug', 'Clicking element now...', { elementId: element.id || 'unknown' });
            
            // Try multiple click methods for different element types
            let clickSuccess = false;
            
            // Method 1: Standard click
            try {
              element.click();
              clickSuccess = true;
              log('debug', 'Standard click successful');
            } catch (e) {
              log('debug', 'Standard click failed, trying alternatives', { error: e.message });
            }
            
            // Method 2: For div elements (like calendar cells), try mousedown + mouseup
            if (!clickSuccess && element.tagName === 'DIV') {
              try {
                element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                clickSuccess = true;
                log('debug', 'Mouse events successful for DIV');
              } catch (e) {
                log('debug', 'Mouse events failed', { error: e.message });
              }
            }
            
            // Method 3: Try focus + Enter key for focusable elements
            if (!clickSuccess && (element.tabIndex >= 0 || element.getAttribute('role') === 'button' || element.getAttribute('role') === 'link')) {
              try {
                element.focus();
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                clickSuccess = true;
                log('debug', 'Focus + Enter successful');
              } catch (e) {
                log('debug', 'Focus + Enter failed', { error: e.message });
              }
            }
            
            // Method 4: Try Space key for button-like elements
            if (!clickSuccess && (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button')) {
              try {
                element.focus();
                element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
                clickSuccess = true;
                log('debug', 'Space key successful');
              } catch (e) {
                log('debug', 'Space key failed', { error: e.message });
              }
            }
            
            log('debug', 'Click executed', { elementId: element.id || 'unknown', clickSuccess });
            
            // Log click result for debugging
setTimeout(() => {
  const urlAfterClick = window.location.href;
  const urlChanged = urlBeforeClick !== urlAfterClick;
  log('debug', 'Click result', {
    urlBefore: urlBeforeClick,
    urlAfter: urlAfterClick,
    urlChanged,
    elementId: element.id || 'unknown'
  });
}, 500); // Brief delay to check for navigation
            
            if (clickSuccess) {
              state.failuresInARow = 0;
              state.lastSuccessfulStateSig = currentStateSig;
              log('info', 'CLICK action successful', { elementId: element.id });
              return { success: true };
            } else {
              log('warn', 'All click methods failed', { elementId: element.id });
              return { success: false, reason: 'CLICK_FAILED' };
            }
          } else {
            log('error', '❌ ELEMENT NOT FOUND:', { strategy: action.locator.strategy, value: action.locator.value });
            return { success: false, reason: 'ELEMENT_NOT_FOUND' };
          }
        }
        break;
        
      case 'TYPE':
        if (action.locator && action.input?.text) {
          const element = findElement(action.locator);
          if (element && element.tagName === 'INPUT') {
            log('debug', 'Element found for TYPE', { 
              locator: action.locator,
              elementId: element.id,
              inputType: element.type,
              textLength: action.input.text.length 
            });
            
            element.focus();
            element.value = action.input.text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            state.failuresInARow = 0;
            state.lastSuccessfulStateSig = currentStateSig;
            log('info', 'TYPE action successful', { 
              elementId: element.id, 
              textLength: action.input.text.length 
            });
            return { success: true };
          } else {
            log('warn', 'Element not found or not input for TYPE', { 
              locator: action.locator,
              found: !!element,
              tagName: element?.tagName 
            });
          }
        }
        break;
        
      case 'NAVIGATE':
        if (action.input?.url) {
          log('info', 'NAVIGATE action', { 
            from: window.location.href,
            to: action.input.url 
          });
          window.location.href = action.input.url;
          return { success: true };
        }
        break;
        
      case 'SCROLL':
        if (action.locator) {
          const element = findElement(action.locator);
          if (element) {
            log('debug', 'SCROLL action', { elementId: element.id });
            element.scrollIntoView({ behavior: 'smooth' });
            state.failuresInARow = 0;
            state.lastSuccessfulStateSig = currentStateSig;
            return { success: true };
          }
        }
        break;
        
      case 'WAIT':
        const timeout = action.expect?.timeoutMs || 1000;
        log('debug', 'WAIT action', { timeoutMs: timeout });
        await new Promise(resolve => setTimeout(resolve, timeout));
        state.failuresInARow = 0;
        state.lastSuccessfulStateSig = currentStateSig;
        return { success: true };
        
      case 'FINISH':
        log('info', 'FINISH action');
        return { success: true, reason: 'SUCCESS' };
        
      default:
        log('error', 'Unsupported action', { op: action.op });
        return { success: false, reason: 'UNSUPPORTED_ACTION' };
    }
    
    state.failuresInARow++;
    log('warn', 'Action failed', { 
      op: action.op, 
      failuresInARow: state.failuresInARow,
      reason: 'ACTION_FAILED' 
    });
    return { success: false, reason: 'ACTION_FAILED' };
    
  } catch (error) {
    state.failuresInARow++;
    log('error', 'Action execution exception', { 
      op: action.op, 
      error: error.message,
      failuresInARow: state.failuresInARow 
    });
    return { success: false, reason: 'EXCEPTION', error: error.message };
  }
}

function findElement(locator) {
  if (!locator) return null;
  
  log('info', '🔍 FINDING ELEMENT:', { strategy: locator.strategy, value: locator.value });
  
  let element = null;
  switch (locator.strategy) {
    case 'css':
      element = document.querySelector(locator.value);
      break;
      
    case 'xpath':
      const result = document.evaluate(
        locator.value, 
        document, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      );
      element = result.singleNodeValue;
      break;
      
    case 'elementId':
      // Find element by the unique ID we generated
      log('debug', '🔍 Looking for element with data-element-id', { value: locator.value });
      element = document.querySelector(`[data-element-id="${locator.value}"]`);
      if (!element) {
        log('debug', '🔍 Element not found with data-element-id, trying getElementById', { value: locator.value });
        // Fallback: try to find by the ID itself
        element = document.getElementById(locator.value);
      }
      if (element) {
        log('debug', '🔍 Element found', { 
          tagName: element.tagName, 
          text: element.textContent?.trim().substring(0, 30),
          hasDataElementId: element.hasAttribute('data-element-id'),
          dataElementId: element.getAttribute('data-element-id')
        });
      } else {
        log('error', '❌ ELEMENT NOT FOUND', { strategy: locator.strategy, value: locator.value });
      }
      break;
      
    case 'text':
      // More precise text-based element finding
      const searchText = locator.value.toLowerCase();
      
      // First, try to find interactive elements with exact text match
      element = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]'))
        .find(el => {
          const text = el.textContent?.trim();
          // Skip elements with very long text (likely navigation/accessibility)
          if (text && text.length > 100) {
            return false;
          }
          // Look for exact text match
          return text && text.toLowerCase() === searchText;
        });
      
      // If not found, try all elements with exact text match
      if (!element) {
        element = Array.from(document.querySelectorAll('*'))
          .find(el => {
            const text = el.textContent?.trim();
            // Skip non-interactive elements
            if (['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) {
              return false;
            }
            // Skip elements with very long text (likely navigation/accessibility)
            if (text && text.length > 100) {
              return false;
            }
            // Look for exact text match
            return text && text.toLowerCase() === searchText;
          });
      }
      
      // If not found, try interactive elements with contains match
      if (!element) {
        element = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]'))
          .find(el => {
            const text = el.textContent?.trim();
            // Skip elements with very long text
            if (text && text.length > 100) {
              return false;
            }
            // Skip elements that contain navigation/accessibility keywords
            if (text && (
              text.toLowerCase().includes('skip to') ||
              text.toLowerCase().includes('accessibility') ||
              text.toLowerCase().includes('navigation') ||
              text.toLowerCase().includes('menu') ||
              text.toLowerCase().includes('overview')
            )) {
              return false;
            }
            // Look for contains match
            return text && text.toLowerCase().includes(searchText);
          });
      }
      
      // If still not found, try all elements with contains match
      if (!element) {
        element = Array.from(document.querySelectorAll('*'))
          .find(el => {
            const text = el.textContent?.trim();
            // Skip non-interactive elements
            if (['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) {
              return false;
            }
            // Skip elements with very long text
            if (text && text.length > 100) {
              return false;
            }
            // Skip elements that contain navigation/accessibility keywords
            if (text && (
              text.toLowerCase().includes('skip to') ||
              text.toLowerCase().includes('accessibility') ||
              text.toLowerCase().includes('navigation') ||
              text.toLowerCase().includes('menu') ||
              text.toLowerCase().includes('overview')
            )) {
              return false;
            }
            // Look for contains match
            return text && text.toLowerCase().includes(searchText);
          });
      }
      break;
      
    case 'role':
      element = document.querySelector(`[role="${locator.value}"]`);
      break;
      
    case 'aria':
      element = document.querySelector(`[aria-label="${locator.value}"]`);
      break;
      
    case 'dataTestId':
      element = document.querySelector(`[data-testid="${locator.value}"]`);
      break;
      
    default:
      log('error', 'Unknown locator strategy', { strategy: locator.strategy });
      return null;
  }
  
  if (element) {
    log('debug', 'Element found', { 
      strategy: locator.strategy, 
      value: locator.value,
      tagName: element.tagName,
      id: element.id,
      text: element.textContent?.trim().substring(0, 30),
      className: element.className,
      innerHTML: element.innerHTML?.substring(0, 50)
    });
  } else {
    log('error', '❌ ELEMENT NOT FOUND:', { 
      strategy: locator.strategy, 
      value: locator.value 
    });
    
    // Debug: show all elements with similar text
    if (locator.strategy === 'text') {
      const similarElements = Array.from(document.querySelectorAll('*'))
        .filter(el => {
          const text = el.textContent?.trim();
          return text && (
            text.toLowerCase().includes(locator.value.toLowerCase()) ||
            locator.value.toLowerCase().includes(text.toLowerCase())
          );
        })
        .slice(0, 3);
      
      if (similarElements.length > 0) {
        log('debug', 'Similar elements found (but not selected)', {
          count: similarElements.length,
          elements: similarElements.map(el => ({
            tagName: el.tagName,
            text: el.textContent?.trim().substring(0, 30),
            className: el.className
          }))
        });
      }
    }
  }
  
  return element;
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('debug', 'Message received', { type: message.type, sender: sender.tab?.id });
  
  switch (message.type) {
    case 'COLLECT':
      // Allow COLLECT even if network is not idle, but log it
      if (!isNetworkIdle) {
        log('warn', 'Network not idle, but allowing COLLECT', { inflightRequests });
        // Don't reject - allow the automation to continue
      }
      
      // Build observation asynchronously to handle screenshot capture
      buildObservation(message.intent).then(observation => {
        // Add reliability state to observation
        observation.errors = [];
        if (state.failuresInARow > 0) {
          observation.errors.push(`Consecutive failures: ${state.failuresInARow}`);
        }
        if (state.replanCount > 0) {
          observation.errors.push(`Replan count: ${state.replanCount}`);
        }
        
        // Add replanCount to observation for backend stuck loop detection
        observation.replanCount = state.replanCount;
        
        // Check for force replan condition
        const hasForceReplan = Array.from(state.attemptLedger.entries()).some(([key, entry]) => 
          entry.count >= config.attemptFailureLimit && entry.lastStateSig === state.stateSig
        );
        
        if (hasForceReplan) {
          observation.errors.push('FORCE_REPLAN: Same action failed twice without state change');
          log('warn', 'Force replan condition detected in observation');
        }
        
        // Check for approaching stuck loop
        if (state.replanCount >= config.replanLimit - 1) {
          observation.errors.push(`APPROACHING_STUCK_LOOP: Replan count ${state.replanCount}/${config.replanLimit}`);
          log('warn', 'Approaching stuck loop limit', { replanCount: state.replanCount, limit: config.replanLimit });
        }
        
        log('info', 'COLLECT response sent', { 
          elementCount: observation.elements.length,
          errorCount: observation.errors.length,
          stateSig: observation.stateSig?.substring(0, 16) + '...'
        });
        
        sendResponse({ observation });
      });
      return true; // Keep message channel open for async response
      
    case 'EXECUTE':
      // Log LLM decision in content script console too
      console.table([{
        actionIndex: 1,
        operation: message.action?.op,
        strategy: message.action?.locator?.strategy,
        value: message.action?.locator?.value,
        notes: message.action?.notes,
        confidence: message.action?.confidence
      }]);
      
      log('debug', 'EXECUTE action received', { 
        action: message.action,
        locator: message.action?.locator,
        op: message.action?.op,
        locatorStrategy: message.action?.locator?.strategy,
        locatorValue: message.action?.locator?.value
      });
      executeAction(message.action).then(result => {
        log('info', 'EXECUTE response sent', { 
          success: result.success, 
          reason: result.reason,
          failuresInARow: state.failuresInARow 
        });
        sendResponse(result);
      });
      return true; // Keep message channel open for async response
      
    case 'UPDATE_EVENT_CONFIG':
      log('info', 'Updating event configuration', { config: message.config });
      updateEventConfig(message.config);
      sendResponse({ success: true, config: getEventConfig() });
      return false;
      
    case 'GET_EVENT_CONFIG':
      sendResponse(getEventConfig());
      return false;
  }
});

// Block window.open calls
const originalWindowOpen = window.open;
window.open = function(...args) {
  log('warn', 'window.open blocked', { args });
  // Log the attempt but don't open the window
  console.log('Blocked window.open call:', args);
  return null;
};

// Monitor for file input focus events
document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target.tagName === 'INPUT' && target.type === 'file') {
    log('info', 'File input focused', { elementId: target.id });
    console.log('File input focused - should trigger FILE_PICKER_REACHED');
  }
});

// Initialize network idle detection
updateNetworkIdle();

// Listen for extension context invalidation
chrome.runtime.onSuspend?.addListener(() => {
  extensionContextValid = false;
});

log('info', 'Content script setup complete', { 
  url: window.location.href,
  config: Object.keys(config).filter(k => config[k] !== undefined)
});

console.log('[CONTENT] Content script loaded successfully!', new Date().toISOString());
}
