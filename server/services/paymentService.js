/**
 * TripSplit — Manual UPI Payment Service
 * Handles reporting external UPI payments (UTR submission), receiver confirmation/rejection,
 * and double-confirmation / self-confirmation prevention via atomic transactions.
 */

import crypto from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import { validateUtr } from '../utils/upi.js';

const PAYMENTS_COLLECTION = 'payments';
const SETTLEMENTS_COLLECTION = 'settlements';
const TRIPS_COLLECTION = 'trips';
const USERS_COLLECTION = 'users';

function generatePaymentId() {
  return `PAY-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Submit an external UPI payment claim ("I Paid" flow)
 */
export async function submitPayment(settlementId, payerId, { upiTransactionRef, notes }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // 1. Fetch settlement
  const settleRef = db.collection(SETTLEMENTS_COLLECTION).doc(settlementId);
  const settleDoc = await settleRef.get();

  if (!settleDoc.exists) {
    const error = new Error('Settlement not found.');
    error.status = 404;
    error.code = 'SETTLEMENT_NOT_FOUND';
    throw error;
  }

  const settlement = settleDoc.data();

  // 2. Validate settlement status
  if (settlement.status === 'PAID') {
    const error = new Error('This settlement has already been fully paid and confirmed.');
    error.status = 400;
    error.code = 'ALREADY_PAID';
    throw error;
  }

  // 3. Verify requester is the designated debtor (fromUser)
  if (settlement.fromUser !== payerId) {
    const error = new Error('Only the debtor specified in this settlement can submit payment claims.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // 4. Validate UTR / reference
  if (!upiTransactionRef || !validateUtr(upiTransactionRef)) {
    const error = new Error('A valid UPI transaction reference (UTR / RRN) of 6 to 40 characters is required.');
    error.status = 400;
    error.code = 'INVALID_UTR';
    throw error;
  }

  const cleanUtr = upiTransactionRef.trim();

  // 5. Check duplicate UTR within the same trip/settlement
  const existingPayments = await db.collection(PAYMENTS_COLLECTION)
    .where('tripId', '==', settlement.tripId)
    .where('upiTransactionRef', '==', cleanUtr)
    .get();

  for (const doc of existingPayments.docs) {
    const p = doc.data();
    if (p.status === 'CONFIRMED' || p.status === 'REPORTED') {
      const error = new Error(`Transaction reference ${cleanUtr} has already been submitted for this trip.`);
      error.status = 400;
      error.code = 'DUPLICATE_UTR';
      throw error;
    }
  }

  // 6. Check if there is already a pending REPORTED claim on this settlement
  const pendingClaims = await db.collection(PAYMENTS_COLLECTION)
    .where('settlementId', '==', settlementId)
    .where('status', '==', 'REPORTED')
    .get();

  if (!pendingClaims.empty) {
    const error = new Error('A payment claim is already awaiting receiver verification for this settlement.');
    error.status = 400;
    error.code = 'CLAIM_ALREADY_PENDING';
    throw error;
  }

  const paymentId = generatePaymentId();
  const nowIso = new Date().toISOString();

  const paymentRecord = {
    paymentId,
    settlementId,
    tripId: settlement.tripId,
    payerId,
    payeeId: settlement.toUser,
    amount: settlement.amount,
    currency: settlement.currency || 'INR',
    paymentMethod: 'UPI',
    upiTransactionRef: cleanUtr,
    notes: notes ? notes.trim() : '',
    status: 'REPORTED',
    submittedAt: nowIso,
    confirmedAt: null,
    rejectedAt: null,
    rejectionReason: null
  };

  const batch = db.batch();
  batch.set(db.collection(PAYMENTS_COLLECTION).doc(paymentId), paymentRecord);
  batch.update(settleRef, { paymentId });
  await batch.commit();

  return paymentRecord;
}

/**
 * Confirm an incoming payment claim (Receiver only)
 */
export async function confirmPayment(paymentId, receiverId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const paymentRef = db.collection(PAYMENTS_COLLECTION).doc(paymentId);

  return await db.runTransaction(async (transaction) => {
    const paymentDoc = await transaction.get(paymentRef);

    if (!paymentDoc.exists) {
      const error = new Error('Payment record not found.');
      error.status = 404;
      error.code = 'PAYMENT_NOT_FOUND';
      throw error;
    }

    const payment = paymentDoc.data();

    // Verify authenticated user is the designated payee
    if (payment.payeeId !== receiverId) {
      const error = new Error('Only the designated payment recipient can confirm receipt.');
      error.status = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    // Prevent self-confirmation
    if (payment.payerId === receiverId) {
      const error = new Error('Self-confirmation is strictly prohibited. Only the recipient can confirm.');
      error.status = 400;
      error.code = 'SELF_CONFIRMATION_PROHIBITED';
      throw error;
    }

    // Verify payment is still in REPORTED status
    if (payment.status === 'CONFIRMED') {
      const error = new Error('This payment has already been confirmed.');
      error.status = 400;
      error.code = 'ALREADY_CONFIRMED';
      throw error;
    }

    if (payment.status !== 'REPORTED') {
      const error = new Error(`Cannot confirm payment with status: ${payment.status}.`);
      error.status = 400;
      error.code = 'INVALID_PAYMENT_STATE';
      throw error;
    }

    const settleRef = db.collection(SETTLEMENTS_COLLECTION).doc(payment.settlementId);
    const settleDoc = await transaction.get(settleRef);

    if (!settleDoc.exists) {
      const error = new Error('Associated settlement not found.');
      error.status = 404;
      error.code = 'SETTLEMENT_NOT_FOUND';
      throw error;
    }

    const nowIso = new Date().toISOString();

    transaction.update(paymentRef, {
      status: 'CONFIRMED',
      confirmedAt: nowIso
    });

    transaction.update(settleRef, {
      status: 'PAID',
      settledAt: nowIso,
      paymentId: payment.paymentId
    });

    return {
      success: true,
      message: 'Payment confirmed successfully. Settlement marked as PAID.',
      paymentId: payment.paymentId,
      settlementId: payment.settlementId,
      confirmedAt: nowIso
    };
  });
}

/**
 * Reject an incoming payment claim (Receiver only)
 */
export async function rejectPayment(paymentId, receiverId, { reason }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const paymentRef = db.collection(PAYMENTS_COLLECTION).doc(paymentId);
  const paymentDoc = await paymentRef.get();

  if (!paymentDoc.exists) {
    const error = new Error('Payment record not found.');
    error.status = 404;
    error.code = 'PAYMENT_NOT_FOUND';
    throw error;
  }

  const payment = paymentDoc.data();

  // Verify payee identity
  if (payment.payeeId !== receiverId) {
    const error = new Error('Only the designated payment recipient can reject a payment claim.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  if (payment.status !== 'REPORTED') {
    const error = new Error(`Cannot reject payment with status: ${payment.status}.`);
    error.status = 400;
    error.code = 'INVALID_PAYMENT_STATE';
    throw error;
  }

  const nowIso = new Date().toISOString();
  const cleanReason = reason ? reason.trim() : 'Payment not credited to bank account.';

  await paymentRef.update({
    status: 'REJECTED',
    rejectedAt: nowIso,
    rejectionReason: cleanReason
  });

  return {
    success: true,
    message: 'Payment claim rejected. Debtor may submit a corrected transaction reference.',
    paymentId: payment.paymentId,
    rejectedAt: nowIso
  };
}

/**
 * Retrieve user's payments (sent, received, or filtered)
 */
export async function getUserPayments(userId, { type, status } = {}) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const resultsMap = new Map();

  if (!type || type === 'sent' || type === 'all') {
    const sentSnap = await db.collection(PAYMENTS_COLLECTION).where('payerId', '==', userId).get();
    sentSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
  }

  if (!type || type === 'received' || type === 'all') {
    const recSnap = await db.collection(PAYMENTS_COLLECTION).where('payeeId', '==', userId).get();
    recSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
  }

  let payments = Array.from(resultsMap.values());

  if (status) {
    const filterStatus = status.toUpperCase();
    payments = payments.filter(p => p.status === filterStatus);
  }

  // Enrich with trip name and party profiles
  for (const p of payments) {
    const tripDoc = await db.collection(TRIPS_COLLECTION).doc(p.tripId).get();
    p.tripName = tripDoc.exists ? tripDoc.data().name : 'Trip';

    const payerDoc = await db.collection(USERS_COLLECTION).doc(p.payerId).get();
    if (payerDoc.exists) {
      const u = payerDoc.data();
      p.payerName = u.displayName || u.email || 'TripSplit Member';
      p.payerCode = u.userCode || '—';
    }

    const payeeDoc = await db.collection(USERS_COLLECTION).doc(p.payeeId).get();
    if (payeeDoc.exists) {
      const u = payeeDoc.data();
      p.payeeName = u.displayName || u.email || 'TripSplit Member';
      p.payeeCode = u.userCode || '—';
      p.payeeUpi = u.upiId || '';
    }
  }

  payments.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return payments;
}
