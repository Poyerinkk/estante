// IndexedDB sem biblioteca. Banco "estante", versão 1.
// Leituras: get / getAll / getMeta. Gravações: write(), sempre numa só transação.

const NAME = "estante";
const VERSION = 1;
export const STORES = ["books", "shelves", "sessions", "meta"];

let opening;

export function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const books = db.createObjectStore("books", { keyPath: "id" });
      books.createIndex("shelfId", "shelfId");
      books.createIndex("status", "status");
      db.createObjectStore("shelves", { keyPath: "id" });
      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("bookId", "bookId");
      sessions.createIndex("date", "date");
      db.createObjectStore("meta"); // chave e valor, chave fora da linha
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return opening;
}

const done = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export async function get(store, key) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await open();
  return done(db.transaction(store).objectStore(store).getAll());
}

export const getMeta = (key) => get("meta", key);

/**
 * Aplica várias gravações numa só transação.
 * ops: [{ put: "books", value }, { del: "sessions", key }, { meta: "settings", value }, { clear: "books" }]
 * Um { meta, value: undefined } apaga a chave.
 */
export async function write(ops) {
  if (!ops.length) return;
  const db = await open();
  const names = [...new Set(ops.map((o) => o.put || o.del || o.clear || (o.meta && "meta")))];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, "readwrite");
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Transação abortada"));
    for (const o of ops) {
      if (o.put) t.objectStore(o.put).put(o.value);
      else if (o.del) t.objectStore(o.del).delete(o.key);
      else if (o.clear) t.objectStore(o.clear).clear();
      else if (o.meta) {
        const s = t.objectStore("meta");
        o.value === undefined ? s.delete(o.meta) : s.put(o.value, o.meta);
      }
    }
  });
}
