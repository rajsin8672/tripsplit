/**
 * API client module for TripSplit REST endpoints
 * Automatically attaches Firebase ID Token in Bearer Authorization header
 */

import { getFirebaseAuth, initFirebase } from './firebase-config.js';

let activeAuthUser = null;

export function setApiAuthUser(user) {
  activeAuthUser = user;
}

async function getAuthHeader() {
  let auth = getFirebaseAuth();
  if (!auth) {
    try {
      const fb = await initFirebase();
      auth = fb?.auth;
    } catch {}
  }

  const user = activeAuthUser || auth?.currentUser;

  if (user) {
    try {
      // 1. If accessToken exists synchronously on user object, use it directly
      if (user.accessToken) {
        return { Authorization: `Bearer ${user.accessToken}` };
      }

      // 2. Fetch ID token with a 2-second timeout so it never hangs indefinitely
      if (typeof user.getIdToken === 'function') {
        const tokenPromise = user.getIdToken(false);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Token fetch timed out')), 2000)
        );
        const token = await Promise.race([tokenPromise, timeoutPromise]);
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
      }
    } catch (err) {
      console.warn('[API] ID token fetch fallback:', err.message);
    }

    // 3. Fallback token based on authenticated user UID (supported in local engine)
    if (user.uid) {
      return { Authorization: `Bearer user-token-${user.uid}` };
    }
  }

  return {};
}

async function request(endpoint, options = {}) {
  const authHeaders = await getAuthHeader();

  const config = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers
    }
  };

  if (options.body) {
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  // Abort controller with 8-second timeout so network requests never hang
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);
  config.signal = controller.signal;

  let response;
  try {
    response = await fetch(endpoint, config);
  } catch (networkErr) {
    clearTimeout(timeoutId);
    if (networkErr.name === 'AbortError') {
      const error = new Error('Request timed out. Please check your connection or server.');
      error.code = 'TIMEOUT';
      error.status = 408;
      throw error;
    }
    const error = new Error('Network error. Unable to reach the server. Please check your connection.');
    error.code = 'NETWORK_ERROR';
    error.status = 0;
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data?.error?.code || 'REQUEST_FAILED';
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (url, options) => request(url, { ...options, method: 'GET' }),
  post: (url, body, options) => request(url, { ...options, method: 'POST', body }),
  patch: (url, body, options) => request(url, { ...options, method: 'PATCH', body }),
  delete: (url, options) => request(url, { ...options, method: 'DELETE' })
};
