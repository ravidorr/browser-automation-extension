import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

interface EventRecord extends Record<string, unknown> {
  type?: string;
  target?: FakeElement | null | undefined;
  changeType?: string;
  eventType?: string;
  timestamp?: number;
  to?: string;
}

interface MutationChange {
  type: string;
  attributeName?: string;
  oldValue?: string;
  target: FakeElement | null;
}

interface ObserverEntry {
  target: FakeElement;
  isIntersecting: boolean;
  intersectionRatio: number;
}

interface PerformanceEntry {
  entryType?: string;
  name?: string;
  duration?: number;
  transferSize?: number;
  initiatorType?: string;
}

interface ContentAction {
  op: string;
  locator?: { strategy: string; value: string };
  input?: { text?: string; url?: string };
  expect?: { timeoutMs?: number };
}

interface ContentEvent extends Record<string, unknown> {
  changeType?: string;
  eventType?: string;
  timestamp?: number;
  to?: string;
}

interface ContentThreshold {
  minTimeBetweenEvents?: number;
  captureJsErrors?: boolean;
}

interface ContentThresholds {
  route: ContentThreshold;
  dom: ContentThreshold;
  network: ContentThreshold;
  user: ContentThreshold;
  form: ContentThreshold;
  performance: ContentThreshold;
  a11y: ContentThreshold;
  visual: ContentThreshold;
  error: ContentThreshold;
  [key: string]: ContentThreshold;
}

interface ContentEvents {
  route: ContentEvent[];
  dom: ContentEvent[];
  network: ContentEvent[];
  user: ContentEvent[];
  form: ContentEvent[];
  performance: ContentEvent[];
  a11y: ContentEvent[];
  visual: ContentEvent[];
  error: ContentEvent[];
  [key: string]: ContentEvent[];
}

interface ContentApi {
  config: {
    screenshotEnabled: boolean;
    consecutiveFailureLimit: number;
    replanLimit: number;
    attemptFailureLimit: number;
    debugLogging: boolean;
    logLevel: string;
  };
  eventConfig: {
    activeProfile?: string;
    maxEvents: number;
    thresholds: ContentThresholds;
    performance: { sampleRate: number };
  };
  events: ContentEvents;
  inflightRequests: number;
  isNetworkIdle: boolean;
  state: {
    stateSig: string;
    failuresInARow: number;
    replanCount: number;
    lastSuccessfulStateSig: string | null;
    attemptLedger: Map<string, { count: number; lastStateSig: string }>;
  };
  start(): ContentApi;
  log(level: string, message: string): void;
  addRouteEvent(url: string): void;
  addDOMEvent(changeType: string): void;
  addNetworkEvent(eventType: string, details?: Record<string, unknown>): void;
  addUserEvent(eventType: string): void;
  addFormEvent(eventType: string): void;
  addPerformanceEvent(eventType: string): void;
  addA11yEvent(eventType: string): void;
  addVisualEvent(eventType: string): void;
  addErrorEvent(eventType: string, details?: Record<string, unknown>): void;
  updateNetworkIdle(): void;
  onMutation(changes: MutationChange[]): void;
  scheduleMutation(changes: MutationChange[]): void;
  handleRouteChange(): void;
  updateEventConfig(config: string | { maxEvents: number }): void;
  getEventConfig(): { activeProfile?: string };
  getRecentEvents(): ContentEvent[];
  initializePerformanceTracking(): void;
  initializeEventTracking(): void;
  generateElementId(element: FakeElement): string;
  generateUniqueSelector(element: FakeElement): string;
  generateXPath(element: FakeElement): string;
  buildElementEntry(element: FakeElement, text: string, tagName: string): { hrefHost: string | null; text: string };
  isVisible(element: FakeElement): boolean;
  topKElements(intent: string, limit?: number): { id: string }[];
  calculateStateSignature(elements: { text: string }[]): string;
  captureScreenshot(elements: { id: string; visible: boolean; bbox: number[] }[]): Promise<string | null>;
  buildObservation(intent: string): Promise<{ elements: { id: string }[]; url: string }>;
  findElement(locator?: { strategy: string; value: string }): FakeElement | null;
  executeAction(action: ContentAction): Promise<Record<string, unknown>>;
  onMessage(message: { type: string; config?: { maxEvents: number }; action?: ContentAction; intent?: string }, sender: unknown, sendResponse: (result: ContentResponse) => void): boolean;
  installNetworkTracking(): void;
}

interface ContentModule {
  defaultConfig: { topK: number };
  createContentScript(environment: unknown): ContentApi;
  initializeContentScript(host: unknown): ContentModule;
}

interface ContentResponse extends Record<string, unknown> {
  success?: boolean;
  observation?: { errors: string[] };
}

type Listener = (event: EventRecord) => void;
type HistoryMethod = (state: unknown, unused: string, url: string) => void;
type MockedHistoryMethod = ReturnType<typeof vi.fn<HistoryMethod>>;
type FetchMethod = (url: string) => Promise<{ status: number }>;
type MockedFetchMethod = ReturnType<typeof vi.fn<FetchMethod>>;

class FakeEventTarget {
  listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: EventRecord = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...event });
  }
}

