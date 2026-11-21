/**
 * TripSplit — Invitation Service
 * Handles inviting friends via Email or User Code, accepting/rejecting invitations, and duplicate prevention.
 */

import crypto from 'crypto';
import { db } from '../config/firebaseAdmin.js';
import { validateEmail } from '../utils/validation.js';

const INVITATIONS_COLLECTION = 'invitations';
const TRIPS_COLLECTION = 'trips';
const TRIP_MEMBERS_COLLECTION = 'trip_members';
const USERS_COLLECTION = 'users';

function generateInvitationId() {
  return `INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Create a new trip invitation
 */
export async function createInvitation(tripId, inviterId, { email, userCode }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // 1. Verify trip exists and is ACTIVE
  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(tripId).get();
  if (!tripDoc.exists) {
    const error = new Error('Trip not found.');
    error.status = 404;
    error.code = 'TRIP_NOT_FOUND';
    throw error;
  }
  const trip = tripDoc.data();
  if (trip.status === 'ENDED') {
    const error = new Error('Cannot invite members to a trip that has ended.');
    error.status = 400;
    error.code = 'TRIP_ENDED';
    throw error;
  }

  // 2. Verify inviter is an ACTIVE member of the trip
  const inviterMemberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${inviterId}`).get();
  if (!inviterMemberDoc.exists || inviterMemberDoc.data().status !== 'ACTIVE') {
    const error = new Error('Only active trip members can invite new friends.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // 3. Resolve target user by email or userCode
  if (!email && !userCode) {
    const error = new Error('Please provide either an email address or a unique User Code.');
    error.status = 400;
    error.code = 'MISSING_INVITATION_TARGET';
    throw error;
  }

  let targetUser = null;
  let targetEmail = email ? email.trim().toLowerCase() : '';
  let targetUserCode = userCode ? userCode.trim().toUpperCase() : '';

  if (targetEmail) {
    if (!validateEmail(targetEmail)) {
      const error = new Error('Invalid email address format.');
      error.status = 400;
      error.code = 'INVALID_EMAIL';
      throw error;
    }
    const snap = await db.collection(USERS_COLLECTION).where('email', '==', targetEmail).limit(1).get();
    if (!snap.empty) {
      targetUser = snap.docs[0].data();
      targetUserCode = targetUser.userCode || targetUserCode;
    }
  } else if (targetUserCode) {
    const snap = await db.collection(USERS_COLLECTION).where('userCode', '==', targetUserCode).limit(1).get();
    if (!snap.empty) {
      targetUser = snap.docs[0].data();
      targetEmail = targetUser.email || targetEmail;
    } else {
      const error = new Error(`User with code ${targetUserCode} was not found.`);
      error.status = 404;
      error.code = 'USER_NOT_FOUND';
      throw error;
    }
  }

  // Cannot invite oneself
  if (targetUser && targetUser.uid === inviterId) {
    const error = new Error('You cannot invite yourself to a trip.');
    error.status = 400;
    error.code = 'SELF_INVITATION_PROHIBITED';
    throw error;
  }

  // 4. Prevent duplicate membership
  if (targetUser) {
    const existingMember = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${targetUser.uid}`).get();
    if (existingMember.exists && existingMember.data().status === 'ACTIVE') {
      const error = new Error(`${targetUser.displayName || targetUser.email} is already an active member of this trip.`);
      error.status = 400;
      error.code = 'ALREADY_MEMBER';
      throw error;
    }
  }

  // 5. Prevent duplicate pending invitations
  const pendingInvites = await db.collection(INVITATIONS_COLLECTION)
    .where('tripId', '==', tripId)
    .where('status', '==', 'PENDING')
    .get();

  for (const doc of pendingInvites.docs) {
    const data = doc.data();
    if ((targetUser && data.inviteeId === targetUser.uid) ||
        (targetEmail && data.inviteeEmail === targetEmail) ||
        (targetUserCode && data.inviteeUserCode === targetUserCode)) {
      const error = new Error('A pending invitation has already been sent to this user for this trip.');
      error.status = 400;
      error.code = 'DUPLICATE_INVITATION';
      throw error;
    }
  }

  // 6. Create invitation
  const invitationId = generateInvitationId();
  const nowIso = new Date().toISOString();

  const invitation = {
    invitationId,
    tripId,
    tripName: trip.name,
    tripDestination: trip.destination,
    inviterId,
    inviteeId: targetUser ? targetUser.uid : null,
    inviteeEmail: targetEmail,
    inviteeUserCode: targetUserCode,
    status: 'PENDING',
    createdAt: nowIso,
    respondedAt: null
  };

  await db.collection(INVITATIONS_COLLECTION).doc(invitationId).set(invitation);

  return invitation;
}

/**
 * Get all invitations intended for the user (by userId, email, or userCode)
 */
export async function getUserInvitations(userId, userEmail, userCode) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const resultsMap = new Map();

  // Search by inviteeId
  if (userId) {
    const snap = await db.collection(INVITATIONS_COLLECTION).where('inviteeId', '==', userId).get();
    snap.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
  }

  // Search by email
  if (userEmail) {
    const snap = await db.collection(INVITATIONS_COLLECTION).where('inviteeEmail', '==', userEmail.toLowerCase().trim()).get();
    snap.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
  }

  // Search by userCode
  if (userCode) {
    const snap = await db.collection(INVITATIONS_COLLECTION).where('inviteeUserCode', '==', userCode.toUpperCase().trim()).get();
    snap.docs.forEach(doc => resultsMap.set(doc.id, doc.data()));
  }

  const invitations = Array.from(resultsMap.values());

  // Enrich with inviter display names
  for (const inv of invitations) {
    if (inv.inviterId) {
      const inviterDoc = await db.collection(USERS_COLLECTION).doc(inv.inviterId).get();
      if (inviterDoc.exists) {
        inv.inviterName = inviterDoc.data().displayName || inviterDoc.data().email || 'TripSplit Friend';
      }
    }
  }

  invitations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return invitations;
}

/**
 * Get pending invitations sent for a specific trip
 */
export async function getTripInvitations(tripId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  // Verify requester is a member
  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${tripId}_${userId}`).get();
  if (!memberDoc.exists) {
    const error = new Error('You are not a member of this trip.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const snap = await db.collection(INVITATIONS_COLLECTION)
    .where('tripId', '==', tripId)
    .get();

  const invites = snap.docs.map(d => d.data());
  invites.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return invites;
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(invitationId, userId, userEmail, userCode) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const invRef = db.collection(INVITATIONS_COLLECTION).doc(invitationId);
  const invDoc = await invRef.get();

  if (!invDoc.exists) {
    const error = new Error('Invitation not found.');
    error.status = 404;
    error.code = 'INVITATION_NOT_FOUND';
    throw error;
  }

  const invitation = invDoc.data();

  if (invitation.status !== 'PENDING') {
    const error = new Error(`Cannot accept an invitation with status: ${invitation.status}.`);
    error.status = 400;
    error.code = 'INVITATION_NOT_PENDING';
    throw error;
  }

  // Validate that the authenticated user is the intended recipient
  const matchesId = invitation.inviteeId && invitation.inviteeId === userId;
  const matchesEmail = invitation.inviteeEmail && userEmail && invitation.inviteeEmail.toLowerCase() === userEmail.toLowerCase();
  const matchesCode = invitation.inviteeUserCode && userCode && invitation.inviteeUserCode.toUpperCase() === userCode.toUpperCase();

  if (!matchesId && !matchesEmail && !matchesCode) {
    const error = new Error('You are not authorized to accept this invitation.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  // Check trip status
  const tripDoc = await db.collection(TRIPS_COLLECTION).doc(invitation.tripId).get();
  if (!tripDoc.exists || tripDoc.data().status === 'ENDED') {
    const error = new Error('This trip has already ended. Invitations cannot be accepted.');
    error.status = 400;
    error.code = 'TRIP_ENDED';
    throw error;
  }

  const nowIso = new Date().toISOString();
  const membershipId = `${invitation.tripId}_${userId}`;
  const memberRef = db.collection(TRIP_MEMBERS_COLLECTION).doc(membershipId);

  const batch = db.batch();

  // Create or restore active membership
  batch.set(memberRef, {
    id: membershipId,
    tripId: invitation.tripId,
    userId,
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: nowIso,
    leftAt: null
  }, { merge: true });

  // Update invitation status
  batch.update(invRef, {
    status: 'ACCEPTED',
    inviteeId: userId,
    respondedAt: nowIso
  });

  await batch.commit();

  return {
    success: true,
    message: 'Invitation accepted successfully.',
    tripId: invitation.tripId
  };
}

/**
 * Reject an invitation
 */
export async function rejectInvitation(invitationId, userId, userEmail, userCode) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const invRef = db.collection(INVITATIONS_COLLECTION).doc(invitationId);
  const invDoc = await invRef.get();

  if (!invDoc.exists) {
    const error = new Error('Invitation not found.');
    error.status = 404;
    error.code = 'INVITATION_NOT_FOUND';
    throw error;
  }

  const invitation = invDoc.data();

  if (invitation.status !== 'PENDING') {
    const error = new Error(`Cannot reject an invitation with status: ${invitation.status}.`);
    error.status = 400;
    error.code = 'INVITATION_NOT_PENDING';
    throw error;
  }

  // Validate that the authenticated user is the intended recipient
  const matchesId = invitation.inviteeId && invitation.inviteeId === userId;
  const matchesEmail = invitation.inviteeEmail && userEmail && invitation.inviteeEmail.toLowerCase() === userEmail.toLowerCase();
  const matchesCode = invitation.inviteeUserCode && userCode && invitation.inviteeUserCode.toUpperCase() === userCode.toUpperCase();

  if (!matchesId && !matchesEmail && !matchesCode) {
    const error = new Error('You are not authorized to reject this invitation.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const nowIso = new Date().toISOString();
  await invRef.update({
    status: 'REJECTED',
    respondedAt: nowIso
  });

  return {
    success: true,
    message: 'Invitation rejected.'
  };
}

/**
 * Cancel an invitation (by inviter or trip owner)
 */
export async function cancelInvitation(invitationId, userId) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const invRef = db.collection(INVITATIONS_COLLECTION).doc(invitationId);
  const invDoc = await invRef.get();

  if (!invDoc.exists) {
    const error = new Error('Invitation not found.');
    error.status = 404;
    error.code = 'INVITATION_NOT_FOUND';
    throw error;
  }

  const invitation = invDoc.data();

  if (invitation.status !== 'PENDING') {
    const error = new Error(`Cannot cancel an invitation with status: ${invitation.status}.`);
    error.status = 400;
    error.code = 'INVITATION_NOT_PENDING';
    throw error;
  }

  // Check authorization: must be inviter or trip owner
  const isInviter = invitation.inviterId === userId;
  let isOwner = false;

  const memberDoc = await db.collection(TRIP_MEMBERS_COLLECTION).doc(`${invitation.tripId}_${userId}`).get();
  if (memberDoc.exists && memberDoc.data().role === 'OWNER') {
    isOwner = true;
  }

  if (!isInviter && !isOwner) {
    const error = new Error('Only the inviter or trip owner can cancel this invitation.');
    error.status = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  const nowIso = new Date().toISOString();
  await invRef.update({
    status: 'CANCELLED',
    respondedAt: nowIso
  });

  return {
    success: true,
    message: 'Invitation cancelled.'
  };
}
