import { describe, expect, it } from 'vitest';
import { renderPrompt } from '../../backend/src/prompt';
import { validateDecision, validateObservation } from '../../backend/src/validators';
import type { Observation } from '../../backend/src/types';

const observation: Observation = {
  url: 'https://example.test/cart',
  viewport: { w: 1280, h: 720 },
  elements: [{
    id: 'checkout',
    text: 'Checkout',
    role: 'button',
    bbox: [0, 0, 100, 40],
    visible: true,
    score: 10,
  }],
  events: [{ type: 'route', to: '/cart' }],
  network: { inflight: 0 },
  errors: ['replan count 2'],
  stateSig: 'state-signature',
};

describe('renderPrompt', () => {
  it('embeds the observation, intent, and derived analysis into the prompt', () => {
    const prompt = renderPrompt(observation, 'Proceed to checkout');

    expect(prompt).toContain('UserIntent: "Proceed to checkout"');
    expect(prompt).toContain('URL: https://example.test/cart');
    expect(prompt).toContain('"id": "checkout"');
    expect(prompt).toContain('1. Checkout (button) - Score: 10');
    expect(prompt).toContain('RecentEvents(JSON):');
    expect(prompt).toContain('StateSignature: state-signature');
    expect(prompt).toContain('ReplanCount: 2');
  });

  it('limits element lists and supplies defaults for absent optional values', () => {
    const manyElements = Array.from({ length: 61 }, (_, index) => ({
      id: `element-${String(index)}`,
      bbox: [0, 0, 1, 1] as [number, number, number, number],
      visible: true,
    }));
    const prompt = renderPrompt({
      ...observation,
      elements: manyElements,
      errors: [],
      stateSig: null,
    }, 'Inspect');

    expect(prompt).toContain('"id": "element-59"');
    expect(prompt).not.toContain('"id": "element-60"');
    expect(prompt).toContain('1. No text (no-role) - Score: N/A');
    expect(prompt).toContain('StateSignature: null');
    expect(prompt).toContain('ReplanCount: 0');
  });
});

describe('schema validators', () => {
  it('accepts valid observation and decision payloads', () => {
    expect(validateObservation(observation)).toBe(true);
    expect(validateDecision({
      plan: 'Click checkout',
      elementScores: [{ elementId: 'checkout', score: 80, reason: 'Continues checkout' }],
      actions: [{ op: 'CLICK', locator: { strategy: 'elementId', value: 'checkout' } }],
      finish: null,
    })).toBe(true);
  });

  it('rejects payloads that violate required fields, allowed properties, and limits', () => {
    expect(validateObservation({ ...observation, network: { inflight: -1 } })).toBe(false);
    expect(validateObservation({ ...observation, unexpected: true })).toBe(false);
    expect(validateDecision({ plan: '', actions: [] })).toBe(false);
    expect(validateDecision({
      plan: 'Click',
      actions: [{ op: 'CLICK', locator: { strategy: 'unknown', value: 'button' } }],
    })).toBe(false);
  });
});
