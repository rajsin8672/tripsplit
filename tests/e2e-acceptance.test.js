import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/server.js';
import { db } from '../server/config/firebaseAdmin.js';
import { generateUpiUri } from '../server/utils/upi.js';

describe('End-to-End Acceptance Test: 16-Step Complete Scenario (Karan, Rahul, Aman)', () => {
  const karanToken = 'mock-token-karan';
  const rahulToken = 'mock-token-rahul';
  const amanToken = 'mock-token-aman';

  let tripId = null;
  let rahulCode = null;
  let amanCode = null;
  let hotelExpenseId = null;
  let rahulSettlement = null;
  let amanSettlement = null;
  let rahulPaymentId = null;
  let amanPaymentId = null;

  it('Step 1: Karan logs in & establishes verified profile', async () => {
    if (db && typeof db.reset === 'function') {
      db.reset();
    }

    const karanSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ displayName: 'Karan Kumar' });

    assert.strictEqual(karanSync.status, 200);
    assert.strictEqual(karanSync.body.data.displayName, 'Karan Kumar');
    assert.ok(karanSync.body.data.userCode.startsWith('TS-'));

    // Karan links his UPI ID for receiving settlements
    const upiUpdate = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ upiId: 'karan@okhdfcbank' });

    assert.strictEqual(upiUpdate.status, 200);
    assert.strictEqual(upiUpdate.body.data.upiId, 'karan@okhdfcbank');

    // Also register Rahul and Aman profiles so they have user codes
    const rahulSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({ displayName: 'Rahul Sharma' });
    rahulCode = rahulSync.body.data.userCode;

    const amanSync = await request(app)
      .post('/api/auth/sync')
      .set('Authorization', `Bearer ${amanToken}`)
      .send({ displayName: 'Aman Verma' });
    amanCode = amanSync.body.data.userCode;

    assert.ok(rahulCode);
    assert.ok(amanCode);
  });

  it('Step 2: Karan creates Goa Trip', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        name: 'Goa Trip',
        destination: 'North Goa',
        startDate: '2026-11-20',
        endDate: '2026-11-25',
        currency: 'INR',
        description: 'Annual college reunion in Goa'
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.name, 'Goa Trip');
    assert.strictEqual(res.body.data.status, 'ACTIVE');
    assert.strictEqual(res.body.data.role, 'OWNER');
    tripId = res.body.data.tripId;
    assert.ok(tripId);
  });

  it('Step 3: Karan invites Rahul and Aman by userCode', async () => {
    // Invite Rahul
    const invRahul = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: rahulCode });

    assert.strictEqual(invRahul.status, 201);
    assert.strictEqual(invRahul.body.data.status, 'PENDING');

    // Invite Aman
    const invAman = await request(app)
      .post(`/api/trips/${tripId}/invitations`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ userCode: amanCode });

    assert.strictEqual(invAman.status, 201);
    assert.strictEqual(invAman.body.data.status, 'PENDING');
  });

  it('Step 4: Rahul and Aman accept their invitations', async () => {
    // Rahul views his invitations
    const rahulInvs = await request(app)
      .get('/api/invitations')
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(rahulInvs.status, 200);
    const rahulTargetInv = rahulInvs.body.data.find(i => i.tripId === tripId && i.status === 'PENDING');
    assert.ok(rahulTargetInv);

    const rahulAccept = await request(app)
      .post(`/api/invitations/${rahulTargetInv.invitationId}/accept`)
      .set('Authorization', `Bearer ${rahulToken}`);
    assert.strictEqual(rahulAccept.status, 200);

    // Aman views his invitations
    const amanInvs = await request(app)
      .get('/api/invitations')
      .set('Authorization', `Bearer ${amanToken}`);

    assert.strictEqual(amanInvs.status, 200);
    const amanTargetInv = amanInvs.body.data.find(i => i.tripId === tripId && i.status === 'PENDING');
    assert.ok(amanTargetInv);

    const amanAccept = await request(app)
      .post(`/api/invitations/${amanTargetInv.invitationId}/accept`)
      .set('Authorization', `Bearer ${amanToken}`);
    assert.strictEqual(amanAccept.status, 200);

    // Verify trip now has 3 active members
    const membersRes = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(membersRes.status, 200);
    assert.strictEqual(membersRes.body.data.length, 3);
  });

  it('Step 5: Karan creates Hotel expense = ₹5000, Paid by Karan, Equal split among 3', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Hotel',
        amount: 5000, // ₹5000 = 500000 paise
        category: 'Accommodation',
        paidBy: 'karan',
        splitType: 'EQUAL',
        participantIds: ['karan', 'rahul', 'aman']
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.totalAmount, 500000); // exactly 500000 paise
    hotelExpenseId = res.body.data.expenseId;
  });

  it('Step 6: Verify exact integer paise shares, balances and net positions', async () => {
    const res = await request(app)
      .get(`/api/trips/${tripId}/balances`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.totalTripExpenses, 500000); // ₹5000.00

    const balances = res.body.data.memberBalances;
    const karan = balances.find(b => b.userId === 'karan');
    const rahul = balances.find(b => b.userId === 'rahul');
    const aman = balances.find(b => b.userId === 'aman');

    // Total Paid verification
    assert.strictEqual(karan.totalPaid, 500000); // 500000 paise
    assert.strictEqual(rahul.totalPaid, 0);
    assert.strictEqual(aman.totalPaid, 0);

    // Total Shares verification: Sum of shares strictly equals 500000
    const totalShares = karan.totalShare + rahul.totalShare + aman.totalShare;
    assert.strictEqual(totalShares, 500000);

    // Exact required shares:
    // Sorted participant IDs: aman, karan, rahul
    // 500000 / 3 = 166666 with remainder 2
    // Aman: 166667 paise
    // Karan: 166667 paise
    // Rahul: 166666 paise
    assert.strictEqual(aman.totalShare, 166667);
    assert.strictEqual(karan.totalShare, 166667);
    assert.strictEqual(rahul.totalShare, 166666);

    // Net positions (Paid - Share):
    // Karan: 500000 - 166667 = +333333 paise (+₹3333.33)
    // Aman: 0 - 166667 = -166667 paise (-₹1666.67)
    // Rahul: 0 - 166666 = -166666 paise (-₹1666.66)
    assert.strictEqual(karan.netBalance, 333333);
    assert.strictEqual(aman.netBalance, -166667);
    assert.strictEqual(rahul.netBalance, -166666);

    // Exact Invariant: SUM(all net balances) === 0 strictly
    const sumNet = karan.netBalance + aman.netBalance + rahul.netBalance;
    assert.strictEqual(sumNet, 0);
  });

  it('Step 7: Generate settlements using Min-Cash-Flow algorithm', async () => {
    const res = await request(app)
      .post(`/api/trips/${tripId}/settlements/calculate`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(res.status, 200);
    const settlements = res.body.data;
    assert.strictEqual(settlements.length, 2);

    amanSettlement = settlements.find(s => s.fromUser === 'aman' && s.toUser === 'karan');
    rahulSettlement = settlements.find(s => s.fromUser === 'rahul' && s.toUser === 'karan');

    assert.ok(amanSettlement);
    assert.strictEqual(amanSettlement.amount, 166667); // 166667 paise
    assert.strictEqual(amanSettlement.status, 'PENDING');

    assert.ok(rahulSettlement);
    assert.strictEqual(rahulSettlement.amount, 166666); // 166666 paise
    assert.strictEqual(rahulSettlement.status, 'PENDING');
  });

  it('Step 8: Rahul and Aman see their payment obligations', async () => {
    // Rahul checks his settlements
    const rahulCheck = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${rahulToken}`);

    assert.strictEqual(rahulCheck.status, 200);
    const myRahulSettle = rahulCheck.body.data.find(s => s.fromUser === 'rahul');
    assert.strictEqual(myRahulSettle.amount, 166666);
    assert.strictEqual(myRahulSettle.toUserName, 'Karan Kumar');

    // Aman checks his settlements
    const amanCheck = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${amanToken}`);

    assert.strictEqual(amanCheck.status, 200);
    const myAmanSettle = amanCheck.body.data.find(s => s.fromUser === 'aman');
    assert.strictEqual(myAmanSettle.amount, 166667);
    assert.strictEqual(myAmanSettle.toUserName, 'Karan Kumar');
  });

  it('Step 9: Generate the UPI payment flow for debtor/creditor pair', async () => {
    // Generate UPI URI for Aman paying Karan
    const uri = generateUpiUri({
      payeeVpa: 'karan@okhdfcbank',
      payeeName: 'Karan Kumar',
      amountPaise: amanSettlement.amount,
      transactionNote: 'TripSplit Goa Trip',
      referenceId: amanSettlement.settlementId
    });

    assert.ok(uri.startsWith('upi://pay?'));
    const parsed = new URL(uri);
    assert.strictEqual(parsed.searchParams.get('pa'), 'karan@okhdfcbank');
    assert.strictEqual(parsed.searchParams.get('am'), '1666.67');
  });

  it('Step 10: Submit a test UTR in isolated test environment (Aman clicks "I Paid")', async () => {
    const res = await request(app)
      .post(`/api/settlements/${amanSettlement.settlementId}/payments`)
      .set('Authorization', `Bearer ${amanToken}`)
      .send({
        upiTransactionRef: '412345678901',
        notes: 'Paid from GPay to Karan'
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.status, 'REPORTED');
    assert.strictEqual(res.body.data.upiTransactionRef, '412345678901');
    amanPaymentId = res.body.data.paymentId;
  });

  it('Step 11: Receiver (Karan) confirms the payment', async () => {
    const res = await request(app)
      .post(`/api/payments/${amanPaymentId}/confirm`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
  });

  it('Step 12: Verify payment and settlement statuses', async () => {
    // Check settlement status
    const settleRes = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${karanToken}`);

    const settle = settleRes.body.data.find(s => s.settlementId === amanSettlement.settlementId);
    assert.strictEqual(settle.status, 'PAID');
    assert.strictEqual(settle.paymentId, amanPaymentId);
    assert.ok(settle.settledAt);
  });

  it('Step 13: Test a rejected payment claim (Rahul reports, Karan rejects)', async () => {
    // Rahul reports payment with invalid UTR
    const payRes = await request(app)
      .post(`/api/settlements/${rahulSettlement.settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '999888777666',
        notes: 'Wrong reference test'
      });

    assert.strictEqual(payRes.status, 201);
    rahulPaymentId = payRes.body.data.paymentId;

    // Karan rejects payment claim
    const rejectRes = await request(app)
      .post(`/api/payments/${rahulPaymentId}/reject`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({ reason: 'Transaction reference not found on bank statement' });

    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.body.success, true);

    // Settlement remains PENDING so Rahul can resubmit
    const settleRes = await request(app)
      .get(`/api/trips/${tripId}/settlements`)
      .set('Authorization', `Bearer ${rahulToken}`);

    const settle = settleRes.body.data.find(s => s.settlementId === rahulSettlement.settlementId);
    assert.strictEqual(settle.status, 'PENDING');

    // Rahul submits valid corrected reference and Karan confirms
    const validPayRes = await request(app)
      .post(`/api/settlements/${rahulSettlement.settlementId}/payments`)
      .set('Authorization', `Bearer ${rahulToken}`)
      .send({
        upiTransactionRef: '123456789012',
        notes: 'Corrected GPay UTR'
      });

    assert.strictEqual(validPayRes.status, 201);
    const confirmRahulRes = await request(app)
      .post(`/api/payments/${validPayRes.body.data.paymentId}/confirm`)
      .set('Authorization', `Bearer ${karanToken}`);
    assert.strictEqual(confirmRahulRes.status, 200);
  });

  it('Step 14: Test Leave Trip (Aman leaves once settled, blocked if unsettled)', async () => {
    // Since Aman has settled all his debt (+ paid Karan 166667), let's check his leave request
    const leaveRes = await request(app)
      .post(`/api/trips/${tripId}/leave`)
      .set('Authorization', `Bearer ${amanToken}`);

    assert.strictEqual(leaveRes.status, 200);
    assert.strictEqual(leaveRes.body.success, true);

    // Aman status is now LEFT
    const membersRes = await request(app)
      .get(`/api/trips/${tripId}/members`)
      .set('Authorization', `Bearer ${karanToken}`);

    const amanMember = membersRes.body.data.find(m => m.userId === 'aman');
    assert.strictEqual(amanMember.status, 'LEFT');
    assert.ok(amanMember.leftAt);
  });

  it('Step 15: Test End Trip (Karan ends Goa Trip)', async () => {
    const endRes = await request(app)
      .post(`/api/trips/${tripId}/end`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(endRes.status, 200);
    assert.strictEqual(endRes.body.data.status, 'ENDED');
    assert.ok(endRes.body.data.endedAt);
  });

  it('Step 16: Verify ended trip history and final balances', async () => {
    // Attempting to add an expense after trip ended must be rejected
    const expAttempt = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`)
      .send({
        title: 'Post-Trip Dinner',
        amount: 1000,
        paidBy: 'karan',
        participantIds: ['karan', 'rahul']
      });

    assert.strictEqual(expAttempt.status, 400);
    assert.strictEqual(expAttempt.body.error.code, 'TRIP_ENDED');

    // Final ledger check: all expenses and splits are preserved
    const finalExpRes = await request(app)
      .get(`/api/trips/${tripId}/expenses`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(finalExpRes.status, 200);
    assert.strictEqual(finalExpRes.body.data.length, 1);
    assert.strictEqual(finalExpRes.body.data[0].totalAmount, 500000);

    // Final balances check
    const finalBalRes = await request(app)
      .get(`/api/trips/${tripId}/balances`)
      .set('Authorization', `Bearer ${karanToken}`);

    assert.strictEqual(finalBalRes.status, 200);
    assert.strictEqual(finalBalRes.body.data.totalTripExpenses, 500000);
  });
});
