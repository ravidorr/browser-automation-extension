import { randomBytes } from 'node:crypto';
import type { Action, NavigationState, NavigationStep, Rating, Session, SessionTrace, Step } from './types';

// In-memory storage maps (MVP)
const sessions = new Map<string, Session>();
const steps = new Map<string, Step>();
const ratings = new Map<string, Rating>();
const navigationStates = new Map<string, NavigationState>();

export class Storage {
  readonly isStorage = true;

  // Session management
  static createSession(goal?: string): Session {
    const session: Session = {
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      ...(goal && { goal })
    };
    sessions.set(session.id, session);
    return session;
  }

  static getSession(id: string): Session | undefined {
    return sessions.get(id);
  }

  static updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = sessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates, updatedAt: new Date().toISOString() };
    sessions.set(id, updatedSession);
    return updatedSession;
  }

  // Step management
  static addStep(sessionId: string, type: 'observe' | 'decide' | 'execute', data: Step['data']): string {
    const newStep: Step = {
      id: this.generateId(),
      sessionId,
      type,
      timestamp: new Date().toISOString(),
      data
    };
    steps.set(newStep.id, newStep);
    return newStep.id;
  }

  static getStepsBySession(sessionId: string): Step[] {
    return Array.from(steps.values())
      .filter(step => step.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // Rating management
  static addRating(sessionId: string, rating: 'up' | 'down', note?: string): void {
    const newRating: Rating = {
      sessionId,
      rating,
      ...(note && { note }),
      timestamp: new Date().toISOString()
    };
    ratings.set(sessionId, newRating);
  }

  static getRating(sessionId: string): Rating | undefined {
    return ratings.get(sessionId);
  }

  static getSessionTrace(sessionId: string): SessionTrace | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    
    const sessionSteps = this.getStepsBySession(sessionId);
    const sessionRating = this.getRating(sessionId);
    
    return {
      session,
      steps: sessionSteps,
      ratings: sessionRating ? [sessionRating] : []
    };
  }

  // Utility
  private static generateId(): string {
    return randomBytes(16).toString('hex');
  }

  // Navigation state management
      static createNavigationState(sessionId: string, minScoreThreshold = 30): NavigationState {
    const navigationState: NavigationState = {
      sessionId,
      currentStepIndex: 0,
      navigationHistory: [],
      minScoreThreshold,
      backtrackingEnabled: true
    };
    navigationStates.set(sessionId, navigationState);
    return navigationState;
  }

  static getNavigationState(sessionId: string): NavigationState | undefined {
    return navigationStates.get(sessionId);
  }

  static updateNavigationState(sessionId: string, updates: Partial<NavigationState>): NavigationState | undefined {
    const state = navigationStates.get(sessionId);
    if (!state) return undefined;
    
    const updatedState = { ...state, ...updates };
    navigationStates.set(sessionId, updatedState);
    return updatedState;
  }

  static addNavigationStep(sessionId: string, step: Omit<NavigationStep, 'stepIndex' | 'timestamp'>): NavigationStep {
    const state = this.getNavigationState(sessionId);
    if (!state) {
      throw new Error(`Navigation state not found for session ${sessionId}`);
    }

    const navigationStep: NavigationStep = {
      ...step,
      stepIndex: state.currentStepIndex,
      timestamp: new Date().toISOString(),
      alternativeActions: step.alternativeActions,
      triedActions: step.triedActions
    };

    state.navigationHistory.push(navigationStep);
    state.currentStepIndex++;
    
    this.updateNavigationState(sessionId, state);
    return navigationStep;
  }

  static markActionAsTried(sessionId: string, stepIndex: number, actionKey: string): void {
    const state = this.getNavigationState(sessionId);
    if (!state || stepIndex >= state.navigationHistory.length) return;

    const step = state.navigationHistory[stepIndex];
    if (!step) return;
    
    if (!step.triedActions.includes(actionKey)) {
      step.triedActions.push(actionKey);
      this.updateNavigationState(sessionId, state);
    }
  }

  static getUntriedActions(sessionId: string, stepIndex: number): Action[] {
    const state = this.getNavigationState(sessionId);
    if (!state || stepIndex >= state.navigationHistory.length) return [];

    const step = state.navigationHistory[stepIndex];
    if (!step) return [];
    
    const triedKeys = new Set(step.triedActions);
    
    return step.alternativeActions.filter(action => {
      const actionKey = `${action.op}-${action.locator?.value ?? 'none'}`;
      return !triedKeys.has(actionKey);
    });
  }

  static canBacktrackToStep(sessionId: string, stepIndex: number): boolean {
    const state = this.getNavigationState(sessionId);
    if (!state || stepIndex >= state.navigationHistory.length) return false;

    const step = state.navigationHistory[stepIndex];
    if (!step) return false;
    
    const untriedActions = this.getUntriedActions(sessionId, stepIndex);
    
    return untriedActions.length > 0;
  }

  static backtrackToStep(sessionId: string, stepIndex: number): { success: boolean; actions: Action[]; reason?: string } {
    const state = this.getNavigationState(sessionId);
    if (!state) {
      return { success: false, actions: [], reason: 'Navigation state not found' };
    }

    if (!this.canBacktrackToStep(sessionId, stepIndex)) {
      return { success: false, actions: [], reason: 'No untried actions available at this step' };
    }

    // Remove all steps after the target step
    state.navigationHistory = state.navigationHistory.slice(0, stepIndex + 1);
    state.currentStepIndex = stepIndex + 1;
    
    this.updateNavigationState(sessionId, state);

    const untriedActions = this.getUntriedActions(sessionId, stepIndex);
    return { success: true, actions: untriedActions };
  }

  static canBacktrack(sessionId: string): boolean {
    const state = this.getNavigationState(sessionId);
    return state ? state.navigationHistory.length > 0 && state.backtrackingEnabled : false;
  }

  static getLastNavigationStep(sessionId: string): NavigationStep | undefined {
    const state = this.getNavigationState(sessionId);
    return state ? state.navigationHistory[state.navigationHistory.length - 1] : undefined;
  }

  // Debug/cleanup
  static clearAll(): void {
    sessions.clear();
    steps.clear();
    ratings.clear();
    navigationStates.clear();
  }

  static getStats(): { sessions: number; steps: number; ratings: number } {
    return {
      sessions: sessions.size,
      steps: steps.size,
      ratings: ratings.size
    };
  }

  // KPI calculation
  static getKPI(): {
    totalSessions: number;
    upvotes: number;
    downvotes: number;
    successRate: number;
    averageRating: number;
  } {
    const allRatings = Array.from(ratings.values());
    const recentRatings = allRatings
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
    
    if (recentRatings.length === 0) {
      return {
        totalSessions: 0,
        upvotes: 0,
        downvotes: 0,
        successRate: 0,
        averageRating: 0
      };
    }
    
    const upvotes = recentRatings.filter(r => r.rating === 'up').length;
    const downvotes = recentRatings.filter(r => r.rating === 'down').length;
    const successRate = (upvotes / recentRatings.length) * 100;
    
    return {
      totalSessions: recentRatings.length,
      upvotes,
      downvotes,
      successRate: Math.round(successRate * 100) / 100,
      averageRating: upvotes / recentRatings.length
    };
  }
}
