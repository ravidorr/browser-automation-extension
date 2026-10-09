// Content script for browser automation extension.
//
// The manifest loads this as a classic content script, so this module keeps a
// classic-script bootstrap. Its runtime is deliberately exposed on
// `browserAutomationContent`: tests can construct it with fake browser APIs,
// while Chrome still starts it immediately below.
(function bootstrap(global) {
  const defaultConfig = {
    screenshotEnabled: true,
    elementRankingEnabled: true,
    stateSignatureEnabled: true,
    topK: 60,
    maxRetries: 1,
    consecutiveFailureLimit: 5,
    replanLimit: 3,
    attemptFailureLimit: 2,
    loggingEnabled: true,
    debugLogging: true,
    logLevel: 'info',
  };

  const defaultEventConfig = {
    maxEvents: 10,
    thresholds: {
      route: { changeDelay: 100, ignoreHashChanges: true, ignoreQueryParams: ['utm_', 'ref', 'fbclid'], minTimeBetweenEvents: 1000 },
      dom: { mutationDelay: 50, ignoreStyleChanges: true, minElementSize: [10, 10], minTimeBetweenEvents: 100 },
      network: { idleDelay: 500, minTimeBetweenEvents: 50 },
      user: { clickDelay: 250, typeDelay: 100, scrollDelay: 100, minTimeBetweenEvents: 50 },
      error: { captureJsErrors: true, captureNetworkErrors: true, captureResourceErrors: true, maxErrorEvents: 5 },
      form: { submitDelay: 100, validationDelay: 50, minTimeBetweenEvents: 100 },
      performance: { loadDelay: 1000, resourceDelay: 500, minTimeBetweenEvents: 1000 },
      a11y: { focusDelay: 50, ariaDelay: 100, minTimeBetweenEvents: 50 },
      visual: { visibilityDelay: 500, animationDelay: 200, minTimeBetweenEvents: 500 },
    },
    filters: {
      dom: { ignoreElements: ['script', 'style', 'meta', 'link', 'noscript'], significantAttributes: ['href', 'src', 'data-*', 'aria-*', 'role'] },
      network: { ignoreUrls: ['analytics', 'tracking', 'beacon'] },
      user: { ignoreElements: ['script', 'style', 'meta', 'link', 'noscript'] },
      form: { captureElements: ['form', 'input', 'select', 'textarea'] },
      performance: { ignoreResources: ['analytics', 'tracking', 'beacon'] },
      a11y: { captureElements: ['[role]', '[tabindex]', 'button', 'input', 'a'] },
      visual: { captureElements: ['[data-visibility]'] },
    },
    performance: { sampleRate: 1, burstLimit: 10 },
  };

  const configProfiles = {
    sensitive: { maxEvents: 20, thresholds: { route: { changeDelay: 50, minTimeBetweenEvents: 500 }, dom: { mutationDelay: 25, minTimeBetweenEvents: 50 }, network: { idleDelay: 250, minTimeBetweenEvents: 25 }, user: { clickDelay: 100, typeDelay: 50, scrollDelay: 50, minTimeBetweenEvents: 25 }, error: { captureJsErrors: true, captureNetworkErrors: true, captureResourceErrors: true }, form: { submitDelay: 50, validationDelay: 25, minTimeBetweenEvents: 50 }, performance: { loadDelay: 500, resourceDelay: 250, minTimeBetweenEvents: 100 }, a11y: { focusDelay: 25, ariaDelay: 50, minTimeBetweenEvents: 25 }, visual: { visibilityDelay: 100, animationDelay: 50, minTimeBetweenEvents: 50 } }, performance: { sampleRate: 1, burstLimit: 20 } },
    balanced: { maxEvents: 10, thresholds: { route: { changeDelay: 100, minTimeBetweenEvents: 1000 }, dom: { mutationDelay: 50, minTimeBetweenEvents: 100 }, network: { idleDelay: 500, minTimeBetweenEvents: 50 }, user: { clickDelay: 250, typeDelay: 100, scrollDelay: 100, minTimeBetweenEvents: 50 }, error: { captureJsErrors: true, captureNetworkErrors: true, captureResourceErrors: false }, form: { submitDelay: 100, validationDelay: 50, minTimeBetweenEvents: 100 }, performance: { loadDelay: 1000, resourceDelay: 500, minTimeBetweenEvents: 200 }, a11y: { focusDelay: 50, ariaDelay: 100, minTimeBetweenEvents: 50 }, visual: { visibilityDelay: 200, animationDelay: 100, minTimeBetweenEvents: 100 } }, performance: { sampleRate: 1, burstLimit: 10 } },
    conservative: { maxEvents: 5, thresholds: { route: { changeDelay: 200, minTimeBetweenEvents: 2000 }, dom: { mutationDelay: 100, minTimeBetweenEvents: 200 }, network: { idleDelay: 1000, minTimeBetweenEvents: 100 }, user: { clickDelay: 500, typeDelay: 200, scrollDelay: 200, minTimeBetweenEvents: 100 }, error: { captureJsErrors: true, captureNetworkErrors: false, captureResourceErrors: false }, form: { submitDelay: 200, validationDelay: 100, minTimeBetweenEvents: 100 }, performance: { loadDelay: 2000, resourceDelay: 1000, minTimeBetweenEvents: 500 }, a11y: { focusDelay: 100, ariaDelay: 200, minTimeBetweenEvents: 100 }, visual: { visibilityDelay: 500, animationDelay: 200, minTimeBetweenEvents: 200 } }, performance: { sampleRate: 0.5, burstLimit: 5 } },
  };

  function createContentScript(environment) {
    const win = environment.window;
    const doc = environment.document;
    const chromeApi = environment.chrome;
    const timers = environment.timers || environment;
    const now = environment.now || Date.now;
    const random = environment.random || Math.random;
    const makeUrl = environment.URL || URL;
    const encode = environment.TextEncoder || TextEncoder;
    const encode64 = environment.btoa || btoa;
    const consoleApi = environment.console || console;
    const mutationObserver = environment.MutationObserver;
    const performanceObserver = environment.PerformanceObserver;
    const intersectionObserver = environment.IntersectionObserver;
    const MouseEventClass = environment.MouseEvent || MouseEvent;
    const KeyboardEventClass = environment.KeyboardEvent || KeyboardEvent;
    const EventClass = environment.Event || Event;
    const nodeElement = environment.Node?.ELEMENT_NODE || 1;
    const config = { ...defaultConfig };
    const eventConfig = structuredClone(defaultEventConfig);
    const state = {
      failuresInARow: 0,
      attemptLedger: new Map(),
      stateSig: null,
      replanCount: 0,
      lastStateSig: null,
      lastSuccessfulStateSig: null,
      navigationInProgress: false,
      lastUrl: win.location.href,
    };
    const events = { route: [], dom: [], network: [], user: [], error: [], form: [], performance: [], a11y: [], visual: [] };
    let extensionContextValid = true;
    let activeProfile = 'balanced';
    let lastUrl = win.location.href;
    let currentUrl = win.location.href;
    let domObserver;
    let domChangeTimer;
    let networkIdleTimer;
    let inflightRequests = 0;
    let isNetworkIdle = false;

    function log(level, message, data = null) {
      if (!config.loggingEnabled || (level === 'debug' && !config.debugLogging)) return;
      const levels = ['debug', 'info', 'warn', 'error'];
      if (levels.indexOf(level) < levels.indexOf(config.logLevel)) return;
      const logEntry = { timestamp: new Date().toISOString(), level, message, url: win.location.href, data };
      consoleApi.log(`[CONTENT:${level.toUpperCase()}] ${logEntry.timestamp} - ${message}`, data || '');
      if (!extensionContextValid) return;
      try {
        if (chromeApi?.runtime?.id) {
          const pending = chromeApi.runtime.sendMessage({ type: 'LOG', logEntry });
          if (pending?.catch) pending.catch(() => { extensionContextValid = false; });
        }
      } catch {
        extensionContextValid = false;
      }
    }

    function addEvent(bucket, eventType, details, settings = {}) {
      if (settings.disabled || settings.filtered || (settings.sampled && random() > eventConfig.performance.sampleRate)) return;
      const prior = events[bucket].at(-1);
      if (prior && now() - prior.timestamp < settings.minimum) return;
      const event = { type: bucket, [settings.typeKey || 'eventType']: eventType, details, timestamp: now() };
      events[bucket].push(event);
      if (events[bucket].length > settings.limit) events[bucket].shift();
      log('debug', `${bucket} event added`, { eventType, eventCount: events[bucket].length });
    }

    function addRouteEvent(to) {
      const url = new makeUrl(to);
      if ((eventConfig.thresholds.route.ignoreHashChanges && url.hash) || eventConfig.thresholds.route.ignoreQueryParams.some((param) => url.searchParams.has(param) || url.searchParams.toString().includes(param))) return;
      addEvent('route', 'route', { to }, { typeKey: 'to', minimum: eventConfig.thresholds.route.minTimeBetweenEvents, limit: eventConfig.maxEvents });
    }
    function addDOMEvent(changeType, details = {}) {
      addEvent('dom', changeType, details, { typeKey: 'changeType', minimum: eventConfig.thresholds.dom.minTimeBetweenEvents, limit: eventConfig.maxEvents, sampled: true });
    }
    function addNetworkEvent(eventType, details = {}) {
      addEvent('network', eventType, details, { minimum: eventConfig.thresholds.network.minTimeBetweenEvents, limit: eventConfig.maxEvents, sampled: true, filtered: !!details.url && eventConfig.filters.network.ignoreUrls.some((entry) => details.url.includes(entry)) });
    }
    function addUserEvent(eventType, details = {}) {
      addEvent('user', eventType, details, { minimum: eventConfig.thresholds.user.minTimeBetweenEvents, limit: eventConfig.maxEvents, sampled: true });
    }
    function addErrorEvent(errorType, details = {}) {
      const key = `capture${errorType[0].toUpperCase()}${errorType.slice(1)}Errors`;
      addEvent('error', errorType, details, { limit: eventConfig.thresholds.error.maxErrorEvents, disabled: !eventConfig.thresholds.error[key] });
    }
    function addFormEvent(eventType, details = {}) {
      addEvent('form', eventType, details, { minimum: eventConfig.thresholds.form.minTimeBetweenEvents, limit: eventConfig.maxEvents });
    }
    function addPerformanceEvent(eventType, details = {}) {
      addEvent('performance', eventType, details, { minimum: eventConfig.thresholds.performance.minTimeBetweenEvents, limit: eventConfig.maxEvents });
    }
    function addA11yEvent(eventType, details = {}) {
      addEvent('a11y', eventType, details, { minimum: eventConfig.thresholds.a11y.minTimeBetweenEvents, limit: eventConfig.maxEvents });
    }
    function addVisualEvent(eventType, details = {}) {
      addEvent('visual', eventType, details, { minimum: eventConfig.thresholds.visual.minTimeBetweenEvents, limit: eventConfig.maxEvents });
    }

    function updateNetworkIdle() {
      if (networkIdleTimer) timers.clearTimeout(networkIdleTimer);
      if (inflightRequests > 1) {
        isNetworkIdle = false;
        return;
      }
      networkIdleTimer = timers.setTimeout(() => {
        isNetworkIdle = true;
        addNetworkEvent('networkIdle');
      }, eventConfig.thresholds.network.idleDelay);
    }

    function isIgnoredElement(target, list) {
      return list.includes(target.tagName.toLowerCase());
    }
    function describeElement(target) {
      return { element: target.tagName.toLowerCase(), elementId: target.id || null, elementText: target.textContent?.trim().slice(0, 50) || null };
    }
    function onMutation(mutations) {
      const significant = mutations.filter((mutation) => {
        const target = mutation.target;
        if (mutation.type === 'attributes') {
          const attribute = mutation.attributeName;
          if ((eventConfig.thresholds.dom.ignoreStyleChanges && attribute === 'style') || !eventConfig.filters.dom.significantAttributes.some((pattern) => pattern.endsWith('*') ? attribute.startsWith(pattern.slice(0, -1)) : attribute === pattern)) return false;
        }
        if (!target) return true;
        if (isIgnoredElement(target, eventConfig.filters.dom.ignoreElements)) return false;
        const [minWidth, minHeight] = eventConfig.thresholds.dom.minElementSize;
        const rect = target.getBoundingClientRect();
        return rect.width >= minWidth && rect.height >= minHeight;
      });
      if (significant.length) addDOMEvent('mutation', { mutationCount: significant.length, types: [...new Set(significant.map((mutation) => mutation.type))] });
    }
    function scheduleMutation(mutations) {
      if (domChangeTimer) timers.clearTimeout(domChangeTimer);
      domChangeTimer = timers.setTimeout(() => onMutation(mutations), eventConfig.thresholds.dom.mutationDelay);
    }
    function handleRouteChange() {
      const next = win.location.href;
      if (next === currentUrl) return;
      currentUrl = next;
      addRouteEvent(next);
      isNetworkIdle = false;
      updateNetworkIdle();
    }

    function initializeEventTracking() {
      win.addEventListener('popstate', () => {
        if (win.location.href !== lastUrl) {
          addRouteEvent(win.location.href);
          lastUrl = win.location.href;
        }
      });
      if (mutationObserver) {
        domObserver = new mutationObserver(scheduleMutation);
        domObserver.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'src', 'data-*'] });
      }
      doc.addEventListener('click', (event) => {
        if (!isIgnoredElement(event.target, eventConfig.filters.user.ignoreElements)) addUserEvent('click', { ...describeElement(event.target), coordinates: [event.clientX, event.clientY] });
      }, true);
      doc.addEventListener('input', (event) => {
        if (!isIgnoredElement(event.target, eventConfig.filters.user.ignoreElements)) addUserEvent('input', { ...describeElement(event.target), inputType: event.target.type || 'text', valueLength: event.target.value?.length || 0 });
      }, true);
      doc.addEventListener('focus', (event) => !isIgnoredElement(event.target, eventConfig.filters.user.ignoreElements) && addUserEvent('focus', describeElement(event.target)), true);
      doc.addEventListener('blur', (event) => !isIgnoredElement(event.target, eventConfig.filters.user.ignoreElements) && addUserEvent('blur', describeElement(event.target)), true);
      doc.addEventListener('submit', (event) => addFormEvent('submit', { formId: event.target.id || null, formAction: event.target.action || null, formMethod: event.target.method || 'get', fieldCount: event.target.elements.length }), true);
      for (const type of ['change', 'invalid']) doc.addEventListener(type, (event) => {
        const target = event.target;
        if (eventConfig.filters.form.captureElements.includes(target.tagName.toLowerCase())) addFormEvent(type === 'invalid' ? 'validation' : 'change', { ...describeElement(target), elementName: target.name || null, elementType: target.type || null, valueLength: target.value?.length || 0, validationMessage: target.validationMessage || null });
      }, true);
      win.addEventListener('error', (event) => addErrorEvent('js', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error?.stack || null }));
      win.addEventListener('unhandledrejection', (event) => addErrorEvent('promise', { reason: event.reason?.toString() || 'Unknown promise rejection', promise: event.promise }));
      win.addEventListener('error', (event) => {
        if (event.target?.tagName) addErrorEvent('resource', { element: event.target.tagName.toLowerCase(), src: event.target.src || event.target.href || null, error: event.error?.message || 'Resource loading failed' });
      }, true);
      initializePerformanceTracking();
      initializeA11yTracking();
      initializeVisualTracking();
    }

    function recordNavigation() {
      const navigation = environment.performance.getEntriesByType('navigation')[0];
      if (navigation) addPerformanceEvent('navigation', { loadTime: navigation.loadEventEnd - navigation.loadEventStart, domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart, firstPaint: environment.performance.getEntriesByType('paint')[0]?.startTime || null });
    }
    function initializePerformanceTracking() {
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', recordNavigation);
      else recordNavigation();
      if (!performanceObserver) return;
      const observer = new performanceObserver((list) => list.getEntries().forEach((entry) => {
        if (entry.entryType === 'resource' && !eventConfig.filters.performance.ignoreResources.some((part) => entry.name.includes(part))) addPerformanceEvent('resource', { url: entry.name, duration: entry.duration, size: entry.transferSize || null, type: entry.initiatorType });
      }));
      try { observer.observe({ entryTypes: ['resource'] }); } catch (error) { log('warn', 'PerformanceObserver not supported', { error: error.message }); }
    }
    function initializeA11yTracking() {
      const matches = (target) => target.matches(eventConfig.filters.a11y.captureElements.join(',')) || target.hasAttribute('aria-') || target.hasAttribute('role');
      for (const type of ['focusin', 'focusout']) doc.addEventListener(type, (event) => {
        if (matches(event.target)) addA11yEvent(type === 'focusin' ? 'focus' : 'blur', { ...describeElement(event.target), role: event.target.getAttribute('role') || null, tabIndex: event.target.getAttribute('tabindex') || null });
      }, true);
      if (!mutationObserver) return;
      const observer = new mutationObserver((changes) => changes.forEach((change) => {
        if (change.type === 'attributes' && change.attributeName?.startsWith('aria-') && change.target.matches(eventConfig.filters.a11y.captureElements.join(','))) addA11yEvent('aria-change', { ...describeElement(change.target), attribute: change.attributeName, oldValue: change.oldValue, newValue: change.target.getAttribute(change.attributeName) });
      }));
      observer.observe(doc.body, { attributes: true, attributeFilter: ['aria-expanded', 'aria-hidden', 'aria-selected', 'aria-checked', 'aria-pressed'], subtree: true });
    }
    function initializeVisualTracking() {
      if (!intersectionObserver) return;
      const observer = new intersectionObserver((entries) => entries.forEach((entry) => {
        const target = entry.target;
        const style = win.getComputedStyle(target);
        const hasAnimation = style.animationName !== 'none' || style.transitionProperty !== 'none';
        const hasAnimateClass = target.classList.contains('animate');
        const hasDataVisibility = target.hasAttribute('data-visibility');
        if (target.matches(eventConfig.filters.visual.captureElements.join(',')) || hasAnimation || hasAnimateClass || hasDataVisibility) addVisualEvent('visibilitychange', { ...describeElement(target), isIntersecting: entry.isIntersecting, intersectionRatio: entry.intersectionRatio, hasAnimation, hasAnimateClass, hasDataVisibility });
      }), { threshold: [0, 0.25, 0.5, 0.75, 1] });
      doc.querySelectorAll('*').forEach((element) => {
        const style = win.getComputedStyle(element);
        if (style.animationName !== 'none' || style.transitionProperty !== 'none' || element.classList.contains('animate') || element.hasAttribute('data-visibility')) observer.observe(element);
      });
      for (const type of ['animationstart', 'animationend']) doc.addEventListener(type, (event) => {
        if (event.target.matches(eventConfig.filters.visual.captureElements.join(','))) addVisualEvent(type, { ...describeElement(event.target), animationName: event.animationName, duration: type === 'animationend' ? event.elapsedTime : undefined });
      }, true);
    }

    function updateEventConfig(next) {
      if (typeof next === 'string' && configProfiles[next]) {
        activeProfile = next;
        Object.assign(eventConfig, configProfiles[next]);
      } else if (next && typeof next === 'object') Object.assign(eventConfig, next);
      reinitializeEventTracking();
    }
    function getEventConfig() {
      return { activeProfile, config: eventConfig, availableProfiles: Object.keys(configProfiles) };
    }
    function reinitializeEventTracking() {
      domObserver?.disconnect();
      for (const timer of [domChangeTimer, networkIdleTimer]) if (timer) timers.clearTimeout(timer);
      Object.values(events).forEach((list) => { list.length = 0; });
      initializeEventTracking();
    }
    function getRecentEvents() {
      return [...events.route.map((event) => ({ type: 'route', to: event.to })), ...events.dom.map((event) => ({ type: 'dom', changeType: event.changeType })), ...events.network.map((event) => ({ type: 'network', eventType: event.eventType }))].sort((left, right) => right.timestamp - left.timestamp).slice(0, eventConfig.maxEvents);
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = win.getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    }
    function getElementPosition(element) {
      let path = '';
      let current = element;
      for (let depth = 0; current?.parentElement && depth < 5; depth += 1) {
        const siblings = [...current.parentElement.children].filter((child) => child.tagName === current.tagName);
        path = `${siblings.indexOf(current)}${path}`;
        current = current.parentElement;
      }
      return path;
    }
    function generateElementId(element) {
      if (element.id) return element.id;
      if (element.getAttribute('data-testid')) return `testid-${element.getAttribute('data-testid')}`;
      const source = `${element.tagName.toLowerCase()}-${element.textContent?.trim().substring(0, 20) || ''}-${[...element.classList].join('')}-${getElementPosition(element)}`;
      let hash = 0;
      for (const character of source) hash = ((hash << 5) - hash) + character.charCodeAt(0);
      return `${element.tagName.toLowerCase()}-${Math.abs(hash).toString(36).substring(0, 6)}`;
    }
    function generateUniqueSelector(element) {
      if (element.id) return `#${element.id}`;
      if (element.getAttribute('data-testid')) return `[data-testid="${element.getAttribute('data-testid')}"]`;
      if (element.getAttribute('aria-label')) return `${element.tagName.toLowerCase()}[aria-label="${element.getAttribute('aria-label')}"]`;
      if (element.getAttribute('role')) return `${element.tagName.toLowerCase()}[role="${element.getAttribute('role')}"]`;
      const className = [...element.classList].find((entry) => !entry.includes('css-') && !entry.includes('wdapp') && !entry.includes('md') && entry.length > 2);
      if (className) return `${element.tagName.toLowerCase()}.${className}`;
      if (!element.parentElement) return element.tagName.toLowerCase();
      const siblings = [...element.parentElement.children].filter((child) => child.tagName === element.tagName);
      return `${element.tagName.toLowerCase()}:nth-child(${siblings.indexOf(element) + 1})`;
    }
    function generateXPath(element) {
      if (element.id) return `//*[@id="${element.id}"]`;
      if (element.getAttribute('data-testid')) return `//*[@data-testid="${element.getAttribute('data-testid')}"]`;
      let path = '';
      for (let current = element; current?.nodeType === nodeElement; current = current.parentElement) {
        const siblings = [...(current.parentElement?.children || [])].filter((child) => child.tagName === current.tagName);
        path = `/${current.tagName.toLowerCase()}${siblings.length > 1 ? `[${siblings.indexOf(current) + 1}]` : ''}${path}`;
      }
      return path;
    }
    function buildElementEntry(element, text, tagName, score = 0) {
      const rect = element.getBoundingClientRect();
      const source = element.tagName === 'A' ? element.href : element.tagName === 'IMG' ? element.src : null;
      let hrefHost = null;
      try {
        if (source) hrefHost = new makeUrl(source).hostname;
      } catch {
        hrefHost = null;
      }
      const id = generateElementId(element);
      element.setAttribute('data-element-id', id);
      return { id, tag: tagName, role: element.getAttribute('role'), text: text.length > 120 ? text.substring(0, 120) : text, ariaLabel: element.getAttribute('aria-label'), dataTestId: element.getAttribute('data-testid') || element.getAttribute('data-testId'), idAttr: element.id, classes: element.classList.length ? [...element.classList].slice(0, 3) : null, hrefHost, inputType: element.tagName === 'INPUT' ? element.getAttribute('type') : null, disabled: element.disabled || false, hidden: !isVisible(element), bbox: [rect.left, rect.top, rect.width, rect.height], visible: isVisible(element), score, cssSelector: generateUniqueSelector(element), xpath: generateXPath(element) };
    }
    function topKElements(intent, limit = config.topK) {
      const all = [...doc.querySelectorAll('*')].filter((element) => {
        const style = win.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !!element.textContent?.trim();
      });
      const interactive = all.filter((element) => {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const attributes = ['onclick', 'onmouseover', 'onkeydown', 'onsubmit', 'data-action', 'data-toggle', 'data-target', 'data-bs-toggle', 'data-bs-target', 'ng-click', 'v-on:click', '@click', 'onmousedown', 'onmouseup', 'ontouchstart', 'ontouchend', 'data-value', 'data-option', 'aria-selected', 'aria-expanded'];
        const named = ['button', 'a', 'input', 'select', 'option'].includes(tag) || ['button', 'link', 'menuitem', 'option', 'listbox', 'combobox'].includes(role);
        return named || element.onclick != null || element.onmouseover != null || element.onkeydown != null || element.onsubmit != null || win.getComputedStyle(element).cursor === 'pointer' || element.getAttribute('tabindex') != null || attributes.some((attribute) => element.getAttribute(attribute) != null) || ['button', 'click', 'tile', 'card', 'link', 'nav', 'menu', 'tab'].some((part) => element.className?.includes(part)) || element.getAttribute('data-testid') != null || element.getAttribute('data-test-id') != null;
      });
      const result = interactive.map((element) => buildElementEntry(element, element.textContent.trim(), element.tagName.toLowerCase(), element.getAttribute('role') ? 0.3 : 0)).sort((left, right) => right.score - left.score).slice(0, limit);
      log('debug', 'Element ranking completed', { intent, totalElements: result.length });
      return result;
    }
    function calculateStateSignature(elements) {
      try {
        const source = `${win.location.href}|${elements.slice(0, 10).map((element) => element.text?.trim()).filter((text) => text && text.length < 100).join('|')}`;
        let hash = 0;
        for (const character of new encode().encode(source)) hash = ((hash << 5) - hash) + character;
        return encode64(hash.toString(16)).substring(0, 32);
      } catch (error) {
        log('error', 'State signature calculation failed', { error: error.message });
        return 'error';
      }
    }
    async function captureScreenshot(elements) {
      if (!config.screenshotEnabled) return null;
      try {
        return (await chromeApi.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT', elements: elements.filter((element) => element.visible).map((element) => ({ id: element.id, bbox: element.bbox })) }))?.screenshot || null;
      } catch (error) {
        log('error', 'Screenshot capture failed', { error: error.message });
        return null;
      }
    }
    async function buildObservation(intent = '') {
      const url = win.location.href;
      if (state.lastUrl !== url) {
        state.navigationInProgress = true;
        timers.setTimeout(() => { state.navigationInProgress = false; }, 2000);
        Object.assign(state, { lastUrl: url, stateSig: null, lastStateSig: null, lastSuccessfulStateSig: null, replanCount: 0, failuresInARow: 0 });
        state.attemptLedger.clear();
      }
      if (state.navigationInProgress || doc.readyState !== 'complete') return new Promise((resolve) => timers.setTimeout(() => resolve(buildObservation(intent)), 100));
      const elements = topKElements(intent);
      const stateSig = calculateStateSignature(elements);
      if (state.stateSig === stateSig) state.replanCount += 1;
      else {
        if (state.stateSig !== null && state.lastSuccessfulStateSig !== state.stateSig) state.replanCount = 0;
        state.lastStateSig = state.stateSig;
        state.stateSig = stateSig;
      }
      return { url, viewport: { w: win.innerWidth, h: win.innerHeight }, screenshot: await captureScreenshot(elements), elements, events: getRecentEvents(), network: { inflight: inflightRequests }, errors: [], stateSig };
    }

    function findElement(locator) {
      if (!locator) return null;
      if (locator.strategy === 'css') return doc.querySelector(locator.value);
      if (locator.strategy === 'xpath') return doc.evaluate(locator.value, doc, null, environment.XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      if (locator.strategy === 'elementId') return doc.querySelector(`[data-element-id="${locator.value}"]`) || doc.getElementById(locator.value);
      if (locator.strategy === 'role') return doc.querySelector(`[role="${locator.value}"]`);
      if (locator.strategy === 'aria') return doc.querySelector(`[aria-label="${locator.value}"]`);
      if (locator.strategy === 'dataTestId') return doc.querySelector(`[data-testid="${locator.value}"]`);
      if (locator.strategy !== 'text') return null;
      const acceptable = (element, contains) => {
        const text = element.textContent?.trim();
        return text && text.length <= 100 && (contains ? text.toLowerCase().includes(locator.value.toLowerCase()) : text.toLowerCase() === locator.value.toLowerCase());
      };
      const interactive = [...doc.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]')];
      return interactive.find((element) => acceptable(element, false)) || [...doc.querySelectorAll('*')].find((element) => !['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NAV', 'HEADER', 'FOOTER'].includes(element.tagName) && acceptable(element, false)) || interactive.find((element) => acceptable(element, true)) || [...doc.querySelectorAll('*')].find((element) => !['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META', 'LINK', 'NAV', 'HEADER', 'FOOTER'].includes(element.tagName) && acceptable(element, true)) || null;
    }
    async function executeAction(action) {
      if (state.failuresInARow >= config.consecutiveFailureLimit) return { success: false, reason: 'CONSECUTIVE_FAILURES' };
      if (state.replanCount >= config.replanLimit) return { success: false, reason: 'STUCK_LOOP' };
      const key = `${action.op}-${action.locator?.value || 'none'}`;
      const entry = state.attemptLedger.get(key) || { count: 0, lastStateSig: null };
      if (entry.count >= config.attemptFailureLimit && entry.lastStateSig === state.stateSig) return { success: false, reason: 'FORCE_REPLAN' };
      entry.count += 1;
      entry.lastStateSig = state.stateSig;
      state.attemptLedger.set(key, entry);
      try {
        if (action.op === 'CLICK') {
          const element = findElement(action.locator);
          if (!element) return { success: false, reason: 'ELEMENT_NOT_FOUND' };
          let clicked = false;
          try {
            element.click();
            clicked = true;
          } catch {
            clicked = false;
          }
          if (!clicked && element.tagName === 'DIV') {
            try {
              element.dispatchEvent(new MouseEventClass('mousedown', { bubbles: true }));
              element.dispatchEvent(new MouseEventClass('mouseup', { bubbles: true }));
              clicked = true;
            } catch {
              clicked = false;
            }
          }
          if (!clicked && (element.tabIndex >= 0 || ['button', 'link'].includes(element.getAttribute('role')))) {
            try {
              element.focus();
              element.dispatchEvent(new KeyboardEventClass('keydown', { key: 'Enter', bubbles: true }));
              element.dispatchEvent(new KeyboardEventClass('keyup', { key: 'Enter', bubbles: true }));
              clicked = true;
            } catch {
              clicked = false;
            }
          }
          if (!clicked && (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button')) {
            try {
              element.focus();
              element.dispatchEvent(new KeyboardEventClass('keydown', { key: ' ', bubbles: true }));
              element.dispatchEvent(new KeyboardEventClass('keyup', { key: ' ', bubbles: true }));
              clicked = true;
            } catch {
              clicked = false;
            }
          }
          if (clicked) { state.failuresInARow = 0; state.lastSuccessfulStateSig = state.stateSig; return { success: true }; }
          return { success: false, reason: 'CLICK_FAILED' };
        }
        if (action.op === 'TYPE' && action.input?.text) {
          const element = findElement(action.locator);
          if (element?.tagName === 'INPUT') { element.focus(); element.value = action.input.text; element.dispatchEvent(new EventClass('input', { bubbles: true })); element.dispatchEvent(new EventClass('change', { bubbles: true })); state.failuresInARow = 0; state.lastSuccessfulStateSig = state.stateSig; return { success: true }; }
        }
        if (action.op === 'NAVIGATE' && action.input?.url) { win.location.href = action.input.url; return { success: true }; }
        if (action.op === 'SCROLL') { const element = findElement(action.locator); if (element) { element.scrollIntoView({ behavior: 'smooth' }); state.failuresInARow = 0; state.lastSuccessfulStateSig = state.stateSig; return { success: true }; } }
        if (action.op === 'WAIT') { await new Promise((resolve) => timers.setTimeout(resolve, action.expect?.timeoutMs || 1000)); state.failuresInARow = 0; state.lastSuccessfulStateSig = state.stateSig; return { success: true }; }
        if (action.op === 'FINISH') return { success: true, reason: 'SUCCESS' };
        if (!['CLICK', 'TYPE', 'NAVIGATE', 'SCROLL'].includes(action.op)) return { success: false, reason: 'UNSUPPORTED_ACTION' };
        state.failuresInARow += 1;
        return { success: false, reason: 'ACTION_FAILED' };
      } catch (error) {
        state.failuresInARow += 1;
        return { success: false, reason: 'EXCEPTION', error: error.message };
      }
    }

    function installNetworkTracking() {
      const fetch = win.fetch;
      win.fetch = function (...args) {
        inflightRequests += 1;
        addNetworkEvent('request', { url: args[0], method: 'fetch' });
        return fetch.apply(this, args).then((response) => { addNetworkEvent('response', { url: args[0], status: response.status, method: 'fetch' }); return response; }).catch((error) => { addNetworkEvent('error', { url: args[0], error: error.message, method: 'fetch' }); throw error; }).finally(() => { inflightRequests -= 1; updateNetworkIdle(); });
      };
      const open = environment.XMLHttpRequest?.prototype.open;
      const send = environment.XMLHttpRequest?.prototype.send;
      if (!open || !send) return;
      environment.XMLHttpRequest.prototype.open = function (...args) { inflightRequests += 1; addNetworkEvent('request', { url: args[1], method: 'xhr' }); return open.apply(this, args); };
      environment.XMLHttpRequest.prototype.send = function (...args) { return send.apply(this, args).then(() => addNetworkEvent('response', { url: this.responseURL, status: this.status, method: 'xhr' })).catch((error) => addNetworkEvent('error', { url: this.responseURL, error: error.message, method: 'xhr' })).finally(() => { inflightRequests -= 1; updateNetworkIdle(); }); };
    }
    function onMessage(message, sender, sendResponse) {
      if (message.type === 'COLLECT') {
        buildObservation(message.intent).then((observation) => {
          if (state.failuresInARow) observation.errors.push(`Consecutive failures: ${state.failuresInARow}`);
          if (state.replanCount) observation.errors.push(`Replan count: ${state.replanCount}`);
          observation.replanCount = state.replanCount;
          if ([...state.attemptLedger.values()].some((entry) => entry.count >= config.attemptFailureLimit && entry.lastStateSig === state.stateSig)) observation.errors.push('FORCE_REPLAN: Same action failed twice without state change');
          if (state.replanCount >= config.replanLimit - 1) observation.errors.push(`APPROACHING_STUCK_LOOP: Replan count ${state.replanCount}/${config.replanLimit}`);
          sendResponse({ observation });
        });
        return true;
      }
      if (message.type === 'EXECUTE') { executeAction(message.action).then(sendResponse); return true; }
      if (message.type === 'UPDATE_EVENT_CONFIG') { updateEventConfig(message.config); sendResponse({ success: true, config: getEventConfig() }); return false; }
      if (message.type === 'GET_EVENT_CONFIG') { sendResponse(getEventConfig()); return false; }
      return false;
    }
    function start() {
      installNetworkTracking();
      const pushState = win.history.pushState;
      const replaceState = win.history.replaceState;
      win.history.pushState = function (...args) { pushState.apply(this, args); handleRouteChange(); };
      win.history.replaceState = function (...args) { replaceState.apply(this, args); handleRouteChange(); };
      initializeEventTracking();
      chromeApi.runtime.onMessage.addListener(onMessage);
      chromeApi.runtime.onSuspend?.addListener(() => { extensionContextValid = false; });
      win.open = () => null;
      doc.addEventListener('focusin', (event) => {
        if (event.target.tagName === 'INPUT' && event.target.type === 'file') log('info', 'File input focused', { elementId: event.target.id });
      });
      updateNetworkIdle();
      return api;
    }
    const api = { config, eventConfig, configProfiles, events, state, log, addEvent, addRouteEvent, addDOMEvent, addNetworkEvent, addUserEvent, addErrorEvent, addFormEvent, addPerformanceEvent, addA11yEvent, addVisualEvent, updateNetworkIdle, onMutation, scheduleMutation, handleRouteChange, initializeEventTracking, initializePerformanceTracking, initializeA11yTracking, initializeVisualTracking, updateEventConfig, getEventConfig, reinitializeEventTracking, getRecentEvents, isVisible, getElementPosition, generateElementId, generateUniqueSelector, generateXPath, buildElementEntry, topKElements, calculateStateSignature, captureScreenshot, buildObservation, findElement, executeAction, installNetworkTracking, onMessage, start, get isNetworkIdle() { return isNetworkIdle; }, get inflightRequests() { return inflightRequests; } };
    return api;
  }

  function initializeContentScript(host) {
    host.browserAutomationContent = exported;
    if (host.window?.browserAutomationInitialized) {
      host.console?.log('[CONTENT] Browser automation already initialized, skipping duplicate injection');
      return exported;
    }
    if (host.window && host.document && host.chrome) {
      host.window.browserAutomationInitialized = true;
      exported.instance = createContentScript(host).start();
    }
    return exported;
  }
  const exported = { createContentScript, defaultConfig, defaultEventConfig, configProfiles, initializeContentScript };
  initializeContentScript(global);
}(globalThis));
