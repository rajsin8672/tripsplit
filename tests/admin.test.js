/**
 * Automated Tests: Administrator Access & Management Endpoints
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';

describe('Administrator Access & Management Endpoints', () => {
  const adminEmail = 'sonusin8672@gmail.com';
  const regularEmail = 'regularuser@example.com';

  const adminToken = 'dev-token-admin_sonu';
  const regularToken = 'dev-token-regular_user';

  before(async () => {
    // Seed admin profile in mock db
    await db.collection('users').doc('admin_sonu').set({
      uid: 'admin_sonu',
      email: adminEmail,
      displayName: 'Sonu Admin',
      userCode: 'TS-ADM001',
      upiId: 'sonu@upi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Seed regular user profile in mock db
    await db.collection('users').doc('regular_user').set({
      uid: 'regular_user',
      email: regularEmail,
      displayName: 'Regular User',
      userCode: 'TS-REG001',
      upiId: 'regular@upi',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });

  test('GET /api/admin/check should reject unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/check');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('GET /api/admin/check should reject non-admin user with 403 FORBIDDEN_NOT_ADMIN', async () => {
    const res = await request(app)
      .get('/api/admin/check')
      .set('Authorization', `Bearer ${regularToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN_NOT_ADMIN');
  });

  test('GET /api/admin/check should permit sonusin8672@gmail.com with 200', async () => {
    const res = await request(app)
      .get('/api/admin/check')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isAdmin, true);
    assert.equal(res.body.data.email.toLowerCase(), adminEmail);
  });

  test('GET /api/admin/stats should return platform statistics to admin', async () => {
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.data.users.total === 'number');
    assert.ok(typeof res.body.data.trips.total === 'number');
    assert.ok(typeof res.body.data.expenses.totalAmountPaise === 'number');
    assert.ok(res.body.data.system.engineMode);
  });

  test('GET /api/admin/users should return all users to admin', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    const emails = res.body.data.map(u => u.email.toLowerCase());
    assert.ok(emails.includes(adminEmail));
  });

  test('GET /api/admin/trips should return all platform trips to admin', async () => {
    const res = await request(app)
      .get('/api/admin/trips')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });
});
