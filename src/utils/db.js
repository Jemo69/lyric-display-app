import { openDB } from 'idb';

const DB_NAME = 'BibleDatabase';
const STORE_NAME = 'bibles';
const DB_VERSION = 1;

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export const bibleDb = {
  async get(id) {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  },
  async set(id, val) {
    const db = await getDB();
    return db.put(STORE_NAME, val, id);
  },
  async delete(id) {
    const db = await getDB();
    return db.delete(STORE_NAME, id);
  },
  async clear() {
    const db = await getDB();
    return db.clear(STORE_NAME);
  },
  async keys() {
    const db = await getDB();
    return db.getAllKeys(STORE_NAME);
  },
};