class FakeElement extends FakeEventTarget {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  textContent = '';
  id = '';
  className = '';
  href = '';
  src = '';
  type = '';
  name = '';
  value = '';
  action = '';
  method = '';
  validationMessage = '';
  disabled = false;
  tabIndex = -1;
  onclick: unknown = null;
  onmouseover: unknown = null;
  onkeydown: unknown = null;
  onsubmit: unknown = null;
  nodeType = 1;
  click = vi.fn();
  focus = vi.fn();
  scrollIntoView = vi.fn();
  dispatchEvent = vi.fn();
  elements: FakeElement[] = [];
  rect = { left: 1, top: 2, width: 20, height: 30 };
  style = {};

  constructor(readonly tagName: string, text = '') {
    super();
    this.textContent = text;
  }

  get classList(): { length: number; contains: (value: string) => boolean; [Symbol.iterator]: () => IterableIterator<string> } {
    const values = this.className.split(/\s+/).filter(Boolean);
    return {
      length: values.length,
      contains: (value: string) => values.includes(value),
      [Symbol.iterator]: function* iterator() { yield* values; },
    };
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  getAttribute(name: string): string | null {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    if (name === 'id') this.id = value;
    else if (name === 'class') this.className = value;
    else this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }

  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      const text = part.trim();
      if (text === '*') return true;
      if (text === this.tagName.toLowerCase()) return true;
      if (text.startsWith('#')) return this.id === text.slice(1);
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(text);
      if (attribute) {
        const name = attribute[1] ?? '';
        const value = attribute[2];
        return this.hasAttribute(name) && (!value || this.getAttribute(name) === value);
      }
      const tagAttribute = /^([a-z]+)\[([^=]+)="([^"]+)"\]$/.exec(text);
      if (tagAttribute === null) return false;

      const tagName = tagAttribute[1] ?? '';
      const name = tagAttribute[2] ?? '';
      const value = tagAttribute[3] ?? '';
      return tagName === this.tagName.toLowerCase() && this.getAttribute(name) === value;
    });
  }
}

class FakeDocument extends FakeEventTarget {
  body = new FakeElement('BODY');
  documentElement = { scrollHeight: 900 };
  readyState = 'complete';
  elements: FakeElement[] = [this.body];
  evaluated: FakeElement | null = null;

  add<T extends FakeElement[]>(...elements: T): T {
    this.body.append(...elements);
    this.elements.push(...elements);
    return elements;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.elements.filter((element) => element.matches(selector));
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.find((element) => element.id === id) ?? null;
  }

  evaluate(): { singleNodeValue: FakeElement | null } {
    return { singleNodeValue: this.evaluated };
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(readonly callback: (changes: MutationChange[]) => void) {
    FakeMutationObserver.instances.push(this);
  }
}

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = [];
  observe = vi.fn();

  constructor(readonly callback: (list: { getEntries: () => PerformanceEntry[] }) => void) {
    FakePerformanceObserver.instances.push(this);
  }
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  observe = vi.fn();

  constructor(readonly callback: (entries: ObserverEntry[]) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
}

class FakeEvent {
  constructor(readonly type: string, readonly init: Record<string, unknown>) {}
}

class FakeXMLHttpRequest {
  responseURL = 'https://app.test/xhr';
  status = 201;

  open(_method?: string, _url?: string): void {
    if (_method === undefined && _url === undefined) return;

    return undefined;
  }

