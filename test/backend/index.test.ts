import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Action, Decision, NavigationState, Observation } from '../../backend/src/types';

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  storage: {
    createSession: vi.fn(),
    addStep: vi.fn(),
    addRating: vi.fn(),
    getSessionTrace: vi.fn(),
    getKPI: vi.fn(),
    getNavigationState: vi.fn(),
    createNavigationState: vi.fn(),
    addNavigationStep: vi.fn(),
    markActionAsTried: vi.fn(),
  },
}));

vi.mock('../../backend/src/llm', () => ({ decide: mocks.decide }));
vi.mock('../../backend/src/storage', () => ({ Storage: mocks.storage }));

import { app, createApp, errorHandler, startServer, startStandalone } from '../../backend/src/index';

const observation: Observation = {
  url: 'https://example.test/checkout',
  viewport: { w: 1280, h: 720 },
  screenshot: null,
  elements: [],
  events: [],
  network: { inflight: 0 },
  errors: [],
  stateSig: 'state-signature',
};

const navigationState: NavigationState = {
  sessionId: 'session-1',
  currentStepIndex: 0,
  navigationHistory: [],
  minScoreThreshold: 30,
  backtrackingEnabled: true,
};

const decision = (overrides: Partial<Decision> = {}): Decision => ({
  plan: 'Continue checkout',
  elementScores: [],
  actions: [],
  finish: null,
  ...overrides,
});

function createTestApp(): ReturnType<typeof createApp> {
  return createApp();
}

function createNonErrorValue(): Error {
  const error = new Error('not-an-error');
  Object.setPrototypeOf(error, null);
  return error;
}

function resetStorageMocks(): void {
  mocks.storage.createSession.mockReset().mockReturnValue({ id: 'session-created' });
  mocks.storage.addStep.mockReset().mockReturnValue('step-created');
  mocks.storage.addRating.mockReset();
  mocks.storage.getSessionTrace.mockReset().mockReturnValue(null);
  mocks.storage.getKPI.mockReset().mockReturnValue({
    totalSessions: 1,
    successRate: 100,
    upvotes: 1,
    downvotes: 0,
    averageRating: 1,
  });
  mocks.storage.getNavigationState.mockReset().mockReturnValue(undefined);
  mocks.storage.createNavigationState.mockReset().mockReturnValue(navigationState);
  mocks.storage.addNavigationStep.mockReset();
  mocks.storage.markActionAsTried.mockReset();
}

