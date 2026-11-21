/**
 * TripSplit — Member Management Service
 */

import { db } from '../config/firebaseAdmin.js';

const TRIP_MEMBERS_COLLECTION = 'trip_members';
const USERS_COLLECTION = 'users';

/**
 * Get all members of a trip, joined with user profile data
 */
export async function getTripMembers(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // 1. Verify requester is a member of the trip
  const requesterMemberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!requesterMemberDoc.exists) {
    const error = new Error('You are not authorized to view members of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // 2. Fetch all trip member records
  const membersSnap = await db.collection(TRIP_MEMBERS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const members = [];

  for (const doc of membersSnap.docs) {
    const memData = doc.data();
    let profile = {
      displayName: 'TripSplit Member',
      userCode: '—',
      email: '',
      upiId: ''
    };

    const userDoc = await db.collection(USERS_COLLECTION).doc(memData.userId).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      profile = {
        displayName: u.displayName || u.email || 'TripSplit Member',
        userCode: u.userCode || '—',
        email: u.email || '',
        upiId: u.upiId || ''
      };
    }

    members.push({
      id: memData.id,
      tripId: memData.tripId,
      userId: memData.userId,
      role: memData.role,
      status: memData.status,
      joinedAt: memData.joinedAt,
      leftAt: memData.leftAt,
      ...profile
    });
  }

  // Sort owners first, then by joinedAt
  members.sort((a, b) => {
    if (a.role === 'OWNER' && b.role !== 'OWNER') return -1;
    if (b.role === 'OWNER' && a.role !== 'OWNER') return 1;
    return new Date(a.joinedAt) - new Date(b.joinedAt);
  });

  return members;
}
