import { beforeEach, describe, expect, it, vi } from 'vitest';

interface BackgroundApi {
  attemptBacktracking: (...args: unknown[]) => Promise<unknown>;
  automationLoop: (...args: unknown[]) => Promise<unknown>;
  captureScreenshotWithBoxes: (...args: unknown[]) => Promise<unknown>;
  createSession: (...args: unknown[]) => Promise<unknown>;
  finishAutomation: (...args: unknown[]) => Promise<unknown>;
  postDecision: (...args: unknown[]) => Promise<unknown>;
  postExecute: (...args: unknown[]) => Promise<unknown>;
  postObservation: (...args: unknown[]) => Promise<unknown>;
  postRating: (...args: unknown[]) => Promise<unknown>;
  promptRating: (...args: unknown[]) => Promise<unknown>;
  startAutomation: (...args: unknown[]) => Promise<unknown>;
  notifyPopupStatusChange: () => void;
  getState: () => { currentSessionId: unknown; currentTabId: unknown; isRunning: boolean };
  setPromptRatingForTesting: (provider: (() => Promise<{ rating: string; note?: string } | null>) | undefined) => void;
  setStartAutomationForTesting: (starter: (() => Promise<void>) | undefined) => void;
  setCaptureScreenshotForTesting: (capture: (() => Promise<string>) | undefined) => void;
  setAutomationStateForTesting: (state: { sessionId?: string | null; tabId?: number | null; running?: boolean }) => void;
  log: (level: string, message: string) => void;
}

type Fetch = (input: string, init?: Record<string, unknown>) => Promise<unknown>;
type MockedFetch = ReturnType<typeof vi.fn<Fetch>>;
type TabMessage = (tabId: number, message: Record<string, unknown>) => Promise<unknown>;
type MockedTabMessage = ReturnType<typeof vi.fn<TabMessage>>;
type CaptureVisibleTab = (...args: unknown[]) => Promise<string | null>;
type MockedCaptureVisibleTab = ReturnType<typeof vi.fn<CaptureVisibleTab>>;
type PopupMessage = (message: Record<string, unknown>) => Promise<void>;
type MockedPopupMessage = ReturnType<typeof vi.fn<PopupMessage>>;

type BackgroundRuntimeFactory = (dependencies: {
  logger: { log: ReturnType<typeof vi.fn>; table: ReturnType<typeof vi.fn> };
  fetch: MockedFetch;
  serviceWorkerGlobal: object;
  chrome: object;
}) => BackgroundApi;

declare global {
  var browserAutomationBackgroundRuntime: { createBackgroundRuntime: BackgroundRuntimeFactory } | undefined;
}

interface BackgroundHarness {
  api: BackgroundApi;
  fetch: MockedFetch;
  chrome: {
    actionClick: (tab: { id?: number; url?: string }) => void;
    messages: ((message: Record<string, unknown>, sender: { tab?: { id?: number } }, sendResponse: ReturnType<typeof vi.fn>) => boolean | undefined)[];
    tabUpdated: (tabId: number, changeInfo: { status?: string }, tab: { url?: string }) => void;
    tabRemoved: (tabId: number) => void;
    sendMessage: MockedTabMessage;
    captureVisibleTab: MockedCaptureVisibleTab;
    popupMessage: MockedPopupMessage;
  };
}

const backgroundModulePath = '../../extension/bg.js';
const backgroundModule = vi.importActual(backgroundModulePath);

function response(body: unknown, ok = true): { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> } {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Failure',
    json: () => Promise.resolve(body),
  };
}

