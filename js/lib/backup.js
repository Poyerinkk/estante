// Backup: exportar tudo para um JSON (capas em data URL) e importar substituindo ou mesclando.

import * as db from "../db.js";
import { today } from "./time.js";

const FORMAT = "estante-backup";
const VERSION = 1;

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

async function dataUrlToBlob(url) {
  return (await fetch(url)).blob();
}

/** Monta o arquivo de backup. */
export async function buildBackup() {
  const [books, shelves, sessions, settings] = await Promise.all([
    db.getAll("books"), db.getAll("shelves"), db.getAll("sessions"), db.getMeta("settings"),
  ]);
  const out = [];
  for (const b of books) {
    out.push({
      ...b,
      cover: b.cover instanceof Blob ? await blobToDataUrl(b.cover) : null,
      spinePhoto: b.spinePhoto instanceof Blob ? await blobToDataUrl(b.spinePhoto) : null,
    });
  }
  const data = {
    format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
    books: out, shelves, sessions, settings: settings || null,
  };
  const name = `estante-backup-${today()}.json`;
  return new File([JSON.stringify(data)], name, { type: "application/json" });
}

/**
 * Exporta: no celular, abre o compartilhamento do sistema (salvar no iCloud, Drive...);
 * sem suporte, baixa o arquivo. Registra a data do último backup.
 */
export async function exportBackup() {
  const file = await buildBackup();
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      shared = true;
    } catch (e) {
      if (e.name === "AbortError") return { ok: false };
    }
  }
  if (!shared) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  await db.write([{ meta: "lastBackupAt", value: new Date().toISOString() }]);
  return { ok: true, name: file.name };
}

/** Lê e valida o arquivo. Devolve { data, summary } ou lança um erro com mensagem para o usuário. */
export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Este arquivo não é um backup da Estante.");
  }
  const ok = data && data.format === FORMAT
    && Array.isArray(data.books) && Array.isArray(data.shelves) && Array.isArray(data.sessions)
    && data.books.every((b) => b && typeof b.id === "string" && typeof b.title === "string")
    && data.shelves.every((s) => s && typeof s.id === "string")
    && data.sessions.every((s) => s && typeof s.id === "string" && typeof s.bookId === "string");
  if (!ok) throw new Error("Este arquivo não é um backup da Estante.");
  if (data.version > VERSION) throw new Error("Este backup veio de uma versão mais nova do app.");
  return { data, summary: { books: data.books.length, sessions: data.sessions.length, shelves: data.shelves.length } };
}

/**
 * Importa. "replace" apaga tudo antes; "merge" junta por id, ficando com o livro mais recente
 * (updatedAt) quando ele existe dos dois lados. Tudo numa transação.
 */
export async function importBackup(data, mode) {
  const books = [];
  for (const b of data.books) {
    const img = async (v) => (typeof v === "string" && v.startsWith("data:") ? dataUrlToBlob(v) : null);
    books.push({ ...b, cover: await img(b.cover), spinePhoto: await img(b.spinePhoto) });
  }
  const ops = [];
  let shelves = data.shelves;
  if (mode === "replace") {
    ops.push({ clear: "books" }, { clear: "shelves" }, { clear: "sessions" }, { meta: "activeSession", value: undefined });
    if (data.settings) ops.push({ meta: "settings", value: data.settings });
  } else {
    const [curBooks, curShelves] = await Promise.all([db.getAll("books"), db.getAll("shelves")]);
    const cur = new Map(curBooks.map((b) => [b.id, b]));
    for (let i = books.length - 1; i >= 0; i--) {
      const old = cur.get(books[i].id);
      if (old && (old.updatedAt || "") >= (books[i].updatedAt || "")) books.splice(i, 1);
    }
    // prateleiras novas entram depois das atuais
    const have = new Set(curShelves.map((s) => s.id));
    const base = curShelves.length;
    shelves = data.shelves.filter((s) => !have.has(s.id)).map((s, i) => ({ ...s, order: base + i }));
  }
  for (const s of shelves) ops.push({ put: "shelves", value: s });
  for (const b of books) ops.push({ put: "books", value: b });
  for (const s of data.sessions) ops.push({ put: "sessions", value: s });
  await db.write(ops);
}

/** Apaga todos os dados do aparelho. */
export function eraseAll() {
  return db.write([{ clear: "books" }, { clear: "shelves" }, { clear: "sessions" }, { clear: "meta" }]);
}
