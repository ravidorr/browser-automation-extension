import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationManager } from '../../backend/src/navigation';
import { Storage } from '../../backend/src/storage';
import type { Action, ElementEntry, ElementScore } from '../../backend/src/types';

const clickAction: Action = {
  op: 'CLICK',
  locator: { strategy: 'css', value: '.continue' },
};

const element = (overrides: Partial<ElementEntry> = {}): ElementEntry => ({
  id: 'continue',
  bbox: [0, 0, 10, 10],
  visible: true,
  ...overrides,
});

describe('Storage', () => {
  beforeEach(() => {
    Storage.clearAll();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
  });

  it('creates, updates, and traces sessions with chronological steps and ratings', () => {
    const session = Storage.createSession('Complete checkout');
    const updated = Storage.updateSession(session.id, { status: 'completed' });
    const firstStep = Storage.addStep(session.id, 'observe', { observation: 1 } as never);

    vi.setSystemTime(new Date('2026-01-02T03:04:06.000Z'));
    const secondStep = Storage.addStep(session.id, 'execute', { success: true });
    Storage.addRating(session.id, 'up', 'Done');

    expect(session).toMatchObject({
      goal: 'Complete checkout',
      status: 'active',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
    expect(updated).toMatchObject({ id: session.id, status: 'completed' });
    expect(Storage.getSession('missing')).toBeUndefined();
    expect(Storage.updateSession('missing', {})).toBeUndefined();
    expect(Storage.getSessionTrace(session.id)).toMatchObject({
      session: { status: 'completed' },
      steps: [{ id: firstStep }, { id: secondStep }],
      ratings: [{ rating: 'up', note: 'Done' }],
    });
    expect(Storage.getSessionTrace('missing')).toBeNull();
    expect(Storage.getStats()).toEqual({ sessions: 1, steps: 2, ratings: 1 });
  });

  it('omits optional session and rating fields when their values are empty', () => {
    const session = Storage.createSession('');
    Storage.addRating(session.id, 'down', '');

    expect(session).not.toHaveProperty('goal');
    expect(Storage.getRating(session.id)).not.toHaveProperty('note');
    expect(Storage.getSessionTrace(Storage.createSession().id)).toMatchObject({ ratings: [] });
  });

  it('tracks navigation alternatives and backtracks to untried actions', () => {
    const state = Storage.createNavigationState('session', 40);
    const step = Storage.addNavigationStep('session', {
      stateSig: 'state-1',
      url: 'https://example.test',
      elementScores: [],
      selectedAction: clickAction,
      alternativeActions: [
        clickAction,
        { op: 'CLICK', locator: { strategy: 'text', value: 'Continue' } },
      ],
      triedActions: [],
    });

    expect(state.minScoreThreshold).toBe(40);
    expect(step.stepIndex).toBe(0);
    expect(step.alternativeActions).toBeInstanceOf(Array);
    expect(Storage.getUntriedActions('session', 0)).toHaveLength(2);
    Storage.markActionAsTried('session', 0, 'CLICK-.continue');
    Storage.markActionAsTried('session', 0, 'CLICK-.continue');

    expect(Storage.getUntriedActions('session', 0)).toEqual([
      { op: 'CLICK', locator: { strategy: 'text', value: 'Continue' } },
    ]);
    expect(Storage.canBacktrackToStep('session', 0)).toBe(true);
    expect(Storage.backtrackToStep('session', 0)).toMatchObject({
      success: true,
      actions: [{ locator: { value: 'Continue' } }],
    });
    expect(Storage.getLastNavigationStep('session')).toMatchObject({ stepIndex: 0 });
    expect(Storage.canBacktrack('session')).toBe(true);
  });

  it('returns safe values for absent or exhausted navigation state', () => {
    expect(Storage.getNavigationState('missing')).toBeUndefined();
    expect(Storage.updateNavigationState('missing', {})).toBeUndefined();
    expect(Storage.getUntriedActions('missing', 0)).toEqual([]);
    expect(Storage.canBacktrackToStep('missing', 0)).toBe(false);
    expect(Storage.backtrackToStep('missing', 0)).toEqual({
      success: false,
      actions: [],
      reason: 'Navigation state not found',
    });
    expect(Storage.canBacktrack('missing')).toBe(false);
    expect(Storage.getLastNavigationStep('missing')).toBeUndefined();
    expect(() => Storage.addNavigationStep('missing', {
      stateSig: '',
      url: '',
      elementScores: [],
      selectedAction: clickAction,
      alternativeActions: [],
      triedActions: [],
    })).toThrow('Navigation state not found');

    Storage.createNavigationState('session');
    Storage.addNavigationStep('session', {
      stateSig: '',
      url: '',
      elementScores: [],
      selectedAction: clickAction,
      alternativeActions: [],
      triedActions: [],
    });
    Storage.markActionAsTried('session', 9, 'unused');

    expect(Storage.canBacktrackToStep('session', 9)).toBe(false);
    expect(Storage.backtrackToStep('session', 0)).toEqual({
      success: false,
      actions: [],
      reason: 'No untried actions available at this step',
    });
  });

  it('calculates KPI values from the latest fifty ratings', () => {
    expect(Storage.getKPI()).toEqual({
      totalSessions: 0,
      upvotes: 0,
      downvotes: 0,
      successRate: 0,
      averageRating: 0,
    });

    Storage.addRating('first', 'up');
    vi.setSystemTime(new Date('2026-01-02T03:04:06.000Z'));
    Storage.addRating('second', 'down');

    expect(Storage.getKPI()).toEqual({
      totalSessions: 2,
      upvotes: 1,
      downvotes: 1,
      successRate: 50,
      averageRating: 0.5,
    });
  });

  it('handles sparse navigation history entries and null locators', () => {
    expect(new Storage().isStorage).toBe(true);
    const state = Storage.createNavigationState('session');
    state.navigationHistory.length = 1;

    Storage.markActionAsTried('session', 0, 'unused');
    expect(Storage.getUntriedActions('session', 0)).toEqual([]);
    expect(Storage.canBacktrackToStep('session', 0)).toBe(false);

    Storage.addNavigationStep('session', {
      stateSig: '',
      url: '',
      elementScores: [],
      selectedAction: clickAction,
      alternativeActions: [{ op: 'WAIT', locator: null }],
      triedActions: [],
    });
    expect(Storage.getUntriedActions('session', 1)).toEqual([{ op: 'WAIT', locator: null }]);
    Storage.markActionAsTried('session', 1, 'WAIT-none');
    expect(Storage.getUntriedActions('session', 1)).toEqual([]);
  });
});

describe('NavigationManager', () => {
  beforeEach(() => {
    Storage.clearAll();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('scores interactive elements and creates an action using the best locator', () => {
    const elements = [
      element({ id: 'disabled', role: 'button', disabled: true }),
      element({ id: 'continue', role: 'button', classes: ['continue'] }),
      element({ id: 'plain' }),
    ];
    const scores = NavigationManager.scoreElements(elements, 'continue');

    expect(scores).toEqual([
      { elementId: 'continue', score: 10, reason: 'Element has some relevance but low confidence' },
      { elementId: 'disabled', score: 0, reason: 'Element is not relevant to the task' },
      { elementId: 'plain', score: 0, reason: 'Element is not relevant to the task' },
    ]);

    Storage.createNavigationState('session', 10);
    expect(NavigationManager.getBestAction('session', scores, elements)).toEqual({
      op: 'CLICK',
      locator: { strategy: 'css', value: '.continue', alternates: [] },
      notes: 'Selected element with score 10: Element has some relevance but low confidence',
      confidence: 0.1,
    });
  });

  it('handles absent states and resolves locator fallbacks in priority order', () => {
    const scores: ElementScore[] = [{ elementId: 'target', score: 30, reason: 'good' }];
    const locatorCases: [Partial<ElementEntry>, Action['locator']][] = [
      [{ idAttr: 'target-id' }, { strategy: 'css', value: '#target-id', alternates: [] }],
      [{ dataTestId: 'target' }, { strategy: 'dataTestId', value: 'target', alternates: [] }],
      [{ ariaLabel: 'Target' }, { strategy: 'aria', value: 'Target', alternates: [] }],
      [{ role: 'button' }, { strategy: 'role', value: 'button', alternates: [] }],
      [{ text: ' Click me ' }, { strategy: 'text', value: 'Click me', alternates: [] }],
      [{ text: '   ' }, { strategy: 'css', value: 'div', alternates: [] }],
    ];

    expect(() => NavigationManager.getBestAction('missing', scores, [])).toThrow('Navigation state not found');
    Storage.createNavigationState('session', 30);
    expect(NavigationManager.getBestAction('session', [], [])).toBeNull();
    expect(NavigationManager.getBestAction('session', scores, [])).toBeNull();

    for (const [attributes, locator] of locatorCases) {
      expect(NavigationManager.getBestAction('session', scores, [element({ id: 'target', ...attributes })]))
        .toMatchObject({ locator });
    }

    expect(NavigationManager.getBestAction('session', scores, [
      element({ id: 'target', classes: [] }),
    ])).toMatchObject({ locator: { strategy: 'css', value: 'div' } });
    expect(NavigationManager.getBestAction('session', scores, [
      element({ id: 'target', classes: [undefined as unknown as string] }),
    ])).toMatchObject({ locator: { strategy: 'css', value: 'div' } });
  });

  it('identifies backtracking conditions and selects the next eligible prior score', () => {
    const state = Storage.createNavigationState('session', 30);
    const scores: ElementScore[] = [
      { elementId: 'selected', score: 100, reason: 'selected' },
      { elementId: 'next', score: 30, reason: 'next' },
      { elementId: 'low', score: 29, reason: 'low' },
    ];
    Storage.addNavigationStep('session', {
      stateSig: '',
      url: '',
      elementScores: scores,
      selectedAction: { op: 'CLICK', locator: { strategy: 'css', value: 'selected' } },
      alternativeActions: [],
      triedActions: [],
    });

    expect(NavigationManager.shouldBacktrack('missing', [])).toBe(false);
    expect(NavigationManager.shouldBacktrack('session', [{ elementId: 'x', score: 30, reason: '' }])).toBe(false);
    expect(NavigationManager.shouldBacktrack('session', [])).toBe(true);
    expect(NavigationManager.getBacktrackAction('session')).toMatchObject({
      locator: { strategy: 'text', value: 'next' },
      confidence: 0.3,
    });

    state.backtrackingEnabled = false;
    Storage.updateNavigationState('session', state);
    expect(NavigationManager.shouldBacktrack('session', [])).toBe(false);
    expect(NavigationManager.getBacktrackAction('missing')).toBeNull();
  });

  it('covers all score explanations and no-eligible backtracking paths', () => {
    interface NavigationInternals {
      calculateElementScore: (entry: ElementEntry) => number;
      getScoreReason: (score: number) => string;
    }
    const internals = NavigationManager as unknown as NavigationInternals;

    expect(new NavigationManager().isNavigationManager).toBe(true);
    expect(NavigationManager.scoreElements([], 'nothing')).toEqual([]);
    expect(internals.calculateElementScore(element({ role: 'link', hidden: true }))).toBe(0);
    expect(internals.getScoreReason(80)).toBe('Element is highly relevant and likely leads to destination');
    expect(internals.getScoreReason(50)).toBe('Element is relevant and may help with the task');

    Storage.createNavigationState('session');
    Storage.addNavigationStep('session', {
      stateSig: '',
      url: '',
      elementScores: [{ elementId: 'low', score: 29, reason: 'below minimum' }],
      selectedAction: { op: 'CLICK', locator: { strategy: 'css', value: 'missing' } },
      alternativeActions: [],
      triedActions: [],
    });
    expect(NavigationManager.getBacktrackAction('session')).toBeNull();
  });
});