describe('backend app', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetStorageMocks();
    mocks.decide.mockReset().mockResolvedValue(decision());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports already-configured apps without opening a listener', async () => {
    await expect(request(app).get('/health')).resolves.toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });
    await expect(request(createTestApp()).get('/health')).resolves.toMatchObject({
      status: 200,
      body: { status: 'ok' },
    });
  });

  it('creates sessions and rejects absent and non-string goals', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/sessions').send({})).resolves.toMatchObject({
      status: 400,
      body: { error: 'Goal is required and must be a string' },
    });
    await expect(request(appUnderTest).post('/v1/sessions').send({ goal: 10 })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Goal is required and must be a string' },
    });
    await expect(request(appUnderTest).post('/v1/sessions').send({ goal: 'Buy a book' })).resolves.toMatchObject({
      status: 200,
      body: { sessionId: 'session-created' },
    });

    expect(mocks.storage.createSession).toHaveBeenCalledWith('Buy a book');
  });

  it('reports session storage failures, including non-Error failures', async () => {
    mocks.storage.createSession.mockImplementation(() => {
      throw createNonErrorValue();
    });

    await expect(request(createTestApp()).post('/v1/sessions').send({ goal: 'Buy a book' })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to create session', details: 'Unknown error' },
    });
  });

  it('stores valid observations and handles validation, request, and storage failures', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/observe').send({ observation })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Session ID is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/observe').send({
      sessionId: 7,
      observation,
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/steps/observe').send({ sessionId: 'session-1' })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Observation is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/observe').send({
      sessionId: 'session-1',
      observation: { url: 'not-a-complete-observation' },
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Invalid observation format' },
    });
    await expect(request(appUnderTest).post('/v1/steps/observe').send({
      sessionId: 'session-1',
      observation: { ...observation, stateSig: null },
    })).resolves.toMatchObject({
      status: 200,
      body: { stepId: 'step-created' },
    });

    mocks.storage.addStep.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(request(appUnderTest).post('/v1/steps/observe').send({
      sessionId: 'session-1',
      observation,
    })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to post observation', details: 'write failed' },
    });
  });

  it('rejects each invalid decision request branch', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/decide').send({})).resolves.toMatchObject({
      status: 400,
      body: { error: 'Session ID is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 7,
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Observation is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Intent is required and must be a string' },
    });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 4,
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation: { url: 'invalid' },
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Invalid observation format' },
    });

    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('creates navigation state and stores a normal LLM decision', async () => {
    const action: Action = { op: 'CLICK', locator: { strategy: 'css', value: '.buy' } };
    const llmDecision = decision({
      elementScores: [{ elementId: 'buy', score: 99, reason: 'Matches the intent' }],
      actions: [action],
      finish: { reason: 'SUCCESS', user_prompt: 'Done', evidence: [] },
    });
    mocks.decide.mockResolvedValueOnce(llmDecision);

    await expect(request(createTestApp()).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 200,
      body: { stepId: 'step-created', decision: llmDecision },
    });

    expect(mocks.storage.createNavigationState).toHaveBeenCalledWith('session-1');
    expect(mocks.storage.addNavigationStep).toHaveBeenCalledWith('session-1', expect.objectContaining({
      stateSig: 'state-signature',
      selectedAction: action,
      alternativeActions: [action],
    }));
  });

  it('uses existing navigation state and short-circuits stuck loops', async () => {
    mocks.storage.getNavigationState.mockReturnValueOnce(navigationState);

    const response = await request(createTestApp()).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation: {
        ...observation,
        errors: ['State unchanged after click'],
        replanCount: 3,
        stateSig: null,
      },
      intent: 'Buy',
    });

    expect(response).toMatchObject({
      status: 200,
      body: {
        stepId: 'step-created',
        decision: {
          finish: { reason: 'STUCK_LOOP' },
        },
      },
    });
    expect(mocks.decide).not.toHaveBeenCalled();
    expect(mocks.storage.createNavigationState).not.toHaveBeenCalled();
  });

  it('uses the safe decision when the LLM fails with an Error or another value', async () => {
    mocks.decide.mockRejectedValueOnce(new Error('provider offline')).mockRejectedValueOnce('provider unavailable');
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 200,
      body: { decision: { plan: 'LLM failed - cannot proceed without AI decision' } },
    });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 200,
      body: { decision: { finish: { reason: 'STUCK_LOOP' } } },
    });
  });

  it('returns schema and generic errors raised after LLM completion', async () => {
    mocks.storage.addStep
      .mockImplementationOnce(() => {
        throw new Error('SCHEMA_FAIL: output did not match the decision schema');
      })
      .mockImplementationOnce(() => {
        throw new Error('database unavailable');
      });
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'SCHEMA_FAIL', details: 'output did not match the decision schema' },
    });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to generate decision', details: 'database unavailable' },
    });
  });

  it('handles decisions with omitted scores, null signatures, and absent selected actions', async () => {
    const noScoresDecision = decision();
    delete noScoresDecision.elementScores;

    mocks.decide
      .mockResolvedValueOnce(noScoresDecision)
      .mockResolvedValueOnce({
        plan: 'Recordable decision with no state signature',
        elementScores: [{ elementId: 'buy', score: 100, reason: 'Match' }],
        actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.buy' } }],
        finish: null,
      })
      .mockResolvedValueOnce({
        plan: 'Defensive guard for an absent selected action',
        elementScores: [{ elementId: 'buy', score: 100, reason: 'Match' }],
        actions: [undefined] as unknown as Action[],
        finish: null,
      });
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation: { ...observation, stateSig: null, replanCount: null },
      intent: 'Buy',
    })).resolves.toMatchObject({ status: 200 });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation: { ...observation, stateSig: null },
      intent: 'Buy',
    })).resolves.toMatchObject({ status: 200 });
    await expect(request(appUnderTest).post('/v1/steps/decide').send({
      sessionId: 'session-1',
      observation,
      intent: 'Buy',
    })).resolves.toMatchObject({ status: 200 });

    expect(mocks.storage.addNavigationStep).toHaveBeenCalledWith('session-1', expect.objectContaining({
      stateSig: '',
    }));
  });

  it('stores execution results and handles validation and storage errors', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/steps/execute').send({ result: { success: true } })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Session ID is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/execute').send({
      sessionId: 1,
      result: { success: true },
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/steps/execute').send({ sessionId: 'session-1' })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Execution result is required' },
    });
    await expect(request(appUnderTest).post('/v1/steps/execute').send({
      sessionId: 'session-1',
      result: { success: true },
    })).resolves.toMatchObject({
      status: 200,
      body: { stepId: 'step-created' },
    });

    mocks.storage.addStep.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(request(appUnderTest).post('/v1/steps/execute').send({
      sessionId: 'session-1',
      result: { success: false, error: 'not found' },
    })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to post execution result', details: 'write failed' },
    });
  });

  it('records ratings and handles each validation and storage error branch', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/rate').send({ rating: 'up' })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Session ID is required' },
    });
    await expect(request(appUnderTest).post('/v1/rate').send({
      sessionId: 1,
      rating: 'up',
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/rate').send({
      sessionId: 'session-1',
      rating: 'sideways',
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'Rating must be "up" or "down"' },
    });
    await expect(request(appUnderTest).post('/v1/rate').send({
      sessionId: 'session-1',
      rating: 'up',
      note: { ignored: true },
    })).resolves.toMatchObject({ status: 200, body: { ok: true } });
    await expect(request(appUnderTest).post('/v1/rate').send({
      sessionId: 'session-1',
      rating: 'down',
      note: 'The page did not load',
    })).resolves.toMatchObject({ status: 200, body: { ok: true } });

    expect(mocks.storage.addRating).toHaveBeenNthCalledWith(1, 'session-1', 'up', undefined);
    expect(mocks.storage.addRating).toHaveBeenNthCalledWith(2, 'session-1', 'down', 'The page did not load');

    mocks.storage.addRating.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(request(appUnderTest).post('/v1/rate').send({
      sessionId: 'session-1',
      rating: 'up',
    })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to post rating', details: 'write failed' },
    });
  });

  it('gets traces and reports missing and failed trace retrievals', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).get('/v1/sessions/session-1/trace')).resolves.toMatchObject({
      status: 404,
      body: { error: 'Session not found' },
    });

    mocks.storage.getSessionTrace.mockReturnValueOnce({
      session: { id: 'session-1' },
      steps: [{ id: 'step-1' }],
      ratings: [{ rating: 'up' }],
    });
    await expect(request(appUnderTest).get('/v1/sessions/session-1/trace')).resolves.toMatchObject({
      status: 200,
      body: { session: { id: 'session-1' } },
    });

    mocks.storage.getSessionTrace.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    await expect(request(appUnderTest).get('/v1/sessions/session-1/trace')).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to retrieve session trace', details: 'read failed' },
    });
  });

  it('gets KPI data and reports retrieval failures', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).get('/v1/kpi')).resolves.toMatchObject({
      status: 200,
      body: { totalSessions: 1, successRate: 100 },
    });

    mocks.storage.getKPI.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    await expect(request(appUnderTest).get('/v1/kpi')).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to retrieve KPI', details: 'read failed' },
    });
  });

  it('gets navigation history and reports absent and failed navigation state retrievals', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).get('/v1/navigation/history/session-1')).resolves.toMatchObject({
      status: 404,
      body: { error: 'Navigation state not found' },
    });

    mocks.storage.getNavigationState.mockReturnValueOnce(navigationState);
    await expect(request(appUnderTest).get('/v1/navigation/history/session-1')).resolves.toMatchObject({
      status: 200,
      body: { sessionId: 'session-1' },
    });

    mocks.storage.getNavigationState.mockImplementationOnce(() => {
      throw createNonErrorValue();
    });
    await expect(request(appUnderTest).get('/v1/navigation/history/session-1')).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to retrieve navigation history', details: 'Unknown error' },
    });

    mocks.storage.getNavigationState.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    await expect(request(appUnderTest).get('/v1/navigation/history/session-1')).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to retrieve navigation history', details: 'read failed' },
    });
  });

  it('marks navigation actions as tried and handles validation and storage errors', async () => {
    const appUnderTest = createTestApp();

    await expect(request(appUnderTest).post('/v1/navigation/mark-tried/session-1').send({
      actionKey: 'CLICK-.buy',
    })).resolves.toMatchObject({
      status: 400,
      body: { error: 'stepIndex must be a number and actionKey must be a string' },
    });
    await expect(request(appUnderTest).post('/v1/navigation/mark-tried/session-1').send({
      stepIndex: 0,
      actionKey: 2,
    })).resolves.toMatchObject({ status: 400 });
    await expect(request(appUnderTest).post('/v1/navigation/mark-tried/session-1').send({
      stepIndex: 0,
      actionKey: 'CLICK-.buy',
    })).resolves.toMatchObject({ status: 200, body: { ok: true } });

    mocks.storage.markActionAsTried.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await expect(request(appUnderTest).post('/v1/navigation/mark-tried/session-1').send({
      stepIndex: 0,
      actionKey: 'CLICK-.buy',
    })).resolves.toMatchObject({
      status: 500,
      body: { error: 'Failed to mark action as tried', details: 'write failed' },
    });
  });

  it('uses the unhandled-error and 404 middleware behaviors', async () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();
    const response = { headersSent: false, status } as unknown as Parameters<typeof errorHandler>[2];
    const req = { path: '/broken', method: 'GET' } as Parameters<typeof errorHandler>[1];

    errorHandler(new Error('unexpected'), req, response, next);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: 'unexpected',
    });

    errorHandler('unexpected', req, { headersSent: true } as Parameters<typeof errorHandler>[2], next);
    expect(next).toHaveBeenCalledWith('unexpected');
    await expect(request(createTestApp()).get('/not-a-route')).resolves.toMatchObject({
      status: 404,
      body: { error: 'Route not found' },
    });
  });

  it('starts listeners only when explicitly requested', () => {
    const listen = vi.fn((_: string | number, onListening: () => void) => {
      onListening();
      return 'server';
    });
    const fakeApp = { listen } as unknown as Parameters<typeof startServer>[0];
    const originalEnvironment = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    expect(startServer(fakeApp, undefined)).toBe('server');
    expect(listen).toHaveBeenCalledWith(3000, expect.any(Function));
    startStandalone(false, fakeApp, 0);
    startStandalone(true, fakeApp, 0);
    expect(listen).toHaveBeenLastCalledWith(0, expect.any(Function));

    if (originalEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnvironment;
    }
  });
});