async function loadBackground(): Promise<BackgroundHarness> {
  const messageListeners: BackgroundHarness['chrome']['messages'] = [];
  const sendMessage = vi.fn<TabMessage>();
  const captureVisibleTab = vi.fn<CaptureVisibleTab>();
  const popupMessage = vi.fn<PopupMessage>().mockResolvedValue(undefined);
  const fetch = vi.fn<Fetch>();
  const serviceWorkerGlobal = {};
  let actionClick: BackgroundHarness['chrome']['actionClick'] | undefined;
  let tabUpdated: BackgroundHarness['chrome']['tabUpdated'] | undefined;
  let tabRemoved: BackgroundHarness['chrome']['tabRemoved'] | undefined;
  await backgroundModule;
  const backgroundRuntime = globalThis.browserAutomationBackgroundRuntime;
  if (backgroundRuntime === undefined) {
    throw new Error('Background runtime factory was not registered');
  }

  const { createBackgroundRuntime } = backgroundRuntime;
  const api = createBackgroundRuntime({
    logger: { log: vi.fn(), table: vi.fn() },
    fetch,
    serviceWorkerGlobal,
    chrome: {
      action: {
        onClicked: {
          addListener: (listener: BackgroundHarness['chrome']['actionClick']) => {
            actionClick = listener;
          },
        },
      },
      tabs: {
        sendMessage,
        captureVisibleTab,
        onUpdated: {
          addListener: (listener: BackgroundHarness['chrome']['tabUpdated']) => {
            tabUpdated = listener;
          },
        },
        onRemoved: {
          addListener: (listener: BackgroundHarness['chrome']['tabRemoved']) => {
            tabRemoved = listener;
          },
        },
      },
      runtime: {
        sendMessage: popupMessage,
        onMessage: {
          addListener: (listener: BackgroundHarness['chrome']['messages'][number]) => {
            messageListeners.push(listener);
          },
        },
      },
    },
  });

  if (actionClick === undefined || tabUpdated === undefined || tabRemoved === undefined) {
    throw new Error('Background event listeners were not registered');
  }

  return {
    api,
    fetch,
    chrome: {
      actionClick,
      messages: messageListeners,
      tabUpdated,
      tabRemoved,
      sendMessage,
      captureVisibleTab,
      popupMessage,
    },
  };
}

