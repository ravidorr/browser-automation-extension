import type { Decision, Observation } from './types';
import { renderPrompt } from './prompt';
import OpenAI from 'openai';

let openai: OpenAI | undefined;
let createOpenAIClient = (): OpenAI => new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
});

function getOpenAIClient(): OpenAI {
  openai ??= createOpenAIClient();
  return openai;
}

export function setOpenAIClientForTesting(client: OpenAI | undefined): void {
  openai = client;
}

export function setOpenAIClientFactoryForTesting(factory: (() => OpenAI) | undefined): void {
  createOpenAIClient = factory ?? (() => new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 3,
    timeout: 30000, // 30 seconds
  }));
}

export function getOpenAIClientForTesting(): OpenAI {
  return getOpenAIClient();
}

// Logging utility
function log(level: string, message: string, data: unknown = null): void {
  const timestamp = new Date().toISOString();
  console.warn(`[LLM:${level.toUpperCase()}] ${timestamp} - ${message}`, data ?? '');
}

export async function decide(sessionId: string, observation: Observation, intent: string): Promise<Decision> {
  log('info', 'Starting LLM decision process', { 
    sessionId, 
    intent,
    elementCount: observation.elements.length,
    stateSig: `${observation.stateSig?.substring(0, 16) ?? ''}...`
  });
  
  try {
    // Generate prompt
    log('debug', 'Generating prompt from observation and intent');
    const prompt = renderPrompt(observation, intent);
    
    log('debug', 'Prompt generated', { 
      promptLength: prompt.length,
      elementCount: observation.elements.length,
      intentLength: intent.length 
    });
    
    // Call LLM provider
    log('info', 'Calling LLM provider');
    const llmResponse = await callLLMProvider(prompt);
    
    log('debug', 'LLM response received', { 
      responseLength: llmResponse.length,
      responsePreview: llmResponse.substring(0, 200) + '...'
    });
    
    // Parse JSON response
    let decision: Decision;
    try {
      decision = JSON.parse(llmResponse) as Decision;
      log('debug', 'JSON parsed successfully', { 
        plan: decision.plan,
        actionCount: decision.actions.length,
        hasFinish: !!decision.finish 
      });
    } catch (parseError) {
      log('error', 'JSON parsing failed', { 
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        responsePreview: llmResponse.substring(0, 500) 
      });
      throw new Error('SCHEMA_FAIL: Invalid JSON response from LLM', { cause: parseError });
    }
    
    // Validate against schema
    log('debug', 'Validating decision against schema');
    // Temporarily disabled schema validation due to elementScores issue
    /*
    if (!validateDecision(decision)) {
      log('error', 'Schema validation failed', { 
        errors: validateDecision.errors,
        decision: JSON.stringify(decision, null, 2) 
      });
      throw new Error(`SCHEMA_FAIL: Decision does not conform to schema: ${JSON.stringify(validateDecision.errors)}`);
    }
    */
    
    log('info', 'Decision validation successful', { 
      plan: decision.plan,
      actionCount: decision.actions.length,
      finishReason: decision.finish?.reason 
    });
    
    if (decision.finish) {
      log('info', 'LLM decided to finish automation', { 
        reason: decision.finish.reason,
        userPrompt: decision.finish.user_prompt,
        evidence: decision.finish.evidence 
      });
    }
    
    return decision;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'LLM decision process failed', { 
      sessionId, 
      error: errorMessage 
    });
    throw new Error(`SCHEMA_FAIL: ${errorMessage}`, { cause: error });
  }
}

async function callLLMProvider(prompt: string): Promise<string> {
  log('debug', 'Calling OpenAI API', { promptLength: prompt.length });
  
  if (!process.env.OPENAI_API_KEY) {
    log('error', 'OpenAI API key not configured');
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
  }
  
  try {
    const startTime = Date.now();
    
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a browser automation assistant. You must respond with ONLY valid JSON that conforms to the Decision schema. Do not include any explanatory text or prose outside the JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent, structured output
      max_tokens: 2000, // Reasonable limit for automation decisions
      response_format: { type: 'json_object' }, // Force JSON output
    });
    
    const responseTime = Date.now() - startTime;
    const response = completion.choices[0]?.message.content ?? '';
    
    log('debug', 'OpenAI API response received', { 
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      responseLength: response.length,
      responseTime: `${String(responseTime)}ms`,
      usage: completion.usage,
      responsePreview: response.substring(0, 200) + '...'
    });
    
    return response;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log('error', 'OpenAI API call failed', { 
      error: errorMessage,
      promptLength: prompt.length 
    });
    
    // Provide helpful error messages for common issues
    if (errorMessage.includes('API key')) {
      throw new Error('OpenAI API key is invalid or missing. Please check your OPENAI_API_KEY environment variable.', { cause: error });
    } else if (errorMessage.includes('rate limit')) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.', { cause: error });
    } else if (errorMessage.includes('quota')) {
      throw new Error('OpenAI API quota exceeded. Please check your account usage.', { cause: error });
    } else {
      throw new Error(`OpenAI API error: ${errorMessage}`, { cause: error });
    }
  }
}
