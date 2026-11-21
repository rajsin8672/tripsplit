import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';

describe('User Profile Route Protection & Validation', () => {
  it('PATCH /api/users/me should reject requests without token with 401', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .send({ displayName: 'New Name' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });

  it('GET /api/users/me should reject requests without token with 401', async () => {
    const res = await request(app).get('/api/users/me');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'UNAUTHORIZED');
  });
});
