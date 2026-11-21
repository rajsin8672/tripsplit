import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';

describe('Invitations API Endpoints & Access Control', () => {
  const karanToken = 'mock-token-karan';
  const rahulToken = 'mock-token-rahul';
  let tripId = null;
  let rahulCode = null;

  beforeEach(async () => {
    if (db && typeof db.reset === 'function') {
      db.reset();
    }

    // Sync Rahul's profile to obtain his userCode
    const rahulSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({ displayName: 'Rahul Sharma' });
    rahulCode = rahulSync.body.data.userCode;

    // Karan creates trip
    const tripRes = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        name: 'Goa Friends Trip',
        destination: 'Goa'
      });
    tripId = tripRes.body.data.tripId;
  });

  it('POST /api/trips/:tripId/invitations should invite friend by userCode', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'PENDING');
    assert.strictEqual(res.body.data.inviteeUserCode, rahulCode);
  });

  it('should prevent duplicate invitations for the same user and trip', async () => {
    // First invite
    await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });

    // Second duplicate invite
    const res = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'DUPLICATE_INVITATION');
  });

  it('should prevent self-invitation', async () => {
    // Look up Karan's code
    const karanSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ displayName: 'Karan Kumar' });
    const karanCode = karanSync.body.data.userCode;

    const res = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: karanCode });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error.code, 'SELF_INVITATION_PROHIBITED');
  });

  it('POST /api/invitations/:invitationId/accept should add user to trip members', async () => {
    const inviteRes = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });
    const invId = inviteRes.body.data.invitationId;

    // Rahul accepts
    const acceptRes = await request(app)
      .post(`/api/invitations/${invId}/accept`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(acceptRes.status, 200);
    assert.strictEqual(acceptRes.body.success, true);

    // Verify Rahul can now access the trip
    const tripCheck = await request(app)
      .get(`/api/trips/${tripId}`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(tripCheck.status, 200);
    assert.strictEqual(tripCheck.body.data.role, 'MEMBER');
  });

  it('POST /api/invitations/:invitationId/reject should update invitation status to REJECTED', async () => {
    const inviteRes = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });
    const invId = inviteRes.body.data.invitationId;

    const rejectRes = await request(app)
      .post(`/api/invitations/${invId}/reject`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.data.message, 'Invitation rejected.');
  });
});
