/**
 * TripSplit — Settlement Service
 * Generates and manages Min-Cash-Flow settlements for a trip.
 */

import { db } from '../config/firebaseAdmin.js';
import { calculateMemberBalances, generateMinCashFlowSettlements } from '../utils/settlementEngine.js';

const SETTLEMENTS_COLLECTION = 'settlements';
const TRIP_MEMBERS_COLLECTION = 'trip_members';
const EXPENSES_COLLECTION = 'expenses';
const SPLITS_COLLECTION = 'expense_splits';
const USERS_COLLECTION = 'users';

/**
 * Calculate and save optimized settlements for a trip
 */
export async function calculateAndSaveSettlements(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // 1. Verify user is a member of the trip
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // 2. Fetch all members, expenses, splits
  const membersSnap = await db.collection(TRIP_MEMBERS_COLLECTION).where('tripId', '==', tripId).get();
  const members = membersSnap.docs.map(d => d.data());

  const expensesSnap = await db.collection(EXPENSES_COLLECTION).where('tripId', '==', tripId).get();
  const expenses = expensesSnap.docs.map(d => d.data());

  const splitsSnap = await db.collection(SPLITS_COLLECTION).where('tripId', '==', tripId).get();
  const splits = splitsSnap.docs.map(d => d.data());

  // 3. Compute net balances
  const balances = calculateMemberBalances(members, expenses, splits);

  // 4. Fetch existing settlements for this trip
  const existingSettlementsSnap = await db.collection(SETTLEMENTS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const existingPaid = [];
  const existingPending = [];

  for (const doc of existingSettlementsSnap.docs) {
    const s = doc.data();
    if (s.status === 'PAID') {
      existingPaid.push(s);
    } else {
      existingPending.push(s);
    }
  }

  // Adjust net balances with existing PAID settlements
  // If user A already paid user B X paise, user A's net balance increased by X, user B's decreased by X
  const adjustedBalances = balances.map(b => ({ ...b }));
  for (const paidSettle of existingPaid) {
    const debtor = adjustedBalances.find(b => b.userId === paidSettle.fromUser);
    const creditor = adjustedBalances.find(b => b.userId === paidSettle.toUser);
    if (debtor) debtor.netBalance += paidSettle.amount;
    if (creditor) creditor.netBalance -= paidSettle.amount;
  }

  // 5. Generate optimized settlements on remaining balances
  const newSettlements = generateMinCashFlowSettlements(tripId, adjustedBalances);

  // 6. Delete old PENDING settlements and write new ones
  const batch = db.batch();
  for (const p of existingPending) {
    batch.delete(db.collection(SETTLEMENTS_COLLECTION).doc(p.settlementId));
  }

  for (const s of newSettlements) {
    batch.set(db.collection(SETTLEMENTS_COLLECTION).doc(s.settlementId), s);
  }

  await batch.commit();

  return await getTripSettlements(tripId, userId);
}

/**
 * Retrieve all settlements for a trip, enriched with user profiles
 */
export async function getTripSettlements(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const settlementsSnap = await db.collection(SETTLEMENTS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const settlements = settlementsSnap.docs.map(d => d.data());

  // Enrich with user profiles
  for (const s of settlements) {
    const fromDoc = await db.collection(USERS_COLLECTION).doc(s.fromUser).get();
    if (fromDoc.exists) {
      const u = fromDoc.data();
      s.fromUserName = u.displayName || u.email || 'TripSplit Member';
      s.fromUserCode = u.userCode || '—';
      s.fromUserUpi = u.upiId || '';
    } else {
      s.fromUserName = 'TripSplit Member';
      s.fromUserCode = '—';
      s.fromUserUpi = '';
    }

    const toDoc = await db.collection(USERS_COLLECTION).doc(s.toUser).get();
    if (toDoc.exists) {
      const u = toDoc.data();
      s.toUserName = u.displayName || u.email || 'TripSplit Member';
      s.toUserCode = u.userCode || '—';
      s.toUserUpi = u.upiId || '';
    } else {
      s.toUserName = 'TripSplit Member';
      s.toUserCode = '—';
      s.toUserUpi = '';
    }
  }

  // Sort pending first, then by amount descending
  settlements.sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
    return b.amount - a.amount;
  });

  return settlements;
}
