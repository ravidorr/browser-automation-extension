import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { app } from '../../backend/src/index';
import { Storage } from '../../backend/src/storage';
import type { Observation } from '../../backend/src/types';

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

function getSessionId(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('sessionId' in body) ||
    typeof body.sessionId !== 'string'
  ) {
    throw new Error('Session creation response did not include a session ID');
  }

  return body.sessionId;
}

describe('backend persistence contract', () => {
  beforeEach(() => {
    Storage.clearAll();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists session, observation, rating, trace, and KPI data together', async () => {
    const sessionResponse = await request(app)
      .post('/v1/sessions')
      .send({ goal: 'Complete checkout' })
      .expect(200);
    const sessionId = getSessionId(sessionResponse.body);

    await request(app)
      .post('/v1/steps/observe')
      .send({ observation, sessionId })
      .expect(200);

    await request(app)
      .post('/v1/rate')
      .send({ note: 'Worked well', rating: 'up', sessionId })
      .expect(200);

    const traceResponse = await request(app)
      .get(`/v1/sessions/${sessionId}/trace`)
      .expect(200);
    expect(traceResponse.body).toMatchObject({
      ratings: [{ note: 'Worked well', rating: 'up', sessionId }],
      session: { goal: 'Complete checkout', id: sessionId },
      steps: [{ data: observation, sessionId, type: 'observe' }],
    });

    await expect(request(app).get('/v1/kpi')).resolves.toMatchObject({
      status: 200,
      body: {
        downvotes: 0,
        successRate: 100,
        totalSessions: 1,
        upvotes: 1,
      },
    });
  });
});
