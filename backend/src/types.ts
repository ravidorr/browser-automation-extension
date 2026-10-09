export type Op = 'NAVIGATE'|'CLICK'|'TYPE'|'SELECT'|'SCROLL'|'WAIT'|'EXTRACT'|'FINISH';
export type ExpectEvent = 'navigation'|'domChange'|'networkIdle';
export type FinishReason = 'SUCCESS'|'CONSECUTIVE_FAILURES'|'FILE_PICKER_REACHED'|'NEW_TAB_BLOCKED'|'USER_ABORTED'|'STUCK_LOOP';
export type LocatorStrategy = 'role'|'text'|'aria'|'dataTestId'|'css'|'xpath';

export interface Locator {
  strategy: LocatorStrategy;
  value: string;
  alternates?: {strategy: LocatorStrategy; value: string}[];
}

export interface Action {
  op: Op;
  locator?: Locator | null;
  input?: Record<string, unknown> | null;
  expect?: { event?: ExpectEvent; timeoutMs?: number } | null;
  notes?: string | null;
  confidence?: number | null;
}

export interface ElementScore {
  elementId: string;
  score: number;
  reason: string;
}

export interface Decision {
  plan: string;
  elementScores?: ElementScore[];
  actions: Action[];
  finish?: { reason: FinishReason; user_prompt?: string; evidence?: string[] } | null;
}

export interface Viewport { w: number; h: number }
export interface ElementEntry {
  id: string;
  role?: string | null;
  text?: string | null;
  ariaLabel?: string | null;
  dataTestId?: string | null;
  idAttr?: string | null;
  classes?: string[] | null;
  hrefHost?: string | null;
  inputType?: string | null;
  disabled?: boolean | null;
  hidden?: boolean | null;
  bbox: [number, number, number, number];
  visible: boolean;
  score?: number | null;
}

export interface Observation {
  url: string;
  viewport: Viewport;
  screenshot?: string | null;
  elements: ElementEntry[];
  events: {type: 'route'|'dom'|'network'; to?: string | null }[];
  network: { inflight: number };
  errors: string[];
  stateSig?: string | null;
  replanCount?: number;
}

// Legacy types for backward compatibility
export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'failed';
  goal?: string;
}

export interface Step {
  id: string;
  sessionId: string;
  type: 'observe' | 'decide' | 'execute';
  timestamp: string;
  data: Observation | Decision | ExecutionResult;
}

export interface ExecutionResult {
  success: boolean;
  error?: string;
  result?: unknown;
}

export interface Rating {
  sessionId: string;
  rating: 'up' | 'down';
  note?: string;
  timestamp: string;
}

export interface NavigationStep {
  stepIndex: number;
  stateSig: string;
  url: string;
  elementScores: ElementScore[];
  selectedAction: Action;
  timestamp: string;
  alternativeActions: Action[]; // Store all actions from the decision
  triedActions: string[]; // Track which actions were already tried
}

export interface NavigationState {
  sessionId: string;
  currentStepIndex: number;
  navigationHistory: NavigationStep[];
  minScoreThreshold: number;
  backtrackingEnabled: boolean;
}

export interface SessionTrace {
  session: Session;
  steps: Step[];
  ratings: Rating[];
  navigationState?: NavigationState;
}
