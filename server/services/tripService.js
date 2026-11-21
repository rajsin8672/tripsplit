/**
 * Trip Split — Trip Management Service
 * Handles trip creation, retrieval, updates, ending trips, and leaving trips.
 */

import crypto from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import { calculateMemberBalances } from '../utils/settlementEngine.js';
import { formatPaiseToRupees } from '../utils/money.js';

const TRIPS_COLLECTION = 'trips';
const TRIP_MEMBERS_COLLECTION = 'trip_members';
const EXPENSES_COLLECTION = 'expenses';
const SPLITS_COLLECTION = 'expense_splits';
const USERS_COLLECTION = 'users';
const SETTLEMENTS_COLLECTION = 'settlements';

/**
 * Generate a unique trip ID
 */
function generateTripId() {
  return `TRIP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Create a new trip and assign creator as OWNER
 */
export async function createTrip(userId, { name, destination, startDate, endDate, currency, description }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    const error = new Error('Trip name is required and must be at least 2 characters.');
    error.status = 400;
    error.code = 'INVALID_TRIP_NAME';
    throw error;
  }

  if (!destination || typeof destination !== 'string' || destination.trim().length < 2) {
    const error = new Error('Destination is required and must be at least 2 characters.');
    error.status = 400;
    error.code = 'INVALID_DESTINATION';
    throw error;
  }

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      const error = new Error('End date cannot be earlier than start date.');
      error.status = 400;
      error.code = 'INVALID_DATE_RANGE';
      throw error;
    }
  }

  const tripId = generateTripId();
  const nowIso = new Date().toISOString();

  const newTrip = {
    tripId,
    name: name.trim(),
    destination: destination.trim(),
    description: description ? description.trim() : '',
    startDate: startDate || null,
    endDate: endDate || null,
    currency: currency ? currency.trim().toUpperCase() : 'INR',
    createdBy: userId,
    status: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso,
    endedAt: null
  };

  const membershipId = `${tripId}_${userId}`;
  const ownerMembership = {
    id: membershipId,
    tripId,
    userId,
    role: 'OWNER',
    status: 'ACTIVE',
    joinedAt: nowIso,
    leftAt: null
  };

  const batch = db.batch();
  const tripRef = db.collection(TRIPS_COLLECTION).doc(tripId);
  const memberRef = db.collection(TRIP_MEMBERS_COLLECTION).doc(membershipId);

  batch.set(tripRef, newTrip);
  batch.set(memberRef, ownerMembership);
  await batch.commit();

  return {
    ...newTrip,
    role: 'OWNER',
    membershipStatus: 'ACTIVE',
    memberCount: 1
  };
}

/**
 * Retrieve all trips for a specific user (created or joined)
 */
export async function getUserTrips(userId, { status, query } = {}) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // 1. Fetch user's memberships
  const memberSnapshot = await db.collection(TRIP_MEMBERS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  if (memberSnapshot.empty) {
    return [];
  }

  const membershipMap = new Map();
  memberSnapshot.docs.forEach(doc => {
    const data = doc.data();
    membershipMap.set(data.tripId, data);
  });

  const tripIds = Array.from(membershipMap.keys());
  const trips = [];

  // 2. Fetch trip details
  for (const tid of tripIds) {
    const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tid).get();
    if (!tripDoc.exists) continue;

    const tripData = tripDoc.data();

    // Filter by status if requested
    if (status && tripData.status !== status.toUpperCase()) {
      continue;
    }

    // Filter by search query if requested
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      const matchName = tripData.name.toLowerCase().includes(q);
      const matchDest = tripData.destination.toLowerCase().includes(q);
      if (!matchName && !matchDest) {
        continue;
      }
    }

    // Count active members in trip
    const activeMembersSnap = await db.collection(TRIP_MEMBERS_COLLECTION)
      .where('tripId', '==', tid)
      .where('status', '==', 'ACTIVE')
      .get();

    const userMembership = membershipMap.get(tid);

    trips.push({
      ...tripData,
      role: userMembership.role,
      membershipStatus: userMembership.status,
      memberCount: activeMembersSnap.size || 1
    });
  }

  // Sort descending by createdAt
  trips.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return trips;
}

/**
 * Get detailed information for a single trip
 */
export async function getTripById(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  const tripData = tripDoc.data();

  // Verify user is an active or historical member
  const membershipId = `${tripId}_${userId}`;
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(membershipId).get();

  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const userMembership = memberDoc.data();

  // Get creator profile info
  let creatorName = 'TripSplit User';
  const creatorDoc = await db.collection(USERS_COLLECTION).doc(tripData.createdBy).get();
  if (creatorDoc.exists) {
    creatorName = creatorDoc.data().displayName || creatorDoc.data().email || 'TripSplit User';
  }

  // Count active members
  const activeMembersSnap = await db.collection(TRIP_MEMBERS_COLLECTION)
    .where('tripId', '==', tripId)
    .where('status', '==', 'ACTIVE')
    .get();

  return {
    ...tripData,
    creatorName,
    role: userMembership.role,
    membershipStatus: userMembership.status,
    joinedAt: userMembership.joinedAt,
    leftAt: userMembership.leftAt,
    memberCount: activeMembersSnap.size || 1
  };
}

/**
 * Update trip details (only active trips, only OWNER)
 */
export async function updateTrip(tripId, userId, { name, destination, startDate, endDate, description }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  const tripData = tripDoc.data();
  if (tripData.status === 'ENDED') {
    const error = new Error('Cannot modify a trip that has already ended.');
    error.status = 400;
    error.code = 'TRIP_ENDED';
    throw error;
  }

  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists || memberDoc.data().status !== 'ACTIVE' || memberDoc.data().role !== 'OWNER') {
    const error = new Error('Only the trip owner can update trip settings.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const updatePayload = {
    updatedAt: new Date().toISOString()
  };

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      const error = new Error('Trip name must be at least 2 characters.');
      error.status = 400;
      error.code = 'INVALID_TRIP_NAME';
      throw error;
    }
    updatePayload.name = name.trim();
  }

  if (destination !== undefined) {
    if (!destination || typeof destination !== 'string' || destination.trim().length < 2) {
      const error = new Error('Destination must be at least 2 characters.');
      error.status = 400;
      error.code = 'INVALID_DESTINATION';
      throw error;
    }
    updatePayload.destination = destination.trim();
  }

  if (startDate !== undefined) updatePayload.startDate = startDate;
  if (endDate !== undefined) updatePayload.endDate = endDate;
  if (description !== undefined) updatePayload.description = description ? description.trim() : '';

  if (updatePayload.startDate && updatePayload.endDate) {
    if (new Date(updatePayload.endDate) < new Date(updatePayload.startDate)) {
      const error = new Error('End date cannot be earlier than start date.');
      error.status = 400;
      error.code = 'INVALID_DATE_RANGE';
      throw error;
    }
  }

  await db.collection(TRIPS_COLLECTION).doc(tripId).update(updatePayload);

  return {
    ...tripData,
    ...updatePayload
  };
}

/**
 * End a trip. Any ACTIVE member can end the trip.
 * Transitions status to ENDED. Disables further expenses, invitations, and financial edits.
 */
export async function endTrip(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const tripRef = db.collection(TRIPS_COLLECTION).doc(tripId);
  const tripDoc = await tripRef.get();

  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  const tripData = tripDoc.data();
  if (tripData.status === 'ENDED') {
    const error = new Error('This trip has already ended.');
    error.status = 400;
    error.code = 'ALREADY_ENDED';
    throw error;
  }

  // Verify requester is an ACTIVE member
  const memberRef = db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists || memberDoc.data().status !== 'ACTIVE') {
    const error = new Error('Only active trip members can end the trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const nowIso = new Date().toISOString();
  await tripRef.update({
    status: 'ENDED',
    endedAt: nowIso,
    updatedAt: nowIso
  });

  return {
    ...tripData,
    status: 'ENDED',
    endedAt: nowIso,
    updatedAt: nowIso
  };
}

/**
 * Leave a trip.
 * Rules:
 * - Must be an ACTIVE member.
 * - Net balance must be 0 (all debts/credits settled).
 * - Updates membership status to LEFT.
 * - Preserves all historical financial records.
 */
export async function leaveTrip(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }

  const memberRef = db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`);
  const memberDoc = await memberRef.get();

  if (!memberDoc.exists || memberDoc.data().status !== 'ACTIVE') {
    const error = new Error('You are not currently an active member of this trip.');
    error.status = 400;
    error.code = 'NOT_ACTIVE_MEMBER';
    throw error;
  }

  // Compute balances to verify zero net position
  const membersSnap = await db.collection(TRIP_MEMBERS_COLLECTION).where('tripId', '==', tripId).get();
  const members = membersSnap.docs.map(d => d.data());

  const expensesSnap = await db.collection(EXPENSES_COLLECTION).where('tripId', '==', tripId).get();
  const expenses = expensesSnap.docs.map(d => d.data());

  const splitsSnap = await db.collection(SPLITS_COLLECTION).where('tripId', '==', tripId).get();
  const splits = splitsSnap.docs.map(d => d.data());

  const balances = calculateMemberBalances(members, expenses, splits);

  // Factor in confirmed/PAID settlements to determine real-time outstanding balance
  const settlementsSnap = await db.collection(SETTLEMENTS_COLLECTION).where('tripId', '==', tripId).get();
  for (const sDoc of settlementsSnap.docs) {
    const s = sDoc.data();
    if (s.status === 'PAID') {
      const debtor = balances.find(b => b.userId === s.fromUser);
      const creditor = balances.find(b => b.userId === s.toUser);
      if (debtor) debtor.netBalance += s.amount;
      if (creditor) creditor.netBalance -= s.amount;
    }
  }

  const userBalance = balances.find(b => b.userId === userId);
  const netBalance = userBalance ? userBalance.netBalance : 0;

  if (netBalance !== 0) {
    const amountStr = formatPaiseToRupees(Math.abs(netBalance), true);
    const direction = netBalance > 0 ? 'owed' : 'owe';
    const error = new Error(
      `Cannot leave trip with an outstanding balance. You currently ${direction} ${amountStr}. All balances must be fully settled before leaving.`
    );
    error.status = 400;
    error.code = 'OUTSTANDING_BALANCE';
    error.data = { netBalancePaise: netBalance };
    throw error;
  }

  const nowIso = new Date().toISOString();
  const currentRole = memberDoc.data().role;

  const batch = db.batch();
  batch.update(memberRef, {
    status: 'LEFT',
    leftAt: nowIso
  });

  // If user was OWNER, reassign ownership to another active member if one exists
  if (currentRole === 'OWNER') {
    const otherActiveMembers = members.filter(m => m.userId !== userId && m.status === 'ACTIVE');
    if (otherActiveMembers.length > 0) {
      const nextOwnerRef = db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${otherActiveMembers[0].userId}`);
      batch.update(nextOwnerRef, { role: 'OWNER' });
    }
  }

  await batch.commit();

  return {
    success: true,
    message: 'You have left the trip. Your historical records are preserved.',
    leftAt: nowIso
  };
}
