/**
 * Frontend Firebase Configuration Module (ES Module)
 * Dynamically loads public web configuration from /api/config/firebase or window.__TRIPSPLIT_FIREBASE_CONFIG__
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

let appInstance = null;
let authInstance = null;
let isConfigured = false;
let configError = null;
let initPromise = null;

export function initFirebase() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    if (authInstance) {
      return { app: appInstance, auth: authInstance, isConfigured: true };
    }

    try {
      let config = window.__TRIPSPLIT_FIREBASE_CONFIG__;

      // Check persistent client storage for cached configuration
      if (!config || !config.apiKey) {
        try {
          const cached = sessionStorage.getItem('__tripsplit_fb_cfg__') || localStorage.getItem('__tripsplit_fb_cfg__');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.apiKey && parsed.projectId) {
              config = parsed;
            }
          }
        } catch (_) {}
      }

      if (!config || !config.apiKey) {
        // Fetch public web configuration from server with 5s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch('/api/config/firebase', { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
            const payload = await response.json();
            if (payload?.success && payload?.data?.isConfigured) {
              config = payload.data.config;
              try {
                sessionStorage.setItem('__tripsplit_fb_cfg__', JSON.stringify(config));
                localStorage.setItem('__tripsplit_fb_cfg__', JSON.stringify(config));
              } catch (_) {}
            }
          }
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          console.warn('[Firebase] Config fetch warning:', fetchErr.message);
        }
      }

      if (!config || !config.apiKey || !config.projectId) {
        isConfigured = false;
        configError = 'Firebase web configuration is missing. Please set FIREBASE_API_KEY and FIREBASE_PROJECT_ID in your .env or server environment.';
        return { app: null, auth: null, isConfigured: false, error: configError };
      }

      // Initialize Firebase app once
      appInstance = getApps().length > 0 ? getApp() : initializeApp(config);
      authInstance = getAuth(appInstance);

      // Enforce local session persistence across tabs and page refreshes (with timeout safety)
      try {
        const persistPromise = setPersistence(authInstance, browserLocalPersistence);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Persistence timeout')), 1500)
        );
        await Promise.race([persistPromise, timeoutPromise]);
      } catch (pErr) {
        console.warn('[Firebase] Persistence note:', pErr.message);
      }

      isConfigured = true;
      return { app: appInstance, auth: authInstance, isConfigured: true };
    } catch (err) {
      isConfigured = false;
      configError = `Failed to initialize Firebase: ${err.message}`;
      console.error('[Firebase Web Error]', configError);
      return { app: null, auth: null, isConfigured: false, error: configError };
    }
  })();

  return initPromise;
}

export function getFirebaseAuth() {
  return authInstance;
}

export function getFirebaseStatus() {
  return { isConfigured, configError };
}
