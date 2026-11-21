/**
 * TripSplit — Balance Calculation Service
 * Computes individual contributions, shares, net balances, and verifies SUM = 0.
 */

import { db } from '../config/firebaseAdmin.js';
import { calculateMemberBalances } from '../utils/settlementEngine.js';

const TRIP_MEMBERS_COLLECTION = 'trip_members';
const EXPENSES_COLLECTION = 'expenses';
const SPLITS_COLLECTION = 'expense_splits';
const USERS_COLLECTION = 'users';

/**
 * Get comprehensive balance overview for a trip
 */
export async function getTripBalances(tripId, userId) {
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

  // 2. Fetch all trip members
  const membersSnap = await db.collection(TRIP_MEMBERS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const members = membersSnap.docs.map(d => d.data());

  // 3. Fetch all expenses and splits
  const expensesSnap = await db.collection(EXPENSES_COLLECTION)
    .where('tripId', '==', tripId)
    .get();
  const expenses = expensesSnap.docs.map(d => d.data());

  const splitsSnap = await db.collection(SPLITS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();
  const splits = splitsSnap.docs.map(d => d.data());

  // 4. Calculate member balances using the engine
  const memberBalances = calculateMemberBalances(members, expenses, splits);

  // 5. Enrich with user profile data
  let totalTripExpenses = 0;
  for (const exp of expenses) {
    totalTripExpenses += exp.totalAmount || 0;
  }

  const enrichedBalances = [];
  let userSummary = {
    totalPaid: 0,
    totalShare: 0,
    netBalance: 0
  };

  for (const b of memberBalances) {
    let profile = {
      displayName: 'TripSplit Member',
      userCode: '—',
      email: '',
      upiId: ''
    };

    const userDoc = await db.collection(USERS_COLLECTION).doc(b.userId).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      profile = {
        displayName: u.displayName || u.email || 'TripSplit Member',
        userCode: u.userCode || '—',
        email: u.email || '',
        upiId: u.upiId || ''
      };
    }

    const memberRecord = members.find(m => m.userId === b.userId);

    const enriched = {
      ...b,
      role: memberRecord?.role || 'MEMBER',
      status: memberRecord?.status || 'ACTIVE',
      ...profile
    };

    if (b.userId === userId) {
      userSummary = {
        totalPaid: b.totalPaid,
        totalShare: b.totalShare,
        netBalance: b.netBalance
      };
    }

    enrichedBalances.push(enriched);
  }

  // Sort descending by netBalance (creditors first, debtors last)
  enrichedBalances.sort((a, b) => b.netBalance - a.netBalance);

  return {
    tripId,
    totalTripExpenses,
    mySummary: userSummary,
    memberBalances: enrichedBalances
  };
}
