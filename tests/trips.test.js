import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';

describe('Trips API Endpoints & Business Logic', () => {
  const token = 'mock-token-karan';

  beforeEach(() => {
    if (db && typeof db.reset === 'function') {
      db.reset();
    }
  });

  it('POST /api/trips should create a new trip and set creator as OWNER', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Goa Holiday',
        destination: 'Goa, India',
        startDate: '2026-11-20',
        endDate: '2026-11-25',
        currency: 'INR',
        description: 'Beach trip with friends'
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Goa Holiday');
    assert.strictEqual(res.body.data.destination, 'Goa, India');
    assert.strictEqual(res.body.data.status, 'ACTIVE');
    assert.strictEqual(res.body.data.role, 'OWNER');
    assert.strictEqual(res.body.data.memberCount, 1);
  });

  it('POST /api/trips should reject invalid trip creation payloads', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '',
        destination: 'Goa'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'INVALID_TRIP_NAME');
  });

  it('POST /api/trips should reject when end date is earlier than start date', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Invalid Dates Trip',
        destination: 'Mountains',
        startDate: '2026-12-10',
        endDate: '2026-12-05'
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_DATE_RANGE');
  });

  it('GET /api/trips should return trips associated with authenticated user', async () => {
    // Create trip first
    await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Manali Expedition',
        destination: 'Manali, HP'
      });

    const res = await request(app)
      .get('/api/trips')
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.length, 1);
    assert.strictEqual(res.body.data[0].name, 'Manali Expedition');
  });

  it('GET /api/trips/:tripId should reject non-members with 403', async () => {
    // Karan creates trip
    const createRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Private Trip',
        destination: 'Kerala'
      });

    const tripId = createRes.body.data.tripId;

    // Aman (not a member) attempts to access
    const res = await request(app)
      .get(`/api/trips/${tripId}`)
      .set('Authorization', 'Bearer mock-token-aman');

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/trips/:tripId/end should transition trip to ENDED', async () => {
    const createRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Trip to End',
        destination: 'Jaipur'
      });

    const tripId = createRes.body.data.tripId;

    const endRes = await request(app)
      .post(`/api/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(endRes.status, 200);
    assert.strictEqual(endRes.body.data.status, 'ENDED');
    assert.ok(endRes.body.data.endedAt);

    // Ending again should be rejected
    const endAgain = await request(app)
      .post(`/api/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(endAgain.status, 400);
    assert.strictEqual(endAgain.body.error.code, 'ALREADY_ENDED');
  });

  it('POST /api/trips/:tripId/leave should succeed when user has 0 net balance', async () => {
    const createRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Zero Balance Trip',
        destination: 'Shimla'
      });

    const tripId = createRes.body.data.tripId;

    const leaveRes = await request(app)
      .post(`/api/trips/${tripId}/leave`)
      .set('Authorization', `Bearer ${token}`);

    assert.strictEqual(leaveRes.status, 200);
    assert.strictEqual(leaveRes.body.success, true);
  });
});