  send(): Promise<void> {
    return Promise.resolve();
  }
}

interface FakeWindow extends FakeEventTarget {
  browserAutomationInitialized?: boolean;
  location: { href: string };
  innerWidth: number;
  innerHeight: number;
  scrollX: number;
  scrollY: number;
  history: {
    pushState: MockedHistoryMethod;
    replaceState: MockedHistoryMethod;
  };
  fetch: MockedFetchMethod;
  getComputedStyle: ReturnType<typeof vi.fn>;
  open: () => null;
}

type ChromeMessageListener = (message: { type: string }, sender: unknown, sendResponse: (result: ContentResponse) => void) => boolean;
type ChromeSendMessage = (message: { type?: string }) => Promise<unknown> | { catch: (callback: () => void) => void } | undefined;
type MockedChromeSendMessage = ReturnType<typeof vi.fn<ChromeSendMessage>>;
type AddChromeMessageListener = (listener: ChromeMessageListener) => void;

interface FakeEnvironment {
  window: FakeWindow;
  document: FakeDocument;
  chrome: {
    runtime: {
      id: string;
      sendMessage: MockedChromeSendMessage;
      onMessage: {
        addListener: ReturnType<typeof vi.fn<AddChromeMessageListener>>;
        listener: ChromeMessageListener;
      };
      onSuspend: {
        addListener: ReturnType<typeof vi.fn>;
        listener: () => void;
      };
    };
  };
  timers: {
    setTimeout: ReturnType<typeof vi.fn>;
    clearTimeout: ReturnType<typeof vi.fn>;
  };
  messages: { type?: string }[];
  now: () => number;
  advance: (milliseconds?: number) => void;
  random: ReturnType<typeof vi.fn>;
  URL: typeof URL;
  TextEncoder: unknown;
  btoa: typeof btoa;
  console: { log: ReturnType<typeof vi.fn> };
  MutationObserver: unknown;
  PerformanceObserver: unknown;
  IntersectionObserver: unknown;
  MouseEvent: unknown;
  KeyboardEvent: unknown;
  Event: typeof FakeEvent;
  Node: { ELEMENT_NODE: number };
  XMLHttpRequest: typeof FakeXMLHttpRequest;
  XPathResult: { FIRST_ORDERED_NODE_TYPE: number };
  performance: { getEntriesByType: ReturnType<typeof vi.fn> };
  baseFetch: MockedFetchMethod;
}

function createEnvironment(): FakeEnvironment {
  const document = new FakeDocument();
  const window = new FakeEventTarget() as FakeWindow;
  const timers = {
    setTimeout: vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
    clearTimeout: vi.fn(),
  };
  const messages: { type?: string }[] = [];
  const onMessage: {
    listener: ChromeMessageListener;
    addListener: ReturnType<typeof vi.fn<AddChromeMessageListener>>;
  } = {
    listener: (): boolean => false,
    addListener: vi.fn<AddChromeMessageListener>((listener) => {
      onMessage.listener = listener;
    }),
  };
  const onSuspend = {
    listener: (): void => undefined,
    addListener: vi.fn<(listener: () => void) => void>((listener) => {
      onSuspend.listener = listener;
    }),
  };
  const chrome = {
    runtime: {
      id: 'fake-extension',
      sendMessage: vi.fn<ChromeSendMessage>((message) => {
        messages.push(message);
        return Promise.resolve(message.type === 'CAPTURE_SCREENSHOT' ? { screenshot: 'image-data' } : undefined);
      }),
      onMessage,
      onSuspend,
    },
  };
  const history = {
    pushState: vi.fn<HistoryMethod>(),
    replaceState: vi.fn<HistoryMethod>(),
  };
  Object.assign(window, {
    location: { href: 'https://app.test/home' },
    innerWidth: 1280,
    innerHeight: 720,
    scrollX: 10,
    scrollY: 20,
    history,
    fetch: vi.fn<FetchMethod>(() => Promise.resolve({ status: 200 })),
    getComputedStyle: vi.fn((element: FakeElement) => ({
      visibility: element.attributes.get('visibility') ?? 'visible',
      display: element.attributes.get('display') ?? 'block',
      opacity: element.attributes.get('opacity') ?? '1',
      cursor: element.attributes.get('cursor') ?? 'default',
      animationName: element.attributes.get('animation') ?? 'none',
      transitionProperty: element.attributes.get('transition') ?? 'none',
    })),
    open: () => null,
  });
  let time = 10_000;
  return {
    window,
    document,
    chrome,
    timers,
    messages,
    now: () => time,
    advance: (milliseconds = 1000) => { time += milliseconds; },
    random: vi.fn(() => 0),
    URL,
    TextEncoder,
    btoa,
    console: { log: vi.fn() },
    MutationObserver: FakeMutationObserver,
    PerformanceObserver: FakePerformanceObserver,
    IntersectionObserver: FakeIntersectionObserver,
    MouseEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    Event: FakeEvent,
    Node: { ELEMENT_NODE: 1 },
    XMLHttpRequest: FakeXMLHttpRequest,
    XPathResult: { FIRST_ORDERED_NODE_TYPE: 9 },
    performance: {
      getEntriesByType: vi.fn((type) => type === 'navigation'
        ? [{ loadEventEnd: 50, loadEventStart: 10, domContentLoadedEventEnd: 40, domContentLoadedEventStart: 20 }]
        : type === 'paint' ? [{ startTime: 7 }] : []),
    },
    baseFetch: window.fetch,
  };
}

let content: ContentModule;

beforeAll(async (): Promise<void> => {
  await vi.importActual<unknown>('../../extension/content.js');
  content = (globalThis as typeof globalThis & { browserAutomationContent: ContentModule }).browserAutomationContent;
});

beforeEach(() => {
  FakeMutationObserver.instances = [];
  FakePerformanceObserver.instances = [];
  FakeIntersectionObserver.instances = [];
});

describe('content script runtime', () => {
  it('starts through the retained classic-script bootstrap only once', () => {
    expect(typeof content.createContentScript).toBe('function');
    expect(content.defaultConfig.topK).toBe(60);
    const duplicate = { window: { browserAutomationInitialized: true }, console: { log: vi.fn() } };
    expect(content.initializeContentScript(duplicate)).toBe(content);
    expect(duplicate.console.log).toHaveBeenCalledWith('[CONTENT] Browser automation already initialized, skipping duplicate injection');

    const environment = createEnvironment();
    const host = { ...environment, browserAutomationContent: undefined };
    expect(content.initializeContentScript(host)).toBe(content);
    expect(host.window.browserAutomationInitialized).toBe(true);
  });

  it('records events, applies filters, sampling, limits, and network-idle transitions', () => {
    const environment = createEnvironment();
    const api = content.createContentScript(environment);

    api.eventConfig.thresholds.route.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.dom.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.network.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.user.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.form.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.performance.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.a11y.minTimeBetweenEvents = 0;
    api.eventConfig.thresholds.visual.minTimeBetweenEvents = 0;
    api.eventConfig.maxEvents = 1;
    api.addRouteEvent('https://app.test/next');
    api.addRouteEvent('https://app.test/next#anchor');
    api.addRouteEvent('https://app.test/next?utm_source=x');
    api.addDOMEvent('one');
    api.addDOMEvent('two');
    api.addNetworkEvent('request', { url: 'https://app.test/data' });
    api.addNetworkEvent('request', { url: 'https://analytics.test/data' });
    api.addUserEvent('click');
    api.addFormEvent('change');
    api.addPerformanceEvent('resource');
    api.addA11yEvent('focus');
    api.addVisualEvent('visibilitychange');
    api.addErrorEvent('js', { message: 'broken' });
    api.eventConfig.thresholds.error.captureJsErrors = false;
    api.addErrorEvent('js', { message: 'not recorded' });
    api.eventConfig.performance.sampleRate = 0;
    environment.random.mockReturnValueOnce(1);
    api.addDOMEvent('sampled-out');
    api.updateNetworkIdle();

    expect(api.events.route).toHaveLength(1);
    expect(api.events.dom.at(-1)?.changeType).toBe('two');
    expect(api.events.network).toHaveLength(1);
    expect(api.events.error).toHaveLength(1);
    expect(api.isNetworkIdle).toBe(true);
  });

  it('processes mutations, route changes, configuration profiles, and recent observations', () => {
    const environment = createEnvironment();
    const api = content.createContentScript(environment);
    const [button, script, small] = environment.document.add(
      new FakeElement('BUTTON', 'Save'),
      new FakeElement('SCRIPT', 'ignored'),
      new FakeElement('DIV', 'small'),
    );
    small.rect.width = 2;
    api.eventConfig.thresholds.dom.minTimeBetweenEvents = 0;
    api.onMutation([
      { type: 'attributes', attributeName: 'style', target: button },
      { type: 'attributes', attributeName: 'aria-label', target: button },
      { type: 'childList', target: script },
      { type: 'childList', target: small },
      { type: 'childList', target: null },
    ]);
    api.scheduleMutation([{ type: 'attributes', attributeName: 'href', target: button }]);
    environment.window.location.href = 'https://app.test/new';
    api.handleRouteChange();
    api.handleRouteChange();
    api.updateEventConfig('sensitive');
    api.updateEventConfig({ maxEvents: 3 });
    api.updateEventConfig('unknown');
    api.events.route.push({ to: 'route', timestamp: 1 });
    api.events.dom.push({ changeType: 'mutation', timestamp: 2 });
    api.events.network.push({ eventType: 'request', timestamp: 3 });

    expect(api.events.dom.some((event) => event.changeType === 'mutation')).toBe(true);
    expect(api.getEventConfig().activeProfile).toBe('sensitive');
    expect(api.getRecentEvents()).toEqual([
      { type: 'route', to: 'route' },
      { type: 'dom', changeType: 'mutation' },
      { type: 'network', eventType: 'request' },
    ]);
  });

  it('initializes browser event listeners and observers with DOM and Chrome fakes', () => {
    const environment = createEnvironment();
    const [button, input, form, image, visual] = environment.document.add(
      new FakeElement('BUTTON', 'Click'),
      new FakeElement('INPUT'),
      new FakeElement('FORM'),
      new FakeElement('IMG'),
      new FakeElement('DIV', 'Visible'),
    );
    input.id = 'query';
    input.type = 'text';
    input.value = 'typed';
    form.elements = [input];
    image.src = 'https://assets.test/image.png';
    visual.setAttribute('data-visibility', 'true');
    const api = content.createContentScript(environment).start();
    for (const key of Object.keys(api.eventConfig.thresholds)) {
      const threshold = api.eventConfig.thresholds[key];
      if (threshold !== undefined && 'minTimeBetweenEvents' in threshold) threshold.minTimeBetweenEvents = 0;
    }
    environment.document.emit('click', { target: button, clientX: 3, clientY: 4 });
    environment.document.emit('input', { target: input });
    environment.document.emit('focus', { target: input });
    environment.document.emit('blur', { target: input });
    environment.document.emit('submit', { target: form });
    environment.document.emit('change', { target: input });
    environment.document.emit('invalid', { target: input });
    environment.window.emit('error', { message: 'javascript', filename: 'file.js', lineno: 2, colno: 3, error: new Error('javascript') });
    environment.window.emit('error', { target: image, error: new Error('image') });
    environment.window.emit('unhandledrejection', { reason: 'rejected', promise: 'p' });
    environment.document.emit('focusin', { target: input });
    environment.document.emit('focusout', { target: input });
    environment.document.emit('animationstart', { target: visual, animationName: 'fade' });
    environment.document.emit('animationend', { target: visual, animationName: 'fade', elapsedTime: 2 });
    FakeMutationObserver.instances.at(-1)?.callback([{ type: 'attributes', attributeName: 'aria-expanded', oldValue: 'false', target: button }]);
    const intersectionObserver = FakeIntersectionObserver.instances[0];
    const performanceObserver = FakePerformanceObserver.instances[0];
    if (intersectionObserver === undefined || performanceObserver === undefined) {
      throw new Error('Expected content observers to be registered');
    }

    intersectionObserver.callback([{ target: visual, isIntersecting: true, intersectionRatio: 1 }]);
    performanceObserver.callback({ getEntries: () => [
      { entryType: 'resource', name: 'https://app.test/data', duration: 3, transferSize: 4, initiatorType: 'fetch' },
      { entryType: 'resource', name: 'https://analytics.test/data', duration: 3 },
    ] });
    environment.window.emit('popstate');
    environment.window.location.href = 'https://app.test/popstate';
    environment.window.emit('popstate');

    expect(api.events.user.map((event) => event.eventType)).toEqual(['click', 'input', 'focus', 'blur']);
    expect(api.events.form.map((event) => event.eventType)).toEqual(['submit', 'change', 'validation']);
    expect(api.events.error).toHaveLength(3);
    expect(api.events.a11y.map((event) => event.eventType)).toContain('aria-change');
    expect(api.events.visual.map((event) => event.eventType)).toContain('animationend');
  });

  it('creates stable element metadata, selectors, XPath values, and rankings', () => {
    const environment = createEnvironment();
    const [identified, tested, labelled, role, classed, positioned, anchor, hidden] = environment.document.add(
      new FakeElement('BUTTON', 'Identified'),
      new FakeElement('DIV', 'Tested'),
      new FakeElement('DIV', 'Labelled'),
      new FakeElement('DIV', 'Role'),
      new FakeElement('DIV', 'Class'),
      new FakeElement('SPAN', 'Positioned'),
      new FakeElement('A', 'Link'),
      new FakeElement('BUTTON', 'Hidden'),
    );
    identified.id = 'save';
    tested.setAttribute('data-testid', 'panel');
    labelled.setAttribute('aria-label', 'Close');
    role.setAttribute('role', 'button');
    classed.className = 'card css-ignore';
    anchor.href = 'https://example.test/path';
    hidden.setAttribute('display', 'none');
    const api = content.createContentScript(environment);

    expect(api.generateElementId(identified)).toBe('save');
    expect(api.generateElementId(tested)).toBe('testid-panel');
    expect(api.generateElementId(positioned)).toMatch(/^span-/);
    expect(api.generateUniqueSelector(identified)).toBe('#save');
    expect(api.generateUniqueSelector(tested)).toBe('[data-testid="panel"]');
    expect(api.generateUniqueSelector(labelled)).toBe('div[aria-label="Close"]');
    expect(api.generateUniqueSelector(role)).toBe('div[role="button"]');
    expect(api.generateUniqueSelector(classed)).toBe('div.card');
    expect(api.generateUniqueSelector(positioned)).toMatch(/^span:nth-child\(/);
    expect(api.generateXPath(identified)).toBe('//*[@id="save"]');
    expect(api.generateXPath(tested)).toBe('//*[@data-testid="panel"]');
    expect(api.generateXPath(positioned)).toContain('/span');
    expect(api.buildElementEntry(anchor, 'Link', 'a').hrefHost).toBe('example.test');
    expect(api.isVisible(hidden)).toBe(false);
    expect(api.topKElements('click', 2)).toHaveLength(2);
  });

  it('calculates signatures, captures screenshots, and builds observations', async () => {
    const environment = createEnvironment();
    const button = environment.document.add(new FakeElement('BUTTON', 'Save'))[0];
    const api = content.createContentScript(environment);
    expect(api.calculateStateSignature([{ text: 'Save' }])).toBeTypeOf('string');
    expect(await api.captureScreenshot([{ id: 'x', visible: true, bbox: [0, 0, 1, 1] }, { id: 'y', visible: false, bbox: [0, 0, 1, 1] }])).toBe('image-data');
    api.config.screenshotEnabled = false;
    await expect(api.captureScreenshot([])).resolves.toBeNull();
    api.config.screenshotEnabled = true;
    environment.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('offline'));
    await expect(api.captureScreenshot([])).resolves.toBeNull();
    const observation = await api.buildObservation('save');
    await api.buildObservation('save');
    environment.window.location.href = 'https://app.test/other';
    const afterNavigation = await api.buildObservation('save');

    expect(observation.elements[0]?.id).toBe(api.generateElementId(button));
    expect(afterNavigation.url).toBe('https://app.test/other');
  });

  it('finds every locator type including text fallbacks', () => {
    const environment = createEnvironment();
    const [button, div, long] = environment.document.add(
      new FakeElement('BUTTON', 'Exact'),
      new FakeElement('DIV', 'Contains phrase'),
      new FakeElement('DIV', 'x'.repeat(101)),
    );
    button.id = 'css-id';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', 'Go');
    button.setAttribute('data-testid', 'target');
    button.setAttribute('data-element-id', 'generated');
    environment.document.evaluated = div;
    const api = content.createContentScript(environment);

    expect(api.findElement()).toBeNull();
    expect(api.findElement({ strategy: 'css', value: '#css-id' })).toBe(button);
    expect(api.findElement({ strategy: 'xpath', value: '//div' })).toBe(div);
    expect(api.findElement({ strategy: 'elementId', value: 'generated' })).toBe(button);
    expect(api.findElement({ strategy: 'elementId', value: 'css-id' })).toBe(button);
    expect(api.findElement({ strategy: 'role', value: 'button' })).toBe(button);
    expect(api.findElement({ strategy: 'aria', value: 'Go' })).toBe(button);
    expect(api.findElement({ strategy: 'dataTestId', value: 'target' })).toBe(button);
    expect(api.findElement({ strategy: 'text', value: 'exact' })).toBe(button);
    expect(api.findElement({ strategy: 'text', value: 'phrase' })).toBe(div);
    expect(api.findElement({ strategy: 'unknown', value: 'x' })).toBeNull();
    expect(long.textContent).toHaveLength(101);
  });

  it('executes action success, failure, recovery, and safety-limit paths', async () => {
    const environment = createEnvironment();
    const [button, input, div] = environment.document.add(new FakeElement('BUTTON', 'Click'), new FakeElement('INPUT'), new FakeElement('DIV', 'Div'));
    button.id = 'button';
    input.id = 'input';
    div.id = 'div';
    const api = content.createContentScript(environment);
    api.state.stateSig = 'one';

    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#button' } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#missing' } })).resolves.toEqual({ success: false, reason: 'ELEMENT_NOT_FOUND' });
    await expect(api.executeAction({ op: 'TYPE', locator: { strategy: 'css', value: '#input' }, input: { text: 'hello' } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'TYPE', locator: { strategy: 'css', value: '#button' }, input: { text: 'hello' } })).resolves.toMatchObject({ reason: 'ACTION_FAILED' });
    await expect(api.executeAction({ op: 'SCROLL', locator: { strategy: 'css', value: '#div' } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'SCROLL', locator: { strategy: 'css', value: '#missing' } })).resolves.toMatchObject({ reason: 'ACTION_FAILED' });
    await expect(api.executeAction({ op: 'WAIT', expect: { timeoutMs: 1 } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'FINISH' })).resolves.toEqual({ success: true, reason: 'SUCCESS' });
    await expect(api.executeAction({ op: 'UNKNOWN' })).resolves.toEqual({ success: false, reason: 'UNSUPPORTED_ACTION' });
    api.state.failuresInARow = api.config.consecutiveFailureLimit;
    await expect(api.executeAction({ op: 'FINISH' })).resolves.toMatchObject({ reason: 'CONSECUTIVE_FAILURES' });
    api.state.failuresInARow = 0;
    api.state.replanCount = api.config.replanLimit;
    await expect(api.executeAction({ op: 'FINISH' })).resolves.toMatchObject({ reason: 'STUCK_LOOP' });
    api.state.replanCount = 0;
    api.state.attemptLedger.set('FINISH-none', { count: api.config.attemptFailureLimit, lastStateSig: 'one' });
    await expect(api.executeAction({ op: 'FINISH' })).resolves.toMatchObject({ reason: 'FORCE_REPLAN' });
  });

  it('patches network APIs and handles all Chrome messages', async () => {
    const environment = createEnvironment();
    const api = content.createContentScript(environment).start();
    api.eventConfig.thresholds.network.minTimeBetweenEvents = 0;
    await environment.window.fetch('https://app.test/fetch');
    environment.baseFetch.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(environment.window.fetch('https://app.test/fetch')).rejects.toThrow('fetch failed');
    const xhr = new environment.XMLHttpRequest();
    xhr.open('GET', 'https://app.test/xhr');
    await xhr.send();
    const responses: ContentResponse[] = [];
    expect(api.onMessage({ type: 'GET_EVENT_CONFIG' }, {}, (result) => responses.push(result))).toBe(false);
    expect(api.onMessage({ type: 'UPDATE_EVENT_CONFIG', config: { maxEvents: 2 } }, {}, (result) => responses.push(result))).toBe(false);
    expect(api.onMessage({ type: 'EXECUTE', action: { op: 'FINISH' } }, {}, (result) => responses.push(result))).toBe(true);
    expect(api.onMessage({ type: 'COLLECT', intent: 'anything' }, {}, (result) => responses.push(result))).toBe(true);
    expect(api.onMessage({ type: 'UNKNOWN' }, {}, () => undefined)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(responses.some((result) => result.success === true)).toBe(true);
    expect(responses.some((result) => result.observation)).toBe(true);
    expect(environment.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(environment.window.open()).toBeNull();
    environment.window.history.pushState({}, '', '/pushed');
    environment.window.history.replaceState({}, '', '/replaced');
    environment.chrome.runtime.onSuspend.listener();
    const file = environment.document.add(new FakeElement('INPUT'))[0];
    file.type = 'file';
    file.id = 'upload';
    environment.document.emit('focusin', { target: file });
    expect(api.inflightRequests).toBe(0);
  });

  it('covers logger, observers, action fallbacks, and exceptional browser APIs', async () => {
    const environment = createEnvironment();
    environment.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('context gone'));
    const api = content.createContentScript(environment);
    api.log('debug', 'visible debug');
    api.config.debugLogging = false;
    api.log('debug', 'hidden debug');
    api.config.debugLogging = true;
    api.config.logLevel = 'error';
    api.log('info', 'hidden info');
    api.config.logLevel = 'info';
    environment.chrome.runtime.sendMessage.mockImplementationOnce(() => { throw new Error('context gone'); });
    api.log('info', 'throws');
    const rejectedLogger = createEnvironment();
    const rejectedLoggerApi = content.createContentScript(rejectedLogger);
    rejectedLogger.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('context gone'));
    rejectedLoggerApi.log('info', 'rejected');
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    const synchronousRejection = createEnvironment();
    synchronousRejection.chrome.runtime.sendMessage.mockImplementationOnce(() => ({
      catch: (callback: () => void) => {
        callback();
      },
    }));
    content.createContentScript(synchronousRejection).log('info', 'synchronously rejected');

    const noObserver = createEnvironment();
    noObserver.PerformanceObserver = class {
      observe(): void { throw new Error('unsupported'); }
    };
    const withoutApis = createEnvironment();
    withoutApis.MutationObserver = undefined;
    withoutApis.IntersectionObserver = undefined;
    const noObserverApi = content.createContentScript(noObserver);
    noObserverApi.initializePerformanceTracking();
    const withoutApisRuntime = content.createContentScript(withoutApis);
    withoutApisRuntime.initializeEventTracking();

    const [div, link, button, input] = environment.document.add(
      new FakeElement('DIV', 'Mouse'),
      new FakeElement('A', 'Keyboard'),
      new FakeElement('BUTTON', 'Space'),
      new FakeElement('INPUT'),
    );
    div.id = 'div';
    link.id = 'link';
    button.id = 'button';
    input.id = 'input';
    div.click.mockImplementation(() => { throw new Error('no click'); });
    link.click.mockImplementation(() => { throw new Error('no click'); });
    link.tabIndex = 0;
    button.click.mockImplementation(() => { throw new Error('no click'); });
    input.focus.mockImplementation(() => { throw new Error('cannot focus'); });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#div' } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#link' } })).resolves.toEqual({ success: true });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#button' } })).resolves.toEqual({ success: true });
    const failed = environment.document.add(new FakeElement('DIV', 'Failed'))[0];
    failed.id = 'failed';
    failed.click.mockImplementation(() => { throw new Error('no click'); });
    failed.dispatchEvent.mockImplementation(() => { throw new Error('no mouse events'); });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#failed' } })).resolves.toEqual({ success: false, reason: 'CLICK_FAILED' });
    const keyboardFailure = environment.document.add(new FakeElement('A', 'Keyboard failure'))[0];
    keyboardFailure.id = 'keyboard-failure';
    keyboardFailure.tabIndex = 0;
    keyboardFailure.click.mockImplementation(() => { throw new Error('no click'); });
    keyboardFailure.focus.mockImplementation(() => { throw new Error('no keyboard focus'); });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#keyboard-failure' } })).resolves.toEqual({ success: false, reason: 'CLICK_FAILED' });
    const spaceFailure = environment.document.add(new FakeElement('BUTTON', 'Space failure'))[0];
    spaceFailure.id = 'space-failure';
    spaceFailure.click.mockImplementation(() => { throw new Error('no click'); });
    spaceFailure.focus.mockImplementation(() => { throw new Error('no space focus'); });
    await expect(api.executeAction({ op: 'CLICK', locator: { strategy: 'css', value: '#space-failure' } })).resolves.toEqual({ success: false, reason: 'CLICK_FAILED' });
    await expect(api.executeAction({ op: 'TYPE', locator: { strategy: 'css', value: '#input' }, input: { text: 'fail' } })).resolves.toMatchObject({ reason: 'EXCEPTION' });
    await expect(api.executeAction({ op: 'NAVIGATE', input: { url: 'https://app.test/navigation' } })).resolves.toEqual({ success: true });

    const invalidUrl = content.createContentScript(createEnvironment());
    expect(invalidUrl.buildElementEntry(Object.assign(new FakeElement('A', 'bad'), { href: ':' }), 'bad', 'a').hrefHost).toBeNull();
    const badSignature = createEnvironment();
    badSignature.TextEncoder = class { encode(): void { throw new Error('encoding'); } };
    expect(content.createContentScript(badSignature).calculateStateSignature([])).toBe('error');
  });

  it('waits for navigation readiness and records rejected XHR requests', async () => {
    const environment = createEnvironment();
    const scheduled: (() => void)[] = [];
    environment.timers.setTimeout.mockImplementation((callback: () => void) => {
      scheduled.push(callback);
      return scheduled.length;
    });
    const api = content.createContentScript(environment);
    environment.window.location.href = 'https://app.test/navigating';
    const pending = api.buildObservation('wait');
    scheduled.shift()?.();
    scheduled.shift()?.();
    await expect(pending).resolves.toMatchObject({ url: 'https://app.test/navigating' });

    class RejectingXHR {
      responseURL = 'https://app.test/rejected';
      status = 500;
      open(_method?: string, _url?: string): void {
        if (_method === undefined && _url === undefined) return;

        return undefined;
      }
      send(): Promise<never> { return Promise.reject(new Error('xhr failed')); }
    }
    const rejected = createEnvironment();
    rejected.XMLHttpRequest = RejectingXHR;
    const rejectedApi = content.createContentScript(rejected).start();
    rejectedApi.eventConfig.thresholds.network.minTimeBetweenEvents = 0;
    const xhr = new rejected.XMLHttpRequest();
    const pendingOne = new rejected.XMLHttpRequest();
    const pendingTwo = new rejected.XMLHttpRequest();
    xhr.open('GET', 'https://app.test/rejected');
    pendingOne.open('GET', 'https://app.test/pending-one');
    pendingTwo.open('GET', 'https://app.test/pending-two');
    await xhr.send();
    expect(rejectedApi.events.network.some((event) => event.eventType === 'error')).toBe(true);
  });

  it('covers runtime fallbacks, ignored events, and collect diagnostics', async () => {
    const fallback = createEnvironment();
    const globals = globalThis as unknown as Record<string, unknown>;
    const originalMouseEvent = globals.MouseEvent;
    const originalKeyboardEvent = globals.KeyboardEvent;
    globals.MouseEvent = FakeEvent;
    globals.KeyboardEvent = FakeEvent;
    Object.assign(fallback as unknown as Record<string, unknown>, {
      timers: undefined,
      now: undefined,
      random: undefined,
      URL: undefined,
      TextEncoder: undefined,
      btoa: undefined,
      console: undefined,
      MouseEvent: undefined,
      KeyboardEvent: undefined,
      Event: undefined,
      Node: undefined,
    });
    expect(content.createContentScript(fallback)).toBeDefined();
    globals.MouseEvent = originalMouseEvent;
    globals.KeyboardEvent = originalKeyboardEvent;

    const noChrome = createEnvironment();
    noChrome.chrome = {} as typeof noChrome.chrome;
    content.createContentScript(noChrome).log('info', 'no runtime');
    const noPromise = createEnvironment();
    noPromise.chrome.runtime.sendMessage.mockReturnValueOnce(undefined);
    content.createContentScript(noPromise).log('info', 'no promise');
    const throwingRuntime = createEnvironment();
    throwingRuntime.chrome.runtime.sendMessage.mockImplementationOnce(() => {
      throw new Error('runtime error');
    });
    content.createContentScript(throwingRuntime).log('info', 'runtime error');

    const environment = createEnvironment();
    const [ignored, plain, image, empty, long, ariaOnly, roleOnly, animated] = environment.document.add(
      new FakeElement('SCRIPT', 'ignored'),
      new FakeElement('INPUT'),
      new FakeElement('IMG', 'Image'),
      new FakeElement('DIV'),
      new FakeElement('DIV', 'x'.repeat(121)),
      new FakeElement('DIV', 'ARIA'),
      new FakeElement('DIV', 'Role'),
      new FakeElement('DIV', 'Animated'),
    );
    image.src = 'https://images.test/a.png';
    ariaOnly.setAttribute('aria-', 'true');
    roleOnly.setAttribute('role', 'region');
    animated.setAttribute('animation', 'slide');
    const api = content.createContentScript(environment).start();
    for (const threshold of Object.values(api.eventConfig.thresholds)) {
      if ('minTimeBetweenEvents' in threshold) threshold.minTimeBetweenEvents = 0;
    }
    environment.document.emit('click', { target: ignored });
    environment.document.emit('input', { target: ignored });
    environment.document.emit('input', { target: plain });
    environment.document.emit('change', { target: new FakeElement('DIV') });
    environment.document.emit('invalid', { target: new FakeElement('DIV') });
    environment.window.emit('error', { message: 'no stack', filename: 'a.js', lineno: 1, colno: 1 });
    environment.window.emit('unhandledrejection', { promise: 'p' });
    const hrefOnly = new FakeElement('LINK');
    hrefOnly.href = 'https://assets.test/sheet.css';
    environment.window.emit('error', { target: hrefOnly });
    environment.document.emit('focusin', { target: ariaOnly });
    environment.document.emit('focusout', { target: roleOnly });
    environment.document.emit('focusin', { target: new FakeElement('DIV') });
    environment.document.emit('animationstart', { target: new FakeElement('DIV') });
    const intersectionObserver = FakeIntersectionObserver.instances[0];
    if (intersectionObserver === undefined) {
      throw new Error('Expected intersection observer to be registered');
    }

    intersectionObserver.callback([
      { target: animated, isIntersecting: true, intersectionRatio: 1 },
      { target: new FakeElement('DIV'), isIntersecting: false, intersectionRatio: 0 },
    ]);
    api.onMutation([{ type: 'childList', target: new FakeElement('DIV') }]);
    api.onMutation([{ type: 'attributes', attributeName: 'style', target: plain }]);
    api.scheduleMutation([{ type: 'childList', target: plain }]);
    api.scheduleMutation([{ type: 'childList', target: plain }]);
    environment.performance.getEntriesByType.mockImplementation(() => []);
    api.initializePerformanceTracking();
    environment.document.readyState = 'loading';
    api.initializePerformanceTracking();
    environment.document.emit('DOMContentLoaded');
    environment.document.readyState = 'complete';
    environment.performance.getEntriesByType.mockImplementation((type) => type === 'navigation'
      ? [{ loadEventEnd: 9, loadEventStart: 3, domContentLoadedEventEnd: 8, domContentLoadedEventStart: 4 }]
      : []);
    api.initializePerformanceTracking();
    FakePerformanceObserver.instances.at(-1)?.callback({ getEntries: () => [
      { entryType: 'resource', name: 'https://app.test/no-size', duration: 1, initiatorType: 'fetch' },
    ] });
    FakeMutationObserver.instances.at(-1)?.callback([{ type: 'childList', target: new FakeElement('DIV') }]);
    environment.window.emit('error', { target: new FakeElement('IMG') });
    environment.document.emit('change', { target: plain });
    environment.document.emit('invalid', { target: plain });
    const noPerformanceObserver = createEnvironment();
    noPerformanceObserver.PerformanceObserver = undefined;
    content.createContentScript(noPerformanceObserver).initializePerformanceTracking();

    expect(api.buildElementEntry(image, 'Image', 'img').hrefHost).toBe('images.test');
    expect(api.buildElementEntry(plain, 'x'.repeat(121), 'input').text).toHaveLength(120);
    expect(api.generateElementId(empty)).toMatch(/^div-/);
    expect(api.topKElements('all').some((entry) => entry.id === api.generateElementId(empty))).toBe(false);
    expect(api.findElement({ strategy: 'text', value: 'absent' })).toBeNull();
    environment.chrome.runtime.sendMessage.mockResolvedValueOnce(undefined);
    await expect(api.captureScreenshot([])).resolves.toBeNull();
    await expect(api.executeAction({ op: 'WAIT' })).resolves.toEqual({ success: true });
    const noXhr = createEnvironment();
    noXhr.XMLHttpRequest = undefined as never;
    content.createContentScript(noXhr).installNetworkTracking();

    api.state.stateSig = 'previous-state';
    api.state.lastSuccessfulStateSig = null;
    api.state.replanCount = 2;
    await api.buildObservation('changed');
    api.state.failuresInARow = 1;
    api.state.replanCount = api.config.replanLimit - 1;
    api.state.attemptLedger.set('CLICK-x', { count: api.config.attemptFailureLimit, lastStateSig: api.state.stateSig });
    const responses: ContentResponse[] = [];
    api.onMessage({ type: 'COLLECT', intent: 'diagnostics' }, {}, (response) => responses.push(response));
    await new Promise((resolve) => setImmediate(resolve));
    expect(responses[0]?.observation?.errors).toContain('FORCE_REPLAN: Same action failed twice without state change');
    expect(long.textContent).toHaveLength(121);
  });
});
