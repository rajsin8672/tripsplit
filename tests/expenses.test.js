import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';

describe('Expenses API Endpoints & Splitting Invariants', () => {
  const karanToken = 'mock-token-karan';
  const rahulToken = 'mock-token-rahul';
  let tripId = null;

  beforeEach(async () => {
    if (db && typeof db.reset === 'function') {
      db.reset();
    }

    // Rahul profile
    const rahulSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({ displayName: 'Rahul' });

    // Karan creates trip
    const tripRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ name: 'Goa', destination: 'Goa' });
    tripId = tripRes.body.data.tripId;

    // Karan invites Rahul & Rahul accepts
    const invRes = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulSync.body.data.userCode });

    await request(app)
      .post(`/api/invitations/${invRes.body.data.invitationId}/accept`)
      .set('Authorization', `Bearer ${rahulToken}`);
  });

  it('POST /api/trips/:tripId/expenses should record expense with EQUAL split in paise', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Dinner at Beach Shack',
        amount: 2500, // ₹2500 -> 250000 paise
        category: 'Food',
        paidBy: 'karan',
        splitType: 'EQUAL',
        participantIds: ['karan', 'rahul']
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.totalAmount, 250000); // 250000 paise
    assert.strictEqual(res.body.data.splits.length, 2);

    // Each owes 125000 paise (₹1250.00)
    assert.strictEqual(res.body.data.splits[0].allocatedAmount, 125000);
    assert.strictEqual(res.body.data.splits[1].allocatedAmount, 125000);
  });

  it('POST /api/trips/:tripId/expenses should record expense with EXACT split', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Cab ride',
        amount: 1500, // 150000 paise
        category: 'Transport',
        paidBy: 'karan',
        splitType: 'EXACT',
        participantIds: ['karan', 'rahul'],
        customSplits: [
          { userId: 'karan', amount: 1000 }, // 100000 paise
          { userId: 'rahul', amount: 500 }   // 50000 paise
        ]
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.totalAmount, 150000);
    const sum = res.body.data.splits.reduce((acc, s) => acc + s.allocatedAmount, 0);
    assert.strictEqual(sum, 150000);
  });

  it('POST /api/trips/:tripId/expenses should record expense with PERCENTAGE split', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Villa Rent',
        amount: 10000, // 1000000 paise
        category: 'Accommodation',
        paidBy: 'karan',
        splitType: 'PERCENTAGE',
        participantIds: ['karan', 'rahul'],
        customSplits: [
          { userId: 'karan', percentage: 70 },
          { userId: 'rahul', percentage: 30 }
        ]
      });

    assert.strictEqual(res.status, 201);
    const karanSplit = res.body.data.splits.find(s => s.userId === 'karan');
    const rahulSplit = res.body.data.splits.find(s => s.userId === 'rahul');
    assert.strictEqual(karanSplit.allocatedAmount, 700000);
    assert.strictEqual(rahulSplit.allocatedAmount, 300000);
  });

  it('should reject adding expenses to an ENDED trip', async () => {
    // End trip first
    await request(app)
      .post(`/api/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${karanToken}`);

    // Attempt to add expense
    const res = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Post Trip Lunch',
        amount: 800,
        paidBy: 'karan',
        participantIds: ['karan', 'rahul']
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'TRIP_ENDED');
  });

  it('DELETE /api/trips/:tripId/expenses/:expenseId should delete expense and splits', async () => {
    const createRes = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Snacks',
        amount: 400,
        paidBy: 'karan',
        participantIds: ['karan']
      });

    const expId = createRes.body.data.expenseId;

    const delRes = await request(app)
      .delete(`/api/trips/${tripId}/expenses/${expId}`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(delRes.status, 200);
    assert.strictEqual(delRes.body.success, true);
  });
});
