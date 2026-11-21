/**
 * Firebase Authentication service module
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

import { initFirebase } from './firebase-config.js';
import { api, setApiAuthUser } from './api.js';

/**
 * Translate Firebase error codes into friendly user messages
 */
export function getFriendlyAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/missing-email':
      return 'Please enter your email address.';
    case 'auth/weak-password':
      return 'Password should be at least 8 characters long.';
    case 'auth/user-not-found':
      return 'No account was found with this email. If you are new, please click "Create an account" below to register first.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please verify your password or use "Forgot password?" to reset it.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. If you have not created an account yet, please click "Create an account" below to register first.';
    case 'auth/too-many-requests':
      return 'Access temporarily blocked due to many failed attempts. Please try again later or reset your password.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection and verify the server is running.';
    case 'auth/unauthorized-domain':
      return 'Domain not authorized: Please add this domain to Authorized Domains in your Firebase Console (Authentication > Settings > Authorized Domains).';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is disabled in Firebase Console. Please enable Email/Password under Authentication > Sign-in method.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    default:
      return 'Authentication failed. Please verify your credentials or register a new account.';
  }
}

/**
 * Register user with Email and Password
 */
export async function registerUser(displayName, email, password) {
  const { auth, isConfigured, error } = await initFirebase();
  if (!isConfigured) {
    throw new Error(error || 'Firebase is not configured.');
  }

  // 1. Create Firebase Auth user
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  setApiAuthUser(user);

  // 2. Set Firebase Auth display name
  try {
    await updateProfile(user, { displayName });
    if (typeof user.getIdToken === 'function') {
      await user.getIdToken(true);
    }
  } catch (err) {
    console.warn('[Auth] Failed to update Auth profile displayName:', err);
  }

  // 3. Synchronize with backend API & Firestore
  const syncResult = await api.post('/api/auth/sync', { displayName });
  return syncResult?.data;
}

/**
 * Sign in user with Email and Password
 */
export async function loginUser(email, password) {
  const { auth, isConfigured, error } = await initFirebase();
  if (!isConfigured) {
    throw new Error(error || 'Firebase is not configured.');
  }

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  setApiAuthUser(user);

  // Sync with backend to ensure profile exists
  try {
    const syncResult = await api.post('/api/auth/sync', { displayName: user.displayName || '' });
    return syncResult?.data;
  } catch (syncErr) {
    console.warn('[Auth] Sync warning upon login:', syncErr);
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  setApiAuthUser(null);
  const { auth } = await initFirebase();
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  const { auth, isConfigured, error } = await initFirebase();
  if (!isConfigured) {
    throw new Error(error || 'Firebase is not configured.');
  }

  await sendPasswordResetEmail(auth, email);
}

/**
 * Subscribe to authentication state changes
 */
export async function onAuthChange(callback) {
  const { auth, isConfigured } = await initFirebase();
  if (!isConfigured || !auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
