import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';

describe('Payments API Endpoints & State Machine', () => {
  const karanToken = 'mock-token-karan';
  const rahulToken = 'mock-token-rahul';
  let tripId = null;
  let settlementId = null;

  beforeEach(async () => {
    if (db && typeof db.reset === 'function') {
      db.reset();
    }

    // 1. Sync Rahul
    const rahulSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({ displayName: 'Rahul' });

    // 2. Karan creates trip
    const tripRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ name: 'Goa Trip', destination: 'Goa' });
    tripId = tripRes.body.data.tripId;

    // 3. Invite & join Rahul
    const invRes = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulSync.body.data.userCode });
    await request(app)
      .post(`/api/invitations/${invRes.body.data.invitationId}/accept`)
      .set('Authorization', `Bearer ${rahulToken}`);

    // 4. Karan pays ₹2000 (200000 paise) split equally with Rahul
    await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Lunch',
        amount: 2000,
        paidBy: 'karan',
        splitType: 'EQUAL',
        participantIds: ['karan', 'rahul']
      });

    // 5. Generate settlements: Rahul owes Karan ₹1000 (100000 paise)
    const setRes = await request(app)
      .post(`/api/trips/${tripId}/settlements/calculate`)
      .set('Authorization', `Bearer ${karanToken}`);

    settlementId = setRes.body.data[0].settlementId;
  });

  it('POST /api/settlements/:settlementId/payments should allow debtor (Rahul) to report payment with UTR', async () => {
    const res = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '412345678901',
        notes: 'Paid via GPay'
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'REPORTED');
    assert.strictEqual(res.body.data.upiTransactionRef, '412345678901');
    assert.strictEqual(res.body.data.payerId, 'rahul');
    assert.strictEqual(res.body.data.payeeId, 'karan');
  });

  it('should prevent non-debtor (Karan) from submitting payment claim on settlement', async () => {
    const res = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${karanToken}`) // Karan is creditor, not debtor
      .send({
        upiTransactionRef: '999888777666'
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/payments/:paymentId/confirm should allow receiver (Karan) to confirm payment', async () => {
    // Rahul reports payment
    const payRes = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '112233445566'
      });

    const paymentId = payRes.body.data.paymentId;

    // Karan confirms receipt
    const confirmRes = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(confirmRes.body.success, true);

    // Verify settlement is marked PAID
    const tripSettles = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${karanToken}`);

    const settle = tripSettles.body.data.find(s => s.settlementId === settlementId);
    assert.strictEqual(settle.status, 'PAID');
    assert.ok(settle.settledAt);
  });

  it('should prevent self-confirmation (Rahul attempting to confirm his own payment claim)', async () => {
    const payRes = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '556677889900'
      });

    const paymentId = payRes.body.data.paymentId;

    // Rahul tries to confirm himself
    const res = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('should prevent double confirmation', async () => {
    const payRes = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '778899001122'
      });

    const paymentId = payRes.body.data.paymentId;

    // First confirmation
    await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${karanToken}`);

    // Second confirmation attempt
    const secondRes = await request(app)
      .post(`/api/payments/${paymentId}/confirm`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(secondRes.status, 400);
    assert.strictEqual(secondRes.body.error.code, 'ALREADY_CONFIRMED');
  });

  it('POST /api/payments/:paymentId/reject should allow receiver to reject payment with reason', async () => {
    const payRes = await request(app)
      .post(`/api/settlements/${settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '334455667788'
      });

    const paymentId = payRes.body.data.paymentId;

    const rejectRes = await request(app)
      .post(`/api/payments/${paymentId}/reject`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ reason: 'Bank UTR not found on statement' });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.success, true);

    // Settlement remains PENDING
    const tripSettles = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${karanToken}`);

    const settle = tripSettles.body.data.find(s => s.settlementId === settlementId);
    assert.strictEqual(settle.status, 'PENDING');
  });
});
