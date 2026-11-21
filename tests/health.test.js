import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';

describe('Server & Health API Endpoints', () => {
  it('GET /api/health should return 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'healthy');
    assert.strictEqual(res.body.data.service, 'tripsplit-api');
    assert.ok(typeof res.body.data.uptime === 'number');
  });

  it('GET /api/config/firebase should return 200 and config object', async () => {
    const res = await request(app).get('/api/config/firebase');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(typeof res.body.data.isConfigured === 'boolean');
    assert.ok(typeof res.body.data.config === 'object');
  });

  it('Unknown API endpoint should return 404 JSON with NOT_FOUND code', async () => {
    const res = await request(app).get('/api/non-existent-route');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('does not exist'));
  });

  it('Protected endpoint GET /api/users/me should reject request without token with 401', async () => {
    const res = await request(app).get('/api/users/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  it('Protected endpoint POST /api/auth/sync should reject request without token with 401', async () => {
    const res = await request(app).post('/api/auth/sync').send({ displayName: 'Test' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  it('Protected endpoints should reject requests without token with 401', async () => {
    const endpoints = [
      { method: 'get', url: '/api/trips' },
      { method: 'post', url: '/api/trips' },
      { method: 'get', url: '/api/invitations' },
      { method: 'get', url: '/api/payments' }
    ];

    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.url);
      assert.strictEqual(res.status, 401, `Failed for ${ep.method.toUpperCase()} ${ep.url}`);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
    }
  });

  it('Protected endpoint should reject malformed Bearer token with 401 or 503', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', 'Bearer invalid-token-string');
    // If Firebase Admin credentials are not loaded in testing environment, returns 503 (SERVICE_UNAVAILABLE).
    // If loaded, returns 401 (INVALID_TOKEN).
    assert.ok([401, 503].includes(res.status));
    assert.strictEqual(res.body.success, false);
  });
});
