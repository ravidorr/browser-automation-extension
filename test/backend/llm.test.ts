import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Observation } from '../../backend/src/types';
import {
  decide,
  getOpenAIClientForTesting,
  setOpenAIClientFactoryForTesting,
  setOpenAIClientForTesting,
} from '../../backend/src/llm';

interface CompletionRequest {
  model: string;
  temperature: number;
  response_format: { type: string };
  messages: { role: string; content: string }[];
}

const createCompletion = vi.fn<(request: CompletionRequest) => Promise<unknown>>();
const testClient = {
  chat: {
    completions: {
      create: createCompletion,
    },
  },
} as unknown as Exclude<Parameters<typeof setOpenAIClientForTesting>[0], undefined>;

process.env.OPENAI_API_KEY = 'test-key-not-a-real-secret';
const defaultClient = getOpenAIClientForTesting();
setOpenAIClientForTesting(undefined);
delete process.env.OPENAI_API_KEY;

const observation: Observation = {
  url: 'https://example.test',
  viewport: { w: 1280, h: 720 },
  elements: [],
  events: [],
  network: { inflight: 0 },
  errors: [],
};

function createNonErrorValue(message: string): Error {
  const error = new Error(message);
  Object.setPrototypeOf(error, null);
  return error;
}

describe('decide', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createCompletion.mockReset();
    setOpenAIClientForTesting(testClient);
    process.env.OPENAI_API_KEY = 'test-key-not-a-real-secret';
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    setOpenAIClientForTesting(undefined);
    setOpenAIClientFactoryForTesting(undefined);
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it('renders a prompt and returns the parsed OpenAI JSON response', async () => {
    const decision = {
      plan: 'Click checkout',
      elementScores: [],
      actions: [{ op: 'CLICK', locator: { strategy: 'css', value: '.checkout' } }],
      finish: null,
    };
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(decision) } }],
      usage: { total_tokens: 12 },
    });

    await expect(decide('session-1', observation, 'Checkout')).resolves.toEqual(decision);
    expect(createCompletion).toHaveBeenCalledOnce();
    const [request] = createCompletion.mock.calls[0] ?? [];
    expect(request).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    const userMessage = request?.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('UserIntent: "Checkout"');
  });

  it('uses the configured model and returns an empty content response as schema failure', async () => {
    process.env.OPENAI_MODEL = 'test-model';
    createCompletion.mockResolvedValue({
      choices: [],
      usage: null,
    });

    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: SCHEMA_FAIL: Invalid JSON response from LLM');
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'test-model' }));
  });

  it('fails without a key and maps provider errors to actionable messages', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: OpenAI API key not configured');

    process.env.OPENAI_API_KEY = 'test-key-not-a-real-secret';
    createCompletion.mockRejectedValue(new Error('rate limit exceeded'));
    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: OpenAI API rate limit exceeded. Please try again later.');
  });

  it('constructs the injected client and logs finished decisions', async () => {
    setOpenAIClientForTesting(undefined);
    const factory = vi.fn(() => testClient);
    setOpenAIClientFactoryForTesting(factory);
    createCompletion.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            plan: 'Complete checkout',
            actions: [],
            finish: { reason: 'SUCCESS', user_prompt: 'Done', evidence: ['confirmed'] },
          }),
        },
      }],
      usage: { total_tokens: 7 },
    });

    await expect(decide('session-1', observation, 'Checkout')).resolves.toMatchObject({
      finish: { reason: 'SUCCESS' },
    });
    expect(factory).toHaveBeenCalledOnce();
  });

  it.each([
    ['API key was rejected', 'OpenAI API key is invalid or missing. Please check your OPENAI_API_KEY environment variable.'],
    ['quota exhausted', 'OpenAI API quota exceeded. Please check your account usage.'],
    ['connection reset', 'OpenAI API error: connection reset'],
  ])('maps %s provider failures', async (providerMessage, expectedMessage) => {
    createCompletion.mockRejectedValue(new Error(providerMessage));

    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow(`SCHEMA_FAIL: ${expectedMessage}`);
  });

  it('constructs a default client without sending a request', () => {
    setOpenAIClientForTesting(undefined);
    setOpenAIClientFactoryForTesting(undefined);

    expect(getOpenAIClientForTesting().chat.completions).toBeDefined();
    expect(defaultClient.chat.completions).toBeDefined();
  });

  it('reports non-Error values from parsing, providers, and prompt rendering', async () => {
    vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw createNonErrorValue('malformed response');
    });
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: '{"plan":"Click","actions":[]}' } }],
      usage: null,
    });
    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: SCHEMA_FAIL: Invalid JSON response from LLM');

    createCompletion.mockRejectedValue('provider rejected');
    await expect(decide('session-1', observation, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: OpenAI API error: Unknown error');

    const invalidElements = {
      ...observation,
      elements: { slice: () => { throw createNonErrorValue('rendering failed'); } } as unknown as Observation['elements'],
    };
    await expect(decide('session-1', invalidElements, 'Checkout'))
      .rejects.toThrow('SCHEMA_FAIL: Unknown error');
  });
});
