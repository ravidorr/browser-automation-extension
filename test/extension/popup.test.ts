import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ElementMock {
  value: string;
  textContent: string;
  className: string;
  disabled: boolean;
  style: Record<string, string>;
  focus: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

interface PopupElements {
  status: ElementMock;
  startBtn: ElementMock;
  goalInput: ElementMock;
  version: ElementMock;
}

interface ChromeMessage {
  type: string;
  tabId?: number;
  goal?: string;
}

interface ChromeResponse {
  isRunning?: boolean;
  success?: boolean;
}

type SendMessage = (message: ChromeMessage, callback: (response: ChromeResponse | undefined) => void) => void;
type MockedSendMessage = ReturnType<typeof vi.fn<SendMessage>>;

const sourcePath = fileURLToPath(new URL('../../extension/popup.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');

interface PopupOptions {
  extensionInfo?: { version?: string };
  initialResponse?: ChromeResponse | undefined;
  savedGoal?: string;
  tabs?: { id: number }[];
}

function element(): ElementMock {
  return {
    value: '',
    textContent: '',
    className: '',
    disabled: false,
    style: {},
    focus: vi.fn(),
    click: vi.fn(),
    addEventListener: vi.fn(),
  };
}

function loadPopup(options: PopupOptions = {}): {
  elements: PopupElements;
  domReady: () => void;
  chrome: {
    sendMessage: MockedSendMessage;
    storageSet: ReturnType<typeof vi.fn>;
    statusListeners: ((message: { type: string; isRunning: boolean }) => void)[];
  };
} {
  const elements: PopupElements = {
    status: element(),
    startBtn: element(),
    goalInput: element(),
    version: element(),
  };
  const statusListeners: ((message: { type: string; isRunning: boolean }) => void)[] = [];
  let domReady: (() => void) | undefined;
  const sendMessage = vi.fn<SendMessage>((_message, callback) => {
    if (Object.hasOwn(options, 'initialResponse')) {
      callback(options.initialResponse);
    } else {
      callback({ isRunning: false });
    }
  });
  const storageSet = vi.fn();
  const context = {
    console: { error: vi.fn() },
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    },
    document: {
      addEventListener: (event: string, callback: () => void) => {
        if (event === 'DOMContentLoaded') {
          domReady = callback;
        }
      },
      getElementById: (id: keyof typeof elements) => elements[id],
    },
    chrome: {
      management: {
        getSelf: (callback: (info: { version?: string }) => void) => {
          callback(options.extensionInfo ?? { version: '1.2.3' });
        },
      },
      runtime: {
        sendMessage,
        onMessage: {
          addListener: (callback: (message: { type: string; isRunning: boolean }) => void) => statusListeners.push(callback),
        },
      },
      storage: {
        local: {
          get: (_keys: string[], callback: (value: { savedGoal?: string }) => void) => {
            callback({ savedGoal: options.savedGoal ?? 'Saved goal' });
          },
          set: storageSet,
        },
      },
      tabs: {
        query: (_query: unknown, callback: (tabs: { id: number }[]) => void) => {
          callback(options.tabs ?? [{ id: 7 }]);
        },
      },
    },
  };

  vm.runInNewContext(source, context, { filename: sourcePath });
  if (domReady === undefined) {
    throw new Error('Popup DOMContentLoaded handler was not registered');
  }

  return {
    elements,
    domReady,
    chrome: { sendMessage, storageSet, statusListeners },
  };
}

describe('popup UI', () => {
  let harness: ReturnType<typeof loadPopup>;

  beforeEach(() => {
    harness = loadPopup();
    harness.domReady();
  });

  it('hydrates saved state, version, and stopped status', () => {
    expect(harness.elements.version.textContent).toBe('v1.2.3');
    expect(harness.elements.goalInput.value).toBe('Saved goal');
    expect(harness.elements.status).toMatchObject({
      textContent: 'Status: Stopped',
      className: 'status stopped',
    });
    expect(harness.elements.startBtn).toMatchObject({
      textContent: 'Start Automation',
      disabled: false,
    });
  });

  it('focuses and highlights an empty goal without contacting Chrome', () => {
    harness.elements.goalInput.value = '';
    const click = harness.elements.startBtn.addEventListener.mock.calls
      .find(([event]) => event === 'click')?.[1] as () => void;

    click();

    expect(harness.elements.goalInput.focus).toHaveBeenCalled();
    expect(harness.elements.goalInput.style).toEqual({
      borderColor: '#ddd',
      boxShadow: 'none',
    });
    expect(harness.chrome.storageSet).not.toHaveBeenCalled();
  });

  it('starts the active tab automation and updates status from callbacks', () => {
    const sendMessage = harness.chrome.sendMessage;
    sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_STATUS') {
        callback({ isRunning: false });
      } else {
        callback({ success: true });
      }
    });
    harness.elements.goalInput.value = '  Book a flight  ';
    const click = harness.elements.startBtn.addEventListener.mock.calls
      .find(([event]) => event === 'click')?.[1] as () => void;

    click();

    expect(harness.chrome.storageSet).toHaveBeenCalledWith({ savedGoal: 'Book a flight' });
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'START_AUTOMATION',
      tabId: 7,
      goal: 'Book a flight',
    }, expect.any(Function));
    expect(harness.elements.status).toMatchObject({
      textContent: 'Status: Running',
      className: 'status running',
    });
    expect(harness.elements.startBtn).toMatchObject({
      textContent: 'Automation Running...',
      disabled: true,
    });

    const statusListener = harness.chrome.statusListeners[0];
    if (statusListener === undefined) {
      throw new Error('Popup status listener was not registered');
    }

    statusListener({ type: 'STATUS_UPDATE', isRunning: false });
    expect(harness.elements.status.textContent).toBe('Status: Stopped');
  });

  it('triggers the start button only for Ctrl+Enter', () => {
    const keydown = harness.elements.goalInput.addEventListener.mock.calls
      .find(([event]) => event === 'keydown')?.[1] as (event: { key: string; ctrlKey: boolean }) => void;

    keydown({ key: 'Enter', ctrlKey: true });
    keydown({ key: 'Enter', ctrlKey: false });

    expect(harness.elements.startBtn.click).toHaveBeenCalledOnce();
  });

  it('handles absent manifest data, saved goals, tabs, and start failures', () => {
    harness = loadPopup({
      extensionInfo: {},
      initialResponse: undefined,
      savedGoal: '',
      tabs: [],
    });
    harness.domReady();

    expect(harness.elements.version.textContent).toBe('');
    expect(harness.elements.goalInput.value).toBe('');
    expect(harness.elements.status.textContent).toBe('Status: Stopped');

    harness.elements.goalInput.value = 'Start';
    const click = harness.elements.startBtn.addEventListener.mock.calls
      .find(([event]) => event === 'click')?.[1] as () => void;
    click();
    expect(harness.chrome.storageSet).toHaveBeenCalledWith({ savedGoal: 'Start' });
    expect(harness.chrome.sendMessage).toHaveBeenCalledTimes(1);

    harness = loadPopup();
    harness.domReady();
    harness.chrome.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_STATUS') {
        callback({ isRunning: true });
      } else {
        callback({ success: false });
      }
    });
    harness.elements.goalInput.value = 'Start';
    const failedClick = harness.elements.startBtn.addEventListener.mock.calls
      .find(([event]) => event === 'click')?.[1] as () => void;
    failedClick();
    expect(harness.elements.status.textContent).toBe('Status: Stopped');
  });

  it('ignores non-status runtime messages', () => {
    const statusListener = harness.chrome.statusListeners[0];
    if (statusListener === undefined) {
      throw new Error('Popup status listener was not registered');
    }

    statusListener({ type: 'OTHER', isRunning: true });

    expect(harness.elements.status.textContent).toBe('Status: Stopped');
  });
});
