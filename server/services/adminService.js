/**
 * TripSplit — Admin Service
 * Provides platform-wide analytics, user inspection, and trip governance for administrators.
 */

import { db, isMock } from '../config/firebaseAdmin.js';

const USERS_COLLECTION = 'users';
const TRIPS_COLLECTION = 'trips';
const TRIP_MEMBERS_COLLECTION = 'trip_members';
const EXPENSES_COLLECTION = 'expenses';
const SPLITS_COLLECTION = 'expense_splits';
const SETTLEMENTS_COLLECTION = 'settlements';
const PAYMENTS_COLLECTION = 'payments';

/**
 * Retrieve high-level platform statistics
 */
export async function getAdminStats() {
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  const [usersSnap, tripsSnap, expensesSnap, settlementsSnap, paymentsSnap] = await Promise.all([
    db.collection(USERS_COLLECTION).get(),
    db.collection(TRIPS_COLLECTION).get(),
    db.collection(EXPENSES_COLLECTION).get(),
    db.collection(SETTLEMENTS_COLLECTION).get(),
    db.collection(PAYMENTS_COLLECTION).get()
  ]);

  const totalUsers = usersSnap.size;

  let activeTrips = 0;
  let endedTrips = 0;
  tripsSnap.docs.forEach(d => {
    const data = d.data();
    if (data.status === 'ENDED') endedTrips++;
    else activeTrips++;
  });

  let totalExpensePaise = 0;
  expensesSnap.docs.forEach(d => {
    totalExpensePaise += (d.data().totalAmountPaise || 0);
  });

  let paidSettlements = 0;
  let pendingSettlements = 0;
  settlementsSnap.docs.forEach(d => {
    if (d.data().status === 'PAID') paidSettlements++;
    else pendingSettlements++;
  });

  let confirmedPayments = 0;
  let pendingPayments = 0;
  let rejectedPayments = 0;
  paymentsSnap.docs.forEach(d => {
    const s = d.data().status;
    if (s === 'CONFIRMED') confirmedPayments++;
    else if (s === 'REJECTED') rejectedPayments++;
    else pendingPayments++;
  });

  return {
    users: {
      total: totalUsers
    },
    trips: {
      total: tripsSnap.size,
      active: activeTrips,
      ended: endedTrips
    },
    expenses: {
      total: expensesSnap.size,
      totalAmountPaise: totalExpensePaise,
      totalAmountRupees: (totalExpensePaise / 100).toFixed(2)
    },
    settlements: {
      total: settlementsSnap.size,
      paid: paidSettlements,
      pending: pendingSettlements
    },
    payments: {
      total: paymentsSnap.size,
      confirmed: confirmedPayments,
      pending: pendingPayments,
      rejected: rejectedPayments
    },
    system: {
      engineMode: isMock ? 'Local Development Engine (.data/local-firestore.json)' : 'Live Google Cloud Firestore',
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  };
}

/**
 * Retrieve all registered platform users
 */
export async function getAdminUsers() {
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  const [usersSnap, membersSnap] = await Promise.all([
    db.collection(USERS_COLLECTION).get(),
    db.collection(TRIP_MEMBERS_COLLECTION).get()
  ]);

  // Map trips count per user
  const userTripCounts = new Map();
  membersSnap.docs.forEach(d => {
    const data = d.data();
    if (data.status === 'ACTIVE' && data.userId) {
      userTripCounts.set(data.userId, (userTripCounts.get(data.userId) || 0) + 1);
    }
  });

  const users = usersSnap.docs.map(d => {
    const data = d.data();
    return {
      uid: data.uid,
      email: data.email || 'N/A',
      displayName: data.displayName || 'TripSplit User',
      userCode: data.userCode || 'N/A',
      upiId: data.upiId || 'Not linked',
      createdAt: data.createdAt,
      activeTripsCount: userTripCounts.get(data.uid) || 0
    };
  });

  users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return users;
}

/**
 * Retrieve all platform trips with governance metadata
 */
export async function getAdminTrips() {
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  const [tripsSnap, membersSnap, expensesSnap, usersSnap] = await Promise.all([
    db.collection(TRIPS_COLLECTION).get(),
    db.collection(TRIP_MEMBERS_COLLECTION).get(),
    db.collection(EXPENSES_COLLECTION).get(),
    db.collection(USERS_COLLECTION).get()
  ]);

  // Build user map for fast lookup
  const userMap = new Map();
  usersSnap.docs.forEach(d => {
    userMap.set(d.id, d.data());
  });

  // Build member count map per trip
  const memberCounts = new Map();
  membersSnap.docs.forEach(d => {
    const m = d.data();
    if (m.status === 'ACTIVE' && m.tripId) {
      memberCounts.set(m.tripId, (memberCounts.get(m.tripId) || 0) + 1);
    }
  });

  // Build expense amount sum per trip
  const tripExpenses = new Map();
  const tripExpenseCounts = new Map();
  expensesSnap.docs.forEach(d => {
    const e = d.data();
    if (e.tripId) {
      tripExpenses.set(e.tripId, (tripExpenses.get(e.tripId) || 0) + (e.totalAmountPaise || 0));
      tripExpenseCounts.set(e.tripId, (tripExpenseCounts.get(e.tripId) || 0) + 1);
    }
  });

  const trips = tripsSnap.docs.map(d => {
    const data = d.data();
    const creator = userMap.get(data.createdBy);
    const totalPaise = tripExpenses.get(data.tripId) || 0;

    return {
      tripId: data.tripId,
      name: data.name,
      destination: data.destination,
      status: data.status,
      currency: data.currency || 'INR',
      startDate: data.startDate,
      endDate: data.endDate,
      createdAt: data.createdAt,
      endedAt: data.endedAt || null,
      creator: {
        uid: data.createdBy,
        name: creator?.displayName || 'Unknown',
        email: creator?.email || 'N/A',
        userCode: creator?.userCode || 'N/A'
      },
      memberCount: memberCounts.get(data.tripId) || 0,
      expenseCount: tripExpenseCounts.get(data.tripId) || 0,
      totalExpensePaise: totalPaise,
      totalExpenseRupees: (totalPaise / 100).toFixed(2)
    };
  });

  trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return trips;
}

/**
 * End a trip as administrator
 */
export async function adminEndTrip(tripId) {
  if (!db) {
    throw new Error('Database is not initialized.');
  }

  const tripRef = db.collection(TRIPS_COLLECTION).doc(tripId);
  const doc = await tripRef.get();

  if (!doc.exists) {
    const err = new Error('Trip not found.');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const nowIso = new Date().toISOString();
  await tripRef.update({
    status: 'ENDED',
    endedAt: nowIso,
    updatedAt: nowIso,
    endedByAdmin: true
  });

  return { tripId, status: 'ENDED', endedAt: nowIso };
}
