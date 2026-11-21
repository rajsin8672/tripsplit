import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { MemoryFirestore, MemoryAuth } from './mockFirestore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let auth = null;
let isConfigured = false;
let configError = null;
let isMock = false;

try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const hasRealAdminCredentials = Boolean(
    projectId &&
    projectId !== 'your-firebase-project-id' &&
    clientEmail &&
    clientEmail.includes('@') &&
    !clientEmail.includes('xxxxx') &&
    privateKey &&
    privateKey.includes('BEGIN PRIVATE KEY') &&
    !privateKey.includes('...')
  );

  if (process.env.NODE_ENV === 'test' || process.env.USE_MOCK_FIREBASE === 'true') {
    // Isolated in-memory engine for unit and integration testing
    db = new MemoryFirestore();
    auth = new MemoryAuth();
    isConfigured = true;
    isMock = true;
  } else if (hasRealAdminCredentials) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
    }
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
    isMock = false;
    console.log(`[TripSplit] Firebase Admin SDK active for project: ${projectId}`);
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
    }
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
    isMock = false;
    console.log('[TripSplit] Firebase Admin SDK initialized with GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    // Seamless Local Development Engine Fallback
    // Enables immediate, fully functional local use even before service account JSON is downloaded.
    const localDbPath = path.resolve(__dirname, '../../.data/local-firestore.json');
    db = new MemoryFirestore(localDbPath);
    auth = new MemoryAuth();
    isConfigured = true;
    isMock = true;
    configError = null;
    console.log('[TripSplit] Running in Local Development Engine mode (.data/local-firestore.json).');
    console.log('[TripSplit] Real Firebase client logins and tokens are accepted, and data persists locally.');
    console.log('[TripSplit] (To enable live Cloud Firestore sync across multiple servers, supply FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env)');
  }
} catch (err) {
  console.warn('[FirebaseAdmin] Initialization warning, activating local development fallback:', err.message);
  const localDbPath = path.resolve(__dirname, '../../.data/local-firestore.json');
  db = new MemoryFirestore(localDbPath);
  auth = new MemoryAuth();
  isConfigured = true;
  isMock = true;
}

export { admin, db, auth, isConfigured, configError, isMock };
