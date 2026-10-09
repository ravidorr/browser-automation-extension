import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Storage } from './storage';
import { decide } from './llm';
import { validateObservation, validateDecision } from './validators';
import { FinishReason, Decision } from './types';

// Logging utility
function log(level: string, message: string, data: any = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data
  };
  
  console.log(`[BACKEND:${level.toUpperCase()}] ${timestamp} - ${message}`, data ? data : '');
  
  // In production, send to logging service
  // For now, just console.log
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

log('info', 'Backend server starting', { port: PORT });

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  log('info', 'API Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    log('info', 'API Response', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// Health check
app.get('/health', (req, res) => {
  log('debug', 'Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create session
app.post('/v1/sessions', (req, res) => {
  try {
    const { goal } = req.body;
    
    if (!goal || typeof goal !== 'string') {
      log('warn', 'Invalid session creation request', { goal });
      return res.status(400).json({ error: 'Goal is required and must be a string' });
    }
    
    log('info', 'Creating new session', { goal });
    
    const session = Storage.createSession(goal);
    
    log('info', 'Session created successfully', { sessionId: session.id, goal });
    res.json({ sessionId: session.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Session creation failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to create session', details: errorMessage });
  }
});

// Post observation
app.post('/v1/steps/observe', (req, res) => {
  try {
    const { sessionId, observation } = req.body;
    
    if (!sessionId || typeof sessionId !== 'string') {
      log('warn', 'Invalid observation request - missing sessionId', { sessionId });
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!observation) {
      log('warn', 'Invalid observation request - missing observation', { sessionId });
      return res.status(400).json({ error: 'Observation is required' });
    }
    
    log('debug', 'Posting observation', { 
      sessionId, 
      elementCount: observation.elements?.length || 0,
      stateSig: observation.stateSig?.substring(0, 16) + '...',
      errorCount: observation.errors?.length || 0,
      hasScreenshot: !!observation.screenshot,
      screenshotLength: observation.screenshot?.length || 0
    });
    
    // Validate observation against schema
    if (!validateObservation(observation)) {
      log('error', 'Observation validation failed', { 
        sessionId, 
        errors: validateObservation.errors 
      });
      return res.status(400).json({ 
        error: 'Invalid observation format', 
        details: validateObservation.errors 
      });
    }
    
    const stepId = Storage.addStep(sessionId, 'observe', observation);
    
    log('info', 'Observation posted successfully', { sessionId, stepId });
    res.json({ stepId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Observation posting failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to post observation', details: errorMessage });
  }
});

// Post decision
app.post('/v1/steps/decide', async (req, res) => {
  const { sessionId, observation, intent } = req.body;
  
  try {
    
    if (!sessionId || typeof sessionId !== 'string') {
      log('warn', 'Invalid decide request - missing sessionId', { sessionId });
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!observation) {
      log('warn', 'Invalid decide request - missing observation', { sessionId });
      return res.status(400).json({ error: 'Observation is required' });
    }
    
    if (!intent || typeof intent !== 'string') {
      log('warn', 'Invalid decide request - missing intent', { sessionId, intent });
      return res.status(400).json({ error: 'Intent is required and must be a string' });
    }
    
    log('info', 'Requesting decision from LLM', { 
      sessionId, 
      intent,
      elementCount: observation.elements?.length || 0,
      stateSig: observation.stateSig?.substring(0, 16) + '...'
    });
    
    // Validate observation
    if (!validateObservation(observation)) {
      log('error', 'Observation validation failed in decide', { 
        sessionId, 
        errors: validateObservation.errors 
      });
      return res.status(400).json({ 
        error: 'Invalid observation format', 
        details: validateObservation.errors 
      });
    }
    
    // Initialize navigation state if not exists
    let navigationState = Storage.getNavigationState(sessionId);
    if (!navigationState) {
      navigationState = Storage.createNavigationState(sessionId);
      log('info', 'Created navigation state for session', { sessionId });
    }

    // Check for stuck loop conditions
    const hasStateUnchangedError = observation.errors?.some((e: string) => e.includes('State unchanged'));
    
    // Extract replan count from the state object (passed from content script)
    const replanCountNum = observation.replanCount || 0;
    
    log('debug', 'Stuck loop check', { 
      sessionId, 
      replanCount: replanCountNum,
      hasStateUnchangedError,
      stateSig: observation.stateSig?.substring(0, 16) + '...'
    });

    // Check if we're in a stuck loop
    if (replanCountNum >= 3 && hasStateUnchangedError) {
      log('warn', 'Stuck loop detected - finishing automation', { 
        sessionId, 
        replanCount: replanCountNum,
        stateSig: observation.stateSig?.substring(0, 16) + '...'
      });
      
      const decision: Decision = {
        plan: 'Stuck loop detected - automation cannot proceed',
        elementScores: [],
        actions: [],
        finish: {
          reason: 'STUCK_LOOP' as const,
          user_prompt: 'The automation is stuck in a loop and cannot make progress. Please try a different approach or check if the page has changed.',
          evidence: [`Replan count: ${replanCountNum}`, 'State signature unchanged', 'No progress made']
        }
      };
      
      const stepId = Storage.addStep(sessionId, 'decide', decision);
      log('info', 'Stuck loop decision created', { sessionId, stepId });
      return res.json({ stepId, decision });
    }

    // Get decision from LLM
    let decision: Decision;
    try {
      decision = await decide(sessionId, observation, intent);
      log('info', 'LLM decision received', { 
        sessionId, 
        plan: decision.plan,
        actionCount: decision.actions?.length || 0,
        elementScoreCount: decision.elementScores?.length || 0,
        finishReason: decision.finish?.reason
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('error', 'LLM decision failed', { sessionId, error: errorMessage });
      
      // If LLM fails, we cannot proceed - the system is completely agnostic
      decision = {
        plan: 'LLM failed - cannot proceed without AI decision',
        elementScores: [],
        actions: [],
        finish: {
          reason: 'STUCK_LOOP' as const,
          user_prompt: 'The AI system failed and cannot make decisions. Please try again.',
          evidence: ['LLM decision failed', 'System is completely agnostic to content']
        }
      };
    }
    
    log('info', 'LLM decision received', { 
      sessionId,
      plan: decision.plan,
      actionCount: decision.actions?.length || 0,
      finishReason: decision.finish?.reason
    });
    
    if (decision.finish && decision.finish.reason) {
      log('info', 'LLM decided to finish automation', { 
        sessionId,
        reason: decision.finish.reason,
        userPrompt: decision.finish.user_prompt 
      });
    }
    
    // Store the decision
    const stepId = Storage.addStep(sessionId, 'decide', decision);
    
    // Record navigation step if we have actions and element scores
    if (decision.actions && decision.actions.length > 0 && decision.elementScores && decision.elementScores.length > 0) {
      const selectedAction = decision.actions[0];
      if (selectedAction) {
        Storage.addNavigationStep(sessionId, {
          stateSig: observation.stateSig || '',
          url: observation.url,
          elementScores: decision.elementScores,
          selectedAction: selectedAction,
          alternativeActions: decision.actions, // Store all actions for backtracking
          triedActions: [] // Initialize with empty tried actions
        });
      }
    }
    
    log('info', 'Decision stored successfully', { sessionId, stepId });
    res.json({ stepId, decision });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.startsWith('SCHEMA_FAIL:')) {
      log('error', 'LLM schema validation failed', { 
        sessionId: sessionId, 
        error: errorMessage.replace('SCHEMA_FAIL: ', '') 
      });
      return res.status(400).json({ 
        error: 'SCHEMA_FAIL', 
        details: errorMessage.replace('SCHEMA_FAIL: ', '') 
      });
    }
    
    log('error', 'Decision generation failed', { sessionId: sessionId, error: errorMessage });
    return res.status(500).json({ error: 'Failed to generate decision', details: errorMessage });
  }
});

// Post execution result
app.post('/v1/steps/execute', (req, res) => {
  try {
    const { sessionId, result } = req.body;
    
    if (!sessionId || typeof sessionId !== 'string') {
      log('warn', 'Invalid execute request - missing sessionId', { sessionId });
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!result) {
      log('warn', 'Invalid execute request - missing result', { sessionId });
      return res.status(400).json({ error: 'Execution result is required' });
    }
    
    log('debug', 'Posting execution result', { 
      sessionId, 
      success: result.success,
      reason: result.reason,
      error: result.error 
    });
    
    const stepId = Storage.addStep(sessionId, 'execute', result);
    
    log('info', 'Execution result posted successfully', { sessionId, stepId });
    res.json({ stepId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Execution result posting failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to post execution result', details: errorMessage });
  }
});

// Post rating
app.post('/v1/rate', (req, res) => {
  try {
    const { sessionId, rating, note } = req.body;
    
    if (!sessionId || typeof sessionId !== 'string') {
      log('warn', 'Invalid rating request - missing sessionId', { sessionId });
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!rating || !['up', 'down'].includes(rating)) {
      log('warn', 'Invalid rating request - invalid rating', { sessionId, rating });
      return res.status(400).json({ error: 'Rating must be "up" or "down"' });
    }
    
    log('info', 'Posting user rating', { sessionId, rating, note });
    
    Storage.addRating(sessionId, rating, note);
    
    log('info', 'Rating posted successfully', { sessionId, rating });
    res.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Rating posting failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to post rating', details: errorMessage });
  }
});

// Get session trace
app.get('/v1/sessions/:id/trace', (req, res) => {
  try {
    const { id } = req.params;
    
    log('debug', 'Requesting session trace', { sessionId: id });
    
    const trace = Storage.getSessionTrace(id);
    
    if (!trace) {
      log('warn', 'Session not found', { sessionId: id });
      return res.status(404).json({ error: 'Session not found' });
    }
    
    log('info', 'Session trace retrieved', { 
      sessionId: id, 
      stepCount: trace.steps?.length || 0,
      ratingCount: trace.ratings?.length || 0 
    });
    
    res.json(trace);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Session trace retrieval failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to retrieve session trace', details: errorMessage });
  }
});

// Get KPI
app.get('/v1/kpi', (req, res) => {
  try {
    log('debug', 'Requesting KPI data');
    
    const kpi = Storage.getKPI();
    
    log('info', 'KPI data retrieved', { 
      totalSessions: kpi.totalSessions,
      successRate: kpi.successRate,
      upvotes: kpi.upvotes,
      downvotes: kpi.downvotes 
    });
    
    res.json(kpi);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'KPI retrieval failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to retrieve KPI', details: errorMessage });
  }
});

// Get navigation history for backtracking
app.get('/v1/navigation/history/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    log('debug', 'Requesting navigation history', { sessionId });
    
    const navigationState = Storage.getNavigationState(sessionId);
    
    if (!navigationState) {
      log('warn', 'Navigation state not found', { sessionId });
      return res.status(404).json({ error: 'Navigation state not found' });
    }
    
    log('info', 'Navigation history retrieved', { 
      sessionId, 
      stepCount: navigationState.navigationHistory.length,
      currentStepIndex: navigationState.currentStepIndex 
    });
    
    res.json(navigationState);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Navigation history retrieval failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to retrieve navigation history', details: errorMessage });
  }
});

// Mark action as tried for backtracking
app.post('/v1/navigation/mark-tried/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { stepIndex, actionKey } = req.body;
    
    if (typeof stepIndex !== 'number' || typeof actionKey !== 'string') {
      log('warn', 'Invalid mark-tried request', { sessionId, stepIndex, actionKey });
      return res.status(400).json({ error: 'stepIndex must be a number and actionKey must be a string' });
    }
    
    log('debug', 'Marking action as tried', { sessionId, stepIndex, actionKey });
    
    Storage.markActionAsTried(sessionId, stepIndex, actionKey);
    
    log('info', 'Action marked as tried successfully', { sessionId, stepIndex, actionKey });
    res.json({ ok: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'Mark action as tried failed', { error: errorMessage });
    return res.status(500).json({ error: 'Failed to mark action as tried', details: errorMessage });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  log('error', 'Unhandled error', { 
    error: error.message, 
    stack: error.stack,
    path: req.path,
    method: req.method 
  });
  
  res.status(500).json({ 
    error: 'Internal server error', 
    details: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  log('warn', 'Route not found', { path: req.path, method: req.method });
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  log('info', 'Backend server started successfully', { 
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});
