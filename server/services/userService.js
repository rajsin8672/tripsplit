import { db } from '../config/firebaseAdmin.js';
import { generateUserCode, validateDisplayName, validateUpiId } from '../utils/validation.js';

const USERS_COLLECTION = 'users';

/**
 * Generate a unique userCode that does not already exist in Firestore
 */
async function generateUniqueUserCode() {
  let attempts = 0;
  while (attempts < 5) {
    const candidate = generateUserCode();
    const snapshot = await db.collection(USERS_COLLECTION)
      .where('userCode', '==', candidate)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return candidate;
    }
    attempts++;
  }
  // Fallback with timestamp suffix if multiple collisions happen
  return `TS-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/**
 * Format Firestore document data into safe API response
 */
function formatSafeProfile(data) {
  return {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName || '',
    userCode: data.userCode,
    upiId: data.upiId || '',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

/**
 * Sync or create user profile in Firestore
 */
export async function syncUserProfile(authUser, additionalData = {}) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const userRef = db.collection(USERS_COLLECTION).doc(authUser.uid);
  const doc = await userRef.get();

  const nowIso = new Date().toISOString();

  if (!doc.exists) {
    let displayName = 'TripSplit User';
    if (additionalData.displayName && validateDisplayName(additionalData.displayName)) {
      displayName = additionalData.displayName.trim();
    } else if (authUser.name && validateDisplayName(authUser.name)) {
      displayName = authUser.name.trim();
    }

    const userCode = await generateUniqueUserCode();

    const newProfile = {
      uid: authUser.uid,
      email: authUser.email || '',
      displayName,
      userCode,
      upiId: '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await userRef.set(newProfile);
    return formatSafeProfile(newProfile);
  }

  // Document exists: update updatedAt and displayName if newly provided and valid
  const existingData = doc.data();
  const updatePayload = {
    updatedAt: nowIso
  };

  // If existing user has no displayName and a valid one is supplied
  if ((!existingData.displayName || existingData.displayName === 'TripSplit User') &&
      additionalData.displayName &&
      validateDisplayName(additionalData.displayName)) {
    updatePayload.displayName = additionalData.displayName.trim();
  }

  // Ensure userCode exists if legacy profile lacked one
  if (!existingData.userCode) {
    updatePayload.userCode = await generateUniqueUserCode();
  }

  await userRef.update(updatePayload);

  return formatSafeProfile({
    ...existingData,
    ...updatePayload
  });
}

/**
 * Get profile for authenticated user
 */
export async function getUserProfile(uid) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    return null;
  }

  return formatSafeProfile(doc.data());
}

/**
 * Update authenticated user's profile with approved fields only
 */
export async function updateUserProfile(uid, { displayName, upiId }) {
  if (!db) {
    throw new Error('Database is not initialized. Firebase credentials required.');
  }

  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const doc = await userRef.get();

  if (!doc.exists) {
    const error = new Error('User profile not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const updateData = {
    updatedAt: new Date().toISOString()
  };

  if (displayName !== undefined) {
    if (!validateDisplayName(displayName)) {
      const error = new Error('Display name must be between 2 and 60 valid characters.');
      error.status = 400;
      error.code = 'INVALID_DISPLAY_NAME';
      throw error;
    }
    updateData.displayName = displayName.trim();
  }

  if (upiId !== undefined) {
    if (!validateUpiId(upiId)) {
      const error = new Error('Invalid UPI ID format. Expected format: username@bank (e.g. rahul@okaxis).');
      error.status = 400;
      error.code = 'INVALID_UPI_ID';
      throw error;
    }
    updateData.upiId = upiId ? upiId.trim() : '';
  }

  await userRef.update(updateData);

  const updatedDoc = await userRef.get();
  return formatSafeProfile(updatedDoc.data());
}
