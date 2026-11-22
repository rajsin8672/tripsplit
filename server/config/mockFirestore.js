/**
 * High-fidelity in-memory Firestore & Auth mock engine
 * Used during automated testing and offline development when real Firebase cloud credentials are not active.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MemoryDocumentSnapshot {
  constructor(id, data, exists = true) {
    this.id = id;
    this._data = data ? JSON.parse(JSON.stringify(data)) : null;
    this.exists = exists;
  }

  data() {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class MemoryQuerySnapshot {
  constructor(docs = []) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class MemoryQuery {
  constructor(collectionName, store, filters = [], sortField = null, sortDir = 'asc', limitCount = null) {
    this.collectionName = collectionName;
    this.store = store;
    this.filters = [...filters];
    this.sortField = sortField;
    this.sortDir = sortDir;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new MemoryQuery(
      this.collectionName,
      this.store,
      [...this.filters, { field, op, value }],
      this.sortField,
      this.sortDir,
      this.limitCount
    );
  }

  orderBy(field, dir = 'asc') {
    return new MemoryQuery(
      this.collectionName,
      this.store,
      this.filters,
      field,
      dir,
      this.limitCount
    );
  }

  limit(count) {
    return new MemoryQuery(
      this.collectionName,
      this.store,
      this.filters,
      this.sortField,
      this.sortDir,
      count
    );
  }

  async get() {
    const collMap = this.store[this.collectionName] || new Map();
    let results = [];

    for (const [id, docData] of collMap.entries()) {
      let matches = true;

      for (const filter of this.filters) {
        const val = docData[filter.field];
        if (filter.op === '==') {
          if (val !== filter.value) matches = false;
        } else if (filter.op === '!=') {
          if (val === filter.value) matches = false;
        } else if (filter.op === 'in') {
          if (!Array.isArray(filter.value) || !filter.value.includes(val)) matches = false;
        } else if (filter.op === 'array-contains') {
          if (!Array.isArray(val) || !val.includes(filter.value)) matches = false;
        } else if (filter.op === '>') {
          if (!(val > filter.value)) matches = false;
        } else if (filter.op === '>=') {
          if (!(val >= filter.value)) matches = false;
        } else if (filter.op === '<') {
          if (!(val < filter.value)) matches = false;
        } else if (filter.op === '<=') {
          if (!(val <= filter.value)) matches = false;
        }
        if (!matches) break;
      }

      if (matches) {
        results.push(new MemoryDocumentSnapshot(id, docData, true));
      }
    }

    if (this.sortField) {
      results.sort((a, b) => {
        const aVal = a.data()[this.sortField];
        const bVal = b.data()[this.sortField];
        if (aVal < bVal) return this.sortDir === 'desc' ? 1 : -1;
        if (aVal > bVal) return this.sortDir === 'desc' ? -1 : 1;
        return 0;
      });
    }

    if (this.limitCount && this.limitCount > 0) {
      results = results.slice(0, this.limitCount);
    }

    return new MemoryQuerySnapshot(results);
  }
}

class MemoryDocumentReference {
  constructor(collectionName, id, store, onMutate = null) {
    this.collectionName = collectionName;
    this.id = id || crypto.randomUUID();
    this.store = store;
    this.onMutate = onMutate;
  }

  async get() {
    const collMap = this.store[this.collectionName];
    if (!collMap || !collMap.has(this.id)) {
      return new MemoryDocumentSnapshot(this.id, null, false);
    }
    return new MemoryDocumentSnapshot(this.id, collMap.get(this.id), true);
  }

  async set(data, options = {}) {
    if (!this.store[this.collectionName]) {
      this.store[this.collectionName] = new Map();
    }
    const collMap = this.store[this.collectionName];

    if (options.merge && collMap.has(this.id)) {
      const existing = collMap.get(this.id);
      collMap.set(this.id, { ...existing, ...data });
    } else {
      collMap.set(this.id, JSON.parse(JSON.stringify(data)));
    }
    if (this.onMutate) this.onMutate();
    return true;
  }

  async update(data) {
    const collMap = this.store[this.collectionName];
    if (!collMap || !collMap.has(this.id)) {
      const err = new Error(`No document to update: ${this.collectionName}/${this.id}`);
      err.code = 5;
      throw err;
    }
    const existing = collMap.get(this.id);
    collMap.set(this.id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    if (this.onMutate) this.onMutate();
    return true;
  }

  async delete() {
    const collMap = this.store[this.collectionName];
    if (collMap && collMap.has(this.id)) {
      collMap.delete(this.id);
    }
    if (this.onMutate) this.onMutate();
    return true;
  }
}

class MemoryBatch {
  constructor(store, onMutate = null) {
    this.store = store;
    this.onMutate = onMutate;
    this.operations = [];
  }

  set(docRef, data, options = {}) {
    this.operations.push({ type: 'set', docRef, data, options });
    return this;
  }

  update(docRef, data) {
    this.operations.push({ type: 'update', docRef, data });
    return this;
  }

  delete(docRef) {
    this.operations.push({ type: 'delete', docRef });
    return this;
  }

  async commit() {
    for (const op of this.operations) {
      if (op.type === 'set') {
        await op.docRef.set(op.data, op.options);
      } else if (op.type === 'update') {
        await op.docRef.update(op.data);
      } else if (op.type === 'delete') {
        await op.docRef.delete();
      }
    }
    if (this.onMutate) this.onMutate();
    return true;
  }
}

export class MemoryFirestore {
  constructor(persistPath = null) {
    this.store = {};
    this.persistPath = persistPath;
    if (this.persistPath) {
      this.loadFromFile();
    }
  }

  loadFromFile() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const raw = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [coll, docs] of Object.entries(parsed)) {
          this.store[coll] = new Map(Object.entries(docs));
        }
      } else {
        // Fallback to default seed if persistence file does not exist yet (e.g. on clean container redeploy)
        const seedPath = path.resolve(__dirname, '../data/default-seed.json');
        if (fs.existsSync(seedPath)) {
          const raw = fs.readFileSync(seedPath, 'utf8');
          const parsed = JSON.parse(raw);
          for (const [coll, docs] of Object.entries(parsed)) {
            this.store[coll] = new Map(Object.entries(docs));
          }
          this.saveToFile();
          console.log('[MemoryFirestore] Initialized store from default-seed.json');
        }
      }
    } catch (e) {
      console.warn('[MemoryFirestore] Could not load persisted file:', e.message);
    }
  }

  saveToFile() {
    if (!this.persistPath) return;
    try {
      const dump = {};
      for (const [coll, map] of Object.entries(this.store)) {
        if (map instanceof Map) {
          dump[coll] = Object.fromEntries(map.entries());
        }
      }
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.persistPath, JSON.stringify(dump, null, 2), 'utf8');
    } catch (e) {
      console.warn('[MemoryFirestore] Could not save persisted file:', e.message);
    }
  }

  reset() {
    this.store = {};
    this.saveToFile();
  }

  collection(name) {
    const query = new MemoryQuery(name, this.store);
    const onMutate = () => this.saveToFile();
    return {
      doc: (id) => new MemoryDocumentReference(name, id || crypto.randomUUID(), this.store, onMutate),
      where: (f, o, v) => query.where(f, o, v),
      orderBy: (f, d) => query.orderBy(f, d),
      limit: (n) => query.limit(n),
      get: () => query.get(),
      add: async (data) => {
        const id = crypto.randomUUID();
        const docRef = new MemoryDocumentReference(name, id, this.store, onMutate);
        await docRef.set(data);
        return docRef;
      }
    };
  }

  batch() {
    return new MemoryBatch(this.store, () => this.saveToFile());
  }

  async runTransaction(updateFunction) {
    const onMutate = () => this.saveToFile();
    const transaction = {
      get: async (docRef) => await docRef.get(),
      set: (docRef, data, options) => {
        docRef.set(data, options);
        return transaction;
      },
      update: (docRef, data) => {
        docRef.update(data);
        return transaction;
      },
      delete: (docRef) => {
        docRef.delete();
        return transaction;
      }
    };
    const res = await updateFunction(transaction);
    onMutate();
    return res;
  }
}

export class MemoryAuth {
  constructor() {
    this.testUsers = new Map();
  }

  setTestUser(uid, userData) {
    this.testUsers.set(uid, userData);
  }

  async verifyIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      const err = new Error('Decoding Firebase ID token failed');
      err.code = 'auth/invalid-id-token';
      throw err;
    }

    // Pattern: mock-token-<uid>, test-token-<uid>, user-token-<uid>, dev-token-<uid>
    if (/^(mock|test|user|dev)-token-/.test(idToken)) {
      const uid = idToken.replace(/^(mock|test|user|dev)-token-/, '');
      const user = this.testUsers.get(uid) || {
        uid,
        email: `${uid.toLowerCase()}@tripsplit.local`,
        email_verified: true,
        name: uid.charAt(0).toUpperCase() + uid.slice(1)
      };
      return {
        uid: user.uid,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name
      };
    }

    // Standard Firebase JWT ID token: header.payload.signature
    const parts = idToken.split('.');
    if (parts.length === 3) {
      try {
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const payloadJson = Buffer.from(base64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        const uid = payload.user_id || payload.sub;
        if (uid) {
          return {
            uid,
            email: payload.email || '',
            email_verified: Boolean(payload.email_verified),
            name: payload.name || payload.displayName || ''
          };
        }
      } catch (decodeErr) {
        console.warn('[MemoryAuth] JWT decode fallback:', decodeErr.message);
      }
    }

    // Reject unknown/malformed tokens
    const err = new Error('Firebase ID token is invalid or expired.');
    err.code = 'auth/invalid-id-token';
    throw err;
  }
}
