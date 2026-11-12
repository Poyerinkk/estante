// Estado em memória, eventos e as operações que mexem nos dados.
// Toda operação grava no IndexedDB numa só transação (db.write).

import * as db from "./db.js";
import { today, isoDate } from "./lib/time.js";

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
  active: null,       // meta.activeSession
  ui: { timerBookId: null }, // livro escolhido pela página do livro ("Ler agora")
};

const bus = new EventTarget();
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export async function load() {
  const [books, shelves, sessions, settings, active] = await Promise.all([
    db.getAll("books"), db.getAll("shelves"), db.getAll("sessions"), db.getMeta("settings"),
    db.getMeta("activeSession"),
  ]);
  state.active = active || null;
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

const nowIso = () => new Date().toISOString();

/* ---------- edição de livro ---------- */

/** Atualiza campos do livro; se as páginas mudarem, a lombada muda de largura e rebalance() roda. */
export async function updateBook(book, patch) {
  Object.assign(book, patch, { updatedAt: nowIso() });
  await db.write(dedupe([{ put: "books", value: book }, ...rebalance()]));
  emit("books");
}

/** Página digitada à mão. Guarda quando mudou, para disputar com a sessão mais recente. */
export function setCurrentPage(book, page) {
  return updateBook(book, { currentPage: page, currentPageAt: nowIso() });
}

/** Regras de status da seção 3. */
export function setStatus(book, status) {
  const patch = { status };
  if (status === "lendo") patch.startedOn = book.startedOn || today();
  if (status === "lido") {
    patch.finishedOn = book.finishedOn || today();
    patch.startedOn = book.startedOn || today();
    if (book.totalPages) { patch.currentPage = book.totalPages; patch.currentPageAt = nowIso(); }
  }
  if (status === "quero_ler") patch.finishedOn = "";
  return updateBook(book, patch);
}

/** Remove o livro e as leituras dele, numa transação. */
export async function removeBook(id) {
  const ops = [{ del: "books", key: id }];
  for (const s of state.sessions.filter((x) => x.bookId === id)) ops.push({ del: "sessions", key: s.id });
  state.sessions = state.sessions.filter((x) => x.bookId !== id);
  if (state.active?.bookId === id) { state.active = null; ops.push({ meta: "activeSession", value: undefined }); }
  state.books.delete(id);
  ops.push(...rebalance());
  await db.write(ops);
  emit("active", state.active);
  emit("books");
  emit("sessions");
}

/** Arrastar: põe o livro na prateleira e posição pedidas; rebalance() empurra o excesso. */
export async function moveBook(id, shelfId, index) {
  const book = state.books.get(id);
  const oldShelf = book.shelfId;
  const from = booksOn(oldShelf).filter((b) => b.id !== id);
  const to = shelfId === oldShelf ? from : booksOn(shelfId).filter((b) => b.id !== id);
  to.splice(Math.max(0, Math.min(index, to.length)), 0, book);
  const ops = [];
  const renumber = (row, sid) => row.forEach((b, i) => {
    if (b.shelfId !== sid || b.position !== i) { b.shelfId = sid; b.position = i; ops.push({ put: "books", value: b }); }
  });
  if (shelfId !== oldShelf) renumber(from, oldShelf);
  renumber(to, shelfId);
  ops.push(...rebalance());
  await db.write(dedupe(ops));
  emit("books");
}

/* ---------- prateleiras ---------- */

export async function addShelf() {
  const s = { id: crypto.randomUUID(), name: nextShelfName(), order: state.shelves.length, auto: false };
  state.shelves.push(s);
  await db.write([{ put: "shelves", value: s }]);
  emit("books");
  return s;
}

/** Renomear tira o "auto": a prateleira deixa de sumir sozinha quando esvazia. */
export async function renameShelf(id, name) {
  const s = state.shelves.find((x) => x.id === id);
  Object.assign(s, { name, auto: false });
  await db.write([{ put: "shelves", value: s }]);
  emit("books");
}

/** Apaga a prateleira; os livros vão para o fim da anterior (ou da seguinte, se for a primeira). */
export async function deleteShelf(id) {
  if (state.shelves.length < 2) return;
  const i = state.shelves.findIndex((x) => x.id === id);
  const target = state.shelves[i > 0 ? i - 1 : 1];
  const ops = [{ del: "shelves", key: id }];
  let pos = booksOn(target.id).length;
  for (const b of booksOn(id)) {
    b.shelfId = target.id;
    b.position = pos++;
    ops.push({ put: "books", value: b });
  }
  state.shelves.splice(i, 1);
  ops.push(...rebalance());
  await db.write(dedupe(ops));
  emit("books");
}

/* ---------- sessões de leitura ---------- */

async function saveActive(a) {
  state.active = a;
  await db.write([{ meta: "activeSession", value: a ?? undefined }]);
  emit("active", a);
}

/** Tempo decorrido calculado do relógio, nunca contado: continua certo com a tela apagada. */
export function elapsedMs(a = state.active, at = Date.now()) {
  if (!a) return 0;
  const end = a.pausedAtMs ?? at;
  return Math.max(0, end - a.startedAtMs - a.pausedTotalMs);
}

export function startSession(bookId, startPage) {
  return saveActive({ bookId, startPage, startedAtMs: Date.now(), pausedAtMs: null, pausedTotalMs: 0 });
}

export function pauseSession() {
  const a = state.active;
  if (!a || a.pausedAtMs != null) return;
  return saveActive({ ...a, pausedAtMs: Date.now() });
}

export function resumeSession() {
  const a = state.active;
  if (!a || a.pausedAtMs == null) return;
  return saveActive({ ...a, pausedTotalMs: a.pausedTotalMs + (Date.now() - a.pausedAtMs), pausedAtMs: null });
}

/** Corrige a duração (sessão esquecida aberta): fica pausada com o tempo informado. */
export function setActiveDuration(ms) {
  const now = Date.now();
  const a = state.active;
  return saveActive({ ...a, pausedAtMs: now, pausedTotalMs: Math.max(0, now - a.startedAtMs - ms) });
}

export const cancelSession = () => saveActive(null);

/**
 * currentPage = endPage da sessão mais recente por endedAt,
 * a menos que o usuário tenha digitado a página depois dela (o último que mudou vence).
 */
function recalcPage(book) {
  const last = state.sessions
    .filter((s) => s.bookId === book.id)
    .sort((a, b) => a.endedAt.localeCompare(b.endedAt))
    .at(-1);
  if (last && !(book.currentPageAt && book.currentPageAt > last.endedAt)) book.currentPage = last.endPage;
}

function sessionRecord({ bookId, startedAt, endedAt, durationSec, startPage, endPage, source }) {
  return {
    id: crypto.randomUUID(),
    bookId,
    date: isoDate(new Date(startedAt)),
    startedAt, endedAt,
    durationSec: Math.round(durationSec),
    startPage, endPage,
    pagesRead: Math.max(0, endPage - startPage),
    source,
  };
}

/** Grava a sessão, atualiza o livro e encerra a sessão ativa, tudo numa transação. */
async function commitSession(session, { markRead = false, clearActive = false } = {}) {
  const book = state.books.get(session.bookId);
  state.sessions.push(session);
  if (book.status === "quero_ler") { book.status = "lendo"; book.startedOn ||= today(); }
  recalcPage(book);
  if (markRead) {
    book.status = "lido";
    book.finishedOn = today();
    if (book.totalPages) book.currentPage = book.totalPages;
  }
  book.updatedAt = nowIso();
  const ops = [{ put: "sessions", value: session }, { put: "books", value: book }];
  if (clearActive) { state.active = null; ops.push({ meta: "activeSession", value: undefined }); }
  await db.write(ops);
  if (clearActive) emit("active", null);
  emit("sessions");
  emit("books");
  return session;
}

export function finishSession(endPage, { markRead = false } = {}) {
  const a = state.active;
  const endedAtMs = a.pausedAtMs ?? Date.now();
  return commitSession(sessionRecord({
    bookId: a.bookId,
    startedAt: new Date(a.startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    durationSec: elapsedMs(a) / 1000,
    startPage: a.startPage,
    endPage,
    source: "timer",
  }), { markRead, clearActive: true });
}

/** Leitura feita sem o app. Hoje: termina agora. Outro dia: ao meio-dia daquele dia. */
function manualTimes(date, minutes) {
  let end = new Date();
  if (date !== today()) {
    const [y, m, d] = date.split("-").map(Number);
    end = new Date(y, m - 1, d, 12);
  }
  const start = new Date(end.getTime() - (minutes || 0) * 60000);
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

export function addManualSession({ bookId, date, startPage, endPage, minutes, markRead = false }) {
  const s = sessionRecord({
    bookId, ...manualTimes(date, minutes), durationSec: (minutes || 0) * 60, startPage, endPage, source: "manual",
  });
  s.date = date;
  return commitSession(s, { markRead });
}

export async function updateSession(id, { date, startPage, endPage, minutes }) {
  const s = state.sessions.find((x) => x.id === id);
  if (date !== s.date) Object.assign(s, manualTimes(date, minutes), { date });
  else s.startedAt = new Date(new Date(s.endedAt).getTime() - minutes * 60000).toISOString();
  Object.assign(s, {
    startPage, endPage, durationSec: Math.round(minutes * 60), pagesRead: Math.max(0, endPage - startPage),
  });
  const book = state.books.get(s.bookId);
  recalcPage(book);
  await db.write([{ put: "sessions", value: s }, { put: "books", value: book }]);
  emit("sessions");
  emit("books");
}

export async function deleteSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  state.sessions = state.sessions.filter((x) => x.id !== id);
  const book = state.books.get(s.bookId);
  if (state.sessions.some((x) => x.bookId === book.id)) recalcPage(book);
  else if (!book.currentPageAt) book.currentPage = 0;
  await db.write([{ del: "sessions", key: id }, { put: "books", value: book }]);
  emit("sessions");
  emit("books");
}

export const sessionsOf = (bookId) =>
  state.sessions.filter((s) => s.bookId === bookId).sort((a, b) => b.endedAt.localeCompare(a.endedAt));

/** Último livro lido (sessão mais recente), senão o primeiro "lendo". */
export function lastReadBookId() {
  const last = [...state.sessions].sort((a, b) => a.endedAt.localeCompare(b.endedAt)).at(-1);
  if (last && state.books.has(last.bookId)) return last.bookId;
  return [...state.books.values()].find((b) => b.status === "lendo")?.id || null;
}
