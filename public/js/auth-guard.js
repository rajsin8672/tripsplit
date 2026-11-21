/**
 * Auth guard module for route protection
 */

import { initFirebase } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { setApiAuthUser } from './api.js';

/**
 * Protects pages that require authentication (Dashboard, Profile)
 */
export async function requireAuth(onAuthenticated) {
  const { auth, isConfigured } = await initFirebase();

  if (!isConfigured || !auth) {
    // If Firebase is not configured, redirect to login with query flag
    const currentPath = window.location.pathname;
    window.location.replace(`/login.html?redirect=${encodeURIComponent(currentPath)}&config=missing`);
    return;
  }

  // Safety timer: ensure body opacity is restored within 2 seconds
  const opacityTimer = setTimeout(() => {
    document.body.style.opacity = '1';
  }, 2000);

  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 150ms ease-in';

  let hasAuthenticated = false;

  const triggerAuth = (user) => {
    clearTimeout(opacityTimer);
    document.body.style.opacity = '1';
    setApiAuthUser(user);
    if (!hasAuthenticated && typeof onAuthenticated === 'function') {
      hasAuthenticated = true;
      onAuthenticated(user);
    }
  };

  // If currentUser is already available synchronously, invoke immediately
  if (auth.currentUser) {
    triggerAuth(auth.currentUser);
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      clearTimeout(opacityTimer);
      const currentPath = window.location.pathname;
      window.location.replace(`/login.html?redirect=${encodeURIComponent(currentPath)}`);
    } else {
      triggerAuth(user);
    }
  });
}

/**
 * Redirects authenticated users away from Login and Register pages
 */
export async function redirectIfAuth() {
  const { auth, isConfigured } = await initFirebase();
  if (!isConfigured || !auth) return;

  if (auth.currentUser) {
    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get('redirect') || '/dashboard.html';
    const safeRedirect = redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') ? redirectUrl : '/dashboard.html';
    window.location.replace(safeRedirect);
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get('redirect') || '/dashboard.html';
      const safeRedirect = redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') ? redirectUrl : '/dashboard.html';
      window.location.replace(safeRedirect);
    }
  });
}
