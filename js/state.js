// Estado em memória, eventos e as operações que mexem nos dados.
// Toda operação grava no IndexedDB numa só transação (db.write).

import * as db from "./db.js";
import { today } from "./lib/time.js";

export const DEFAULT_PUBLISHERS = [
  "Editora 34", "Penguin-Companhia", "Martin Claret", "Edipro", "Vozes", "Companhia das Letras",
];

const DEFAULT_SETTINGS = {
  theme: "auto",
  priorityPublishers: DEFAULT_PUBLISHERS,
  showPace: true,
  keepAwake: false,
  googleBooksKey: "",
};

export const state = {
  books: new Map(),
  shelves: [],
  sessions: [],
  settings: { ...DEFAULT_SETTINGS },
};

const bus = new EventTarget();
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export async function load() {
  const [books, shelves, sessions, settings] = await Promise.all([
    db.getAll("books"), db.getAll("shelves"), db.getAll("sessions"), db.getMeta("settings"),
  ]);
  state.books = new Map(books.map((b) => [b.id, b]));
  state.shelves = shelves.sort((a, b) => a.order - b.order);
  state.sessions = sessions;
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  if (!state.shelves.length) {
    const s = { id: crypto.randomUUID(), name: "Prateleira 1", order: 0, auto: false };
    state.shelves.push(s);
    await db.write([{ put: "shelves", value: s }]);
  }
}

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.write([{ meta: "settings", value: state.settings }]);
  emit("settings", state.settings);
}

/* ---------- geometria da estante ---------- */

export const SPINE_GAP = 2;

/** largura_px = clamp(16, 10 + páginas / 12, 44); sem páginas, 26 */
export function spineWidth(book) {
  if (!book.totalPages) return 26;
  return Math.round(Math.min(44, Math.max(16, 10 + book.totalPages / 12)));
}

/** largura útil da prateleira: a coluna do app menos 16 px de cada lado */
export function usableWidth() {
  const main = document.querySelector(".main");
  const w = main?.clientWidth || Math.min(window.innerWidth, 480);
  return w - 32;
}

const rowWidth = (books) =>
  books.reduce((sum, b) => sum + spineWidth(b), 0) + Math.max(0, books.length - 1) * SPINE_GAP;

export function booksOn(shelfId) {
  return [...state.books.values()]
    .filter((b) => b.shelfId === shelfId)
    .sort((a, b) => a.position - b.position);
}

export function fits(shelfId, book) {
  return rowWidth([...booksOn(shelfId), book]) <= usableWidth();
}

function nextShelfName() {
  const used = new Set(state.shelves.map((s) => s.name));
  let n = state.shelves.length + 1;
  while (used.has(`Prateleira ${n}`)) n++;
  return `Prateleira ${n}`;
}

/**
 * Seção 6.3: cada prateleira cheia empurra o último livro para o início da seguinte,
 * criando prateleiras automáticas quando falta; prateleira automática vazia sai.
 * Atualiza a memória e devolve as gravações para o chamador juntar na mesma transação.
 */
export function rebalance() {
  const ops = [];
  const W = usableWidth();
  const shelves = [...state.shelves];
  const rows = shelves.map((s) => booksOn(s.id));

  for (let i = 0; i < rows.length; i++) {
    while (rows[i].length > 1 && rowWidth(rows[i]) > W) {
      if (i === rows.length - 1) {
        const s = { id: crypto.randomUUID(), name: nextShelfName(), order: shelves.length, auto: true };
        shelves.push(s);
        state.shelves.push(s);
        rows.push([]);
        ops.push({ put: "shelves", value: s });
      }
      rows[i + 1].unshift(rows[i].pop());
    }
  }

  const keep = [];
  shelves.forEach((s, i) => {
    if (s.auto && !rows[i].length && shelves.length > 1) ops.push({ del: "shelves", key: s.id });
    else keep.push([s, rows[i]]);
  });

  state.shelves = keep.map(([s], order) => {
    if (s.order !== order) { s.order = order; ops.push({ put: "shelves", value: s }); }
    return s;
  });
  for (const [s, row] of keep) {
    row.forEach((b, position) => {
      if (b.shelfId !== s.id || b.position !== position) {
        b.shelfId = s.id;
        b.position = position;
        ops.push({ put: "books", value: b });
      }
    });
  }
  return ops;
}

/* ---------- livros ---------- */

export function newBook(fields = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "", author: "", publisher: "", edition: "", year: null,
    isbn13: "", isbn10: "", totalPages: null,
    cover: null, coverRemoteUrl: "", spineColor: "",
    status: "quero_ler", currentPage: 0, startedOn: "", finishedOn: "",
    rating: 0, difficulty: null, notes: "",
    shelfId: null, position: 0,
    createdAt: now, updatedAt: now,
    ...fields,
  };
}

/** Novo livro entra no fim da prateleira escolhida; rebalance() roda em seguida. */
export async function addBook(book) {
  if (book.status === "lendo" && !book.startedOn) book.startedOn = today();
  if (book.status === "lido") {
    book.finishedOn ||= today();
    if (book.totalPages) book.currentPage = book.totalPages;
  }
  const shelfId = book.shelfId && state.shelves.some((s) => s.id === book.shelfId)
    ? book.shelfId : firstShelfWithRoom(book);
  book.shelfId = shelfId;
  book.position = booksOn(shelfId).length;
  state.books.set(book.id, book);
  const ops = [{ put: "books", value: book }, ...rebalance()];
  await db.write(dedupe(ops));
  emit("books");
  return book;
}

export function firstShelfWithRoom(book) {
  return (state.shelves.find((s) => fits(s.id, book)) || state.shelves.at(-1)).id;
}

// rebalance() pode gravar o mesmo livro que acabou de entrar; fica só a última versão
function dedupe(ops) {
  const seen = new Map();
  for (const o of ops) seen.set(`${o.put || o.del}:${o.key || o.value?.id}`, o);
  return [...seen.values()];
}
