/**
 * One-click migration utility: copies local seed/mock data into live Cloud Firestore
 * Run: node scripts/migrateLocalToFirestore.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, isMock, admin } from '../server/config/firebaseAdmin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('====================================================');
  console.log(' TripSplit -> Cloud Firestore Migration Utility');
  console.log('====================================================');

  if (isMock) {
    console.error('\n[ERROR] Real Cloud Firestore is not connected yet!');
    console.error('Please configure your Firebase Service Account credentials in .env or serviceAccountKey.json first.');
    console.error('Steps:');
    console.error('1. Go to Firebase Console -> Project Settings -> Service accounts');
    console.error('2. Click "Generate new private key"');
    console.error('3. Place the downloaded file as serviceAccountKey.json in the project root');
    console.error('4. Re-run: node scripts/migrateLocalToFirestore.js\n');
    process.exit(1);
  }

  // Look for seed file or local-firestore file
  const candidates = [
    path.resolve(__dirname, '../.data/local-firestore.json'),
    path.resolve(__dirname, '../server/data/default-seed.json')
  ];

  let sourcePath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      sourcePath = p;
      break;
    }
  }

  if (!sourcePath) {
    console.error('[ERROR] No local data source found to migrate.');
    process.exit(1);
  }

  console.log(`Reading source data from: ${sourcePath}`);
  const rawData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

  const collections = ['users', 'trips', 'trip_members', 'expenses', 'expense_splits', 'settlements', 'payments', 'invitations'];

  let totalMigrated = 0;

  for (const collName of collections) {
    const docs = rawData[collName] || {};
    const docIds = Object.keys(docs);
    if (docIds.length === 0) continue;

    console.log(`\nMigrating collection: "${collName}" (${docIds.length} records)...`);
    const batch = db.batch();
    let batchCount = 0;

    for (const docId of docIds) {
      const data = docs[docId];
      const docRef = db.collection(collName).doc(docId);
      batch.set(docRef, data, { merge: true });
      batchCount++;
      totalMigrated++;
    }

    await batch.commit();
    console.log(`  -> Successfully migrated ${batchCount} documents to "${collName}".`);
  }

  console.log('\n====================================================');
  console.log(` Migration complete! Total ${totalMigrated} documents uploaded to Cloud Firestore.`);
  console.log(' Your trips and data are now stored permanently in Google Cloud.');
  console.log('====================================================\n');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('\nMigration failed with error:', err);
  process.exit(1);
});
