import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

describe('manual content-script diagnostic', () => {
  it('adds its diagnostic indicator to the page body', async () => {
    const appendChild = vi.fn();
    const indicator = {
      style: { cssText: '' },
      textContent: '',
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: 'https://example.test' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: { appendChild },
        createElement: vi.fn(() => indicator),
        readyState: 'complete',
      },
    });

    await import('../../extension/test-content.js');

    expect(appendChild).toHaveBeenCalledWith(indicator);
    expect(indicator.textContent).toBe('TEST SCRIPT LOADED');
  });
});