describe('background service worker', () => {
  let harness: BackgroundHarness;

  beforeEach(async () => {
    harness = await loadBackground();
  });

  it('posts to each backend endpoint and propagates backend failures', async () => {
    harness.fetch
      .mockResolvedValueOnce(response({ sessionId: 'session-1' }))
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({ stepId: 'decision-1', decision: { actions: [] } }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }))
      .mockResolvedValueOnce(response({ ok: true }));

    await expect(harness.api.createSession('Checkout')).resolves.toBe('session-1');
    await expect(harness.api.postObservation('session-1', { elements: [], errors: [] })).resolves.toEqual({ stepId: 'observe-1' });
    await expect(harness.api.postDecision('session-1', { elements: [], errors: [] }, 'Checkout')).resolves.toMatchObject({ stepId: 'decision-1' });
    await expect(harness.api.postExecute('session-1', { success: true })).resolves.toEqual({ stepId: 'execute-1' });
    await expect(harness.api.postRating('session-1', 'up', 'Done')).resolves.toEqual({ ok: true });

    expect(harness.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/sessions',
      expect.objectContaining({ method: 'POST' }),
    );

    harness.fetch.mockResolvedValueOnce(response({}, false));
    await expect(harness.api.createSession('Checkout')).rejects.toThrow('HTTP 500: Failure');
  });

  it('finds untried backtracking actions and handles empty history or network failures', async () => {
    harness.fetch
      .mockResolvedValueOnce(response({
        navigationHistory: [{
          alternativeActions: [
            { op: 'CLICK', locator: { value: 'first' } },
            { op: 'CLICK', locator: { value: 'second' } },
          ],
          triedActions: ['CLICK-first'],
        }],
      }))
      .mockResolvedValueOnce(response({ ok: true }));

    await expect(harness.api.attemptBacktracking(
      'session-1',
      { op: 'CLICK', locator: { value: 'second' } },
    )).resolves.toEqual({
      success: true,
      stepIndex: 0,
      actions: [{ op: 'CLICK', locator: { value: 'second' } }],
    });
    expect(harness.fetch).toHaveBeenLastCalledWith(
      'http://localhost:3000/v1/navigation/mark-tried/session-1',
      expect.objectContaining({
        body: JSON.stringify({
          stepIndex: 0,
          actionKey: 'CLICK-second',
        }),
        method: 'POST',
      }),
    );

    harness = await loadBackground();
    harness.fetch.mockResolvedValueOnce(response({
      navigationHistory: [{
        alternativeActions: [{ op: 'WAIT', locator: null }],
        triedActions: [],
      }],
    }));
    await expect(harness.api.attemptBacktracking('session-1')).resolves.toMatchObject({
      success: true,
    });
    expect(harness.fetch).toHaveBeenCalledOnce();

    harness = await loadBackground();
    harness.fetch
      .mockResolvedValueOnce(response({
        navigationHistory: [{
          alternativeActions: [{ op: 'WAIT', locator: null }],
          triedActions: [],
        }],
      }))
      .mockResolvedValueOnce(response({ ok: true }));
    await expect(harness.api.attemptBacktracking(
      'session-1',
      { op: 'WAIT', locator: null },
    )).resolves.toMatchObject({
      success: true,
    });
    expect(harness.fetch).toHaveBeenLastCalledWith(
      'http://localhost:3000/v1/navigation/mark-tried/session-1',
      expect.objectContaining({
        body: JSON.stringify({
          stepIndex: 0,
          actionKey: 'WAIT-none',
        }),
        method: 'POST',
      }),
    );

    harness.fetch.mockResolvedValueOnce(response({ navigationHistory: [] }));
    await expect(harness.api.attemptBacktracking('session-1')).resolves.toEqual({
      success: false,
      reason: 'NO_BACKTRACK_OPTIONS',
    });

    harness.fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(harness.api.attemptBacktracking('session-1')).resolves.toEqual({
      success: false,
      reason: 'BACKTRACK_ERROR',
    });
  });

  it('runs a successful automation iteration without a browser', async () => {
    const observation = { elements: [], errors: [], stateSig: 'state' };
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation })
      .mockResolvedValueOnce({ success: true, reason: 'CLICKED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        stepId: 'decision-1',
        decision: {
          actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.checkout' } }],
        },
      }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session-1', 1, 'Checkout')).resolves.toEqual({
      success: true,
      reason: 'CLICKED',
    });
    expect(harness.chrome.sendMessage).toHaveBeenNthCalledWith(1, 1, {
      type: 'COLLECT',
      intent: 'Checkout',
    });
  });

  it('short-circuits failed collection and completed decisions', async () => {
    harness.chrome.sendMessage.mockResolvedValueOnce({ error: 'COLLECT_FAILED' });
    await expect(harness.api.automationLoop('session-1', 1, 'Checkout')).resolves.toEqual({
      success: false,
      reason: 'COLLECT_FAILED',
    });

    harness = await loadBackground();
    harness.chrome.sendMessage.mockResolvedValueOnce({ observation: { elements: [], errors: [] } });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [],
          finish: { reason: 'SUCCESS', user_prompt: 'Done' },
        },
      }));

    await expect(harness.api.automationLoop('session-1', 1, 'Checkout')).resolves.toEqual({
      success: true,
      reason: 'SUCCESS',
    });
  });

  it('responds to status, invalid start, logging, and screenshot messages', async () => {
    const handler = harness.chrome.messages[0];
    if (handler === undefined) {
      throw new Error('Background message handler was not registered');
    }
    const statusResponse = vi.fn();
    expect(handler({ type: 'GET_STATUS' }, {}, statusResponse)).toBe(false);
    expect(statusResponse).toHaveBeenCalledWith({ isRunning: false });

    const startResponse = vi.fn();
    expect(handler({ type: 'START_AUTOMATION', tabId: 1, goal: '  ' }, {}, startResponse)).toBeUndefined();
    expect(startResponse).toHaveBeenCalledWith({ success: false, error: 'No goal provided' });

    expect(handler({ type: 'LOG', logEntry: { message: 'hello', data: { safe: true } } }, {}, vi.fn())).toBe(false);

    harness.chrome.captureVisibleTab.mockResolvedValueOnce('data:image/png;base64,test');
    const screenshotResponse = vi.fn();
    expect(handler({ type: 'CAPTURE_SCREENSHOT', elements: [] }, { tab: { id: 1 } }, screenshotResponse)).toBe(true);
    await vi.waitFor(() => {
      expect(screenshotResponse).toHaveBeenCalledWith({
        screenshot: 'data:image/png;base64,test',
      });
    });

    harness.chrome.captureVisibleTab.mockRejectedValueOnce(new Error('capture denied'));
    const failedScreenshotResponse = vi.fn();
    handler({ type: 'CAPTURE_SCREENSHOT', elements: [] }, { tab: { id: 1 } }, failedScreenshotResponse);
    await vi.waitFor(() => {
      expect(failedScreenshotResponse).toHaveBeenCalledWith({ screenshot: null });
    });
  });

  it('returns null when capture and rating prompts cannot provide values', async () => {
    harness.chrome.captureVisibleTab.mockRejectedValueOnce(new Error('denied'));

    await expect(harness.api.captureScreenshotWithBoxes(1, [])).resolves.toBeNull();
    await expect(harness.api.promptRating()).resolves.toBeNull();
  });

  it('propagates non-success responses from every remaining backend endpoint', async () => {
    harness.fetch
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false));

    await expect(harness.api.postObservation('session', { elements: [], errors: [] })).rejects.toThrow('HTTP 500: Failure');
    await expect(harness.api.postDecision('session', { elements: [], errors: [] }, 'Goal')).rejects.toThrow('HTTP 500: Failure');
    await expect(harness.api.postExecute('session', { success: false })).rejects.toThrow('HTTP 500: Failure');
    await expect(harness.api.postRating('session', 'down')).rejects.toThrow('HTTP 500: Failure');
  });

  it('returns decision errors and execution exceptions from the automation loop', async () => {
    harness.chrome.sendMessage.mockResolvedValueOnce({ observation: { elements: [], errors: [] } });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({ error: 'DECIDE_FAILED' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: false,
      reason: 'DECIDE_FAILED',
    });

    harness = await loadBackground();
    harness.chrome.sendMessage.mockRejectedValueOnce(new Error('content script unavailable'));
    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toMatchObject({
      success: false,
      reason: 'EXCEPTION',
      error: 'content script unavailable',
    });
  });

  it('waits for expected events after a successful action', async () => {
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: true, reason: 'CLICKED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [{
            op: 'CLICK',
            locator: { strategy: 'css', value: '.continue' },
            expect: { event: 'domChange', timeoutMs: 1 },
          }],
        },
      }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: true,
      reason: 'CLICKED',
    });
  });

  it('uses the default wait duration when an expected event has no timeout', async () => {
    vi.useFakeTimers();
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: true, reason: 'CLICKED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [{
            op: 'CLICK',
            locator: { strategy: 'css', value: '.continue' },
            expect: { event: 'domChange', timeoutMs: 0 },
          }],
        },
      }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    const iteration = harness.api.automationLoop('session', 1, 'Goal');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(iteration).resolves.toEqual({ success: true, reason: 'CLICKED' });
    vi.useRealTimers();
  });

  it('tries alternatives, backtracks, and records terminal execution failures', async () => {
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: false, reason: 'FIRST_FAILED' })
      .mockResolvedValueOnce({ success: true, reason: 'SECOND_WORKED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [
            { op: 'CLICK', locator: { strategy: 'css', value: '.first' } },
            { op: 'CLICK', locator: { strategy: 'css', value: '.second' } },
          ],
        },
      }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: true,
      reason: 'SECOND_WORKED',
    });

    harness = await loadBackground();
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: false, reason: 'FAILED' })
      .mockResolvedValueOnce({ success: true });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: { actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.first' } }] },
      }))
      .mockResolvedValueOnce(response({
        navigationHistory: [{
          alternativeActions: [{ op: 'CLICK', locator: { value: 'fallback' } }],
          triedActions: [],
        }],
      }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: true,
      reason: 'BACKTRACK_SUCCESS',
    });
  });

  it('records failed backtracking when alternatives are unavailable or also fail', async () => {
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: false, reason: 'FAILED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: { actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.first' } }] },
      }))
      .mockResolvedValueOnce(response({ navigationHistory: [] }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: false,
      reason: 'ALL_ACTIONS_FAILED_NO_BACKTRACK',
    });

    harness = await loadBackground();
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: false, reason: 'FAILED' })
      .mockResolvedValueOnce({ success: false, reason: 'FALLBACK_FAILED' });
    harness.fetch
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: { actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.first' } }] },
      }))
      .mockResolvedValueOnce(response({
        navigationHistory: [{
          alternativeActions: [{ op: 'CLICK', locator: { value: 'fallback' } }],
          triedActions: [],
        }],
      }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));

    await expect(harness.api.automationLoop('session', 1, 'Goal')).resolves.toEqual({
      success: false,
      reason: 'BACKTRACK_FAILED',
    });
  });

  it('runs lifecycle handlers with mocked Chrome APIs', async () => {
    harness.chrome.sendMessage.mockResolvedValueOnce({ error: 'COLLECT_FAILED' });
    harness.fetch.mockResolvedValueOnce(response({ sessionId: 'session-1' }));

    await harness.api.startAutomation(4, 'Goal');
    expect(harness.api.getState()).toEqual({
      currentSessionId: null,
      currentTabId: null,
      isRunning: false,
    });
    expect(harness.chrome.popupMessage).toHaveBeenCalledWith({
      type: 'STATUS_UPDATE',
      isRunning: true,
    });

    harness.chrome.actionClick({ id: 4, url: 'https://example.test' });
    harness.chrome.tabUpdated(4, { status: 'complete' }, { url: 'https://example.test' });
    harness.chrome.tabRemoved(4);

    harness.chrome.popupMessage.mockRejectedValueOnce(new Error('no popup'));
    harness.api.notifyPopupStatusChange();
    await Promise.resolve();
  });

  it('rates an active session and handles active tab lifecycle callbacks', async () => {
    let releaseCollect: ((value: unknown) => void) | undefined;
    harness.fetch.mockResolvedValueOnce(response({ sessionId: 'session-1' }));
    harness.chrome.sendMessage.mockImplementationOnce(() => new Promise((resolve) => {
      releaseCollect = resolve;
    }));

    const start = harness.api.startAutomation(8, 'Goal');
    await vi.waitFor(() => { expect(harness.api.getState()).toMatchObject({
      currentSessionId: 'session-1',
      currentTabId: 8,
      isRunning: true,
    }); });
    harness.chrome.tabUpdated(8, { status: 'complete' }, { url: 'https://example.test' });
    harness.api.setPromptRatingForTesting(() => Promise.resolve({ rating: 'up', note: 'Done' }));
    harness.fetch.mockResolvedValueOnce(response({ ok: true }));
    harness.chrome.tabRemoved(8);
    await vi.waitFor(() => { expect(harness.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/rate',
      expect.objectContaining({ method: 'POST' }),
    ); });
    releaseCollect?.({ error: 'COLLECT_FAILED' });
    await start;
    expect(harness.api.getState()).toMatchObject({ currentSessionId: null, isRunning: false });
  });

  it('covers asynchronous start message responses and their test seam errors', async () => {
    const handler = harness.chrome.messages[0];
    if (handler === undefined) {
      throw new Error('Background message handler was not registered');
    }
    const accepted = vi.fn();
    harness.api.setStartAutomationForTesting(() => Promise.resolve());

    expect(handler({ type: 'START_AUTOMATION', tabId: 2, goal: 'Goal' }, {}, accepted)).toBe(true);
    await vi.waitFor(() => { expect(accepted).toHaveBeenCalledWith({ success: true }); });

    const rejected = vi.fn();
    harness.api.setStartAutomationForTesting(() => Promise.reject(new Error('start failed')));
    expect(handler({ type: 'START_AUTOMATION', tabId: 2, goal: 'Goal' }, {}, rejected)).toBe(true);
    await vi.waitFor(() => { expect(rejected).toHaveBeenCalledWith({
      success: false,
      error: 'start failed',
    }); });
  });

  it('rejects duplicate starts while startup is awaiting session creation', async () => {
    let releaseSession: ((value: unknown) => void) | undefined;
    harness.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      releaseSession = resolve;
    }));
    const start = harness.api.startAutomation(2, 'Goal');
    await vi.waitFor(() => { expect(harness.api.getState()).toMatchObject({ isRunning: true }); });
    const handler = harness.chrome.messages[0];
    if (handler === undefined) {
      throw new Error('Background message handler was not registered');
    }
    const responseCallback = vi.fn();

    expect(handler({ type: 'START_AUTOMATION', tabId: 2, goal: 'Goal' }, {}, responseCallback)).toBeUndefined();
    expect(responseCallback).toHaveBeenCalledWith({
      success: false,
      error: 'Automation already running',
    });

    await harness.api.startAutomation(3, 'Ignored while running');
    harness.chrome.sendMessage.mockResolvedValueOnce({ error: 'COLLECT_FAILED' });
    releaseSession?.(response({ sessionId: 'session-1' }));
    await start;
  });

  it('finishes a session with a null rating while startup remains in flight', async () => {
    let releaseCollect: ((value: unknown) => void) | undefined;
    harness.fetch.mockResolvedValueOnce(response({ sessionId: 'session-1' }));
    harness.chrome.sendMessage.mockImplementationOnce(() => new Promise((resolve) => {
      releaseCollect = resolve;
    }));
    const start = harness.api.startAutomation(2, 'Goal');
    await vi.waitFor(() => { expect(harness.api.getState()).toMatchObject({
      currentSessionId: 'session-1',
      isRunning: true,
    }); });

    harness.api.setPromptRatingForTesting(() => Promise.resolve(null));
    await harness.api.finishAutomation('USER_ABORTED');
    releaseCollect?.({ error: 'COLLECT_FAILED' });
    await start;
  });

  it('handles backend history errors, trims diagnostic logs, and reports screenshot handler errors', async () => {
    harness.fetch.mockResolvedValueOnce(response({}, false));
    await expect(harness.api.attemptBacktracking('session')).resolves.toEqual({
      success: false,
      reason: 'BACKTRACK_ERROR',
    });

    harness.fetch.mockResolvedValueOnce(response({
      navigationHistory: [{
        alternativeActions: [{ op: 'WAIT', locator: null }],
        triedActions: ['WAIT-none'],
      }],
    }));
    await expect(harness.api.attemptBacktracking('session')).resolves.toEqual({
      success: false,
      reason: 'NO_BACKTRACK_OPTIONS',
    });

    harness.fetch.mockResolvedValueOnce(response({ navigationHistory: [{}] }));
    await expect(harness.api.attemptBacktracking('session')).resolves.toEqual({
      success: false,
      reason: 'NO_BACKTRACK_OPTIONS',
    });

    harness.chrome.captureVisibleTab.mockResolvedValueOnce(null);
    await expect(harness.api.captureScreenshotWithBoxes(1, [])).resolves.toBeNull();

    for (let index = 0; index <= 1000; index += 1) {
      harness.api.log('debug', `message-${String(index)}`);
    }

    harness.api.setCaptureScreenshotForTesting(() => Promise.reject(new Error('capture failed')));
    const handler = harness.chrome.messages[0];
    if (handler === undefined) {
      throw new Error('Background message handler was not registered');
    }
    const responseCallback = vi.fn();
    expect(handler({ type: 'CAPTURE_SCREENSHOT', elements: [] }, { tab: { id: 1 } }, responseCallback)).toBe(true);
    await vi.waitFor(() => { expect(responseCallback).toHaveBeenCalledWith({ screenshot: null }); });

    harness.api.setPromptRatingForTesting(undefined);
    harness.api.setStartAutomationForTesting(undefined);
    harness.api.setCaptureScreenshotForTesting(undefined);
    expect(handler({ type: 'OTHER' }, {}, vi.fn())).toBeUndefined();
  });

  it('handles successful terminal, continuing, and exception start-loop outcomes', async () => {
    harness.fetch
      .mockResolvedValueOnce(response({ sessionId: 'session-1' }))
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.continue' } }],
        },
      }))
      .mockResolvedValueOnce(response({ stepId: 'execute-1' }));
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ success: true, reason: 'CLICKED' });
    await harness.api.startAutomation(1, 'Goal');

    harness = await loadBackground();
    harness.fetch
      .mockResolvedValueOnce(response({ sessionId: 'session-2' }))
      .mockResolvedValueOnce(response({ stepId: 'observe-1' }))
      .mockResolvedValueOnce(response({
        decision: {
          actions: [],
          finish: { reason: 'SUCCESS', user_prompt: 'Done' },
        },
      }));
    harness.chrome.sendMessage
      .mockResolvedValueOnce({ observation: { elements: [], errors: [] } })
      .mockResolvedValueOnce({ error: 'COLLECT_FAILED' });
    await harness.api.startAutomation(1, 'Goal');

    harness = await loadBackground();
    harness.fetch.mockRejectedValueOnce(new Error('session creation failed'));
    await harness.api.startAutomation(1, 'Goal');
  });

  it('sets lifecycle state explicitly for start, finish, and message guard branches', async () => {
    harness.api.setAutomationStateForTesting({ sessionId: 'session-1', tabId: 1, running: true });
    await harness.api.startAutomation(2, 'Ignored');

    const handler = harness.chrome.messages[0];
    if (handler === undefined) {
      throw new Error('Background message handler was not registered');
    }
    const guardedResponse = vi.fn();
    handler({ type: 'START_AUTOMATION', tabId: 2, goal: 'Ignored' }, {}, guardedResponse);
    expect(guardedResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Automation already running',
    });

    harness.api.setAutomationStateForTesting({ running: false });
    harness.fetch.mockRejectedValueOnce(new Error('session creation failed'));
    await harness.api.startAutomation(2, 'Run');

    harness.api.setAutomationStateForTesting({ sessionId: 'session-1', running: false });
    harness.api.setPromptRatingForTesting(() => Promise.resolve({ rating: 'up', note: 'Done' }));
    harness.fetch.mockResolvedValueOnce(response({ ok: true }));
    await harness.api.finishAutomation('DONE');

    harness.api.setAutomationStateForTesting({ sessionId: 'session-1', running: false });
    harness.api.setPromptRatingForTesting(() => Promise.resolve(null));
    await harness.api.finishAutomation('DONE');

    harness.api.setAutomationStateForTesting({ running: false });
    harness.api.setStartAutomationForTesting(() => Promise.resolve());
    const startedResponse = vi.fn();
    expect(handler({ type: 'START_AUTOMATION', tabId: 2, goal: 'Run' }, {}, startedResponse)).toBe(true);
    await vi.waitFor(() => { expect(startedResponse).toHaveBeenCalledWith({ success: true }); });
  });
});
