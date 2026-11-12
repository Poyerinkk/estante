// Busca de livros: Google Books e Open Library. Nada de Amazon (ver NOTAS.md).
// Tudo normalizado para { title, author, publisher, year, isbn13, isbn10, totalPages, coverUrl, lang }.

import { parse as parseIsbn, clean } from "./isbn.js";

/* ---------- editoras ---------- */

/** minúsculas, sem acento, só letras e números separados por espaço */
export const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, " ").trim();

// palavras de forma social que não mudam a identidade da editora
const NOISE = new Set(["editora", "ed", "ltda", "ltd", "sa", "s", "a", "eireli", "me", "livros", "grupo", "edicoes"]);
const canon = (s) => norm(s).split(" ").filter((w) => !NOISE.has(w)).join(" ");

// variações conhecidas de cada editora (já em forma canônica). Comparação sempre por nome inteiro.
const ALIASES = {
  "34": ["34"],
  "penguin companhia": ["penguin companhia", "penguin companhia das letras", "penguin cia das letras",
    "penguin classics companhia das letras", "penguin cia", "penguin classics companhia"],
  "companhia das letras": ["companhia das letras", "cia das letras", "companhia de bolso", "cia de bolso",
    "companhia das letrinhas", "seguinte"],
  "martin claret": ["martin claret"],
  "edipro": ["edipro"],
  "vozes": ["vozes", "vozes de bolso"],
};

/** Posição da editora na lista de prioritárias, ou -1. */
export function priorityIndex(publisher, list) {
  const p = canon(publisher);
  if (!p) return -1;
  return list.findIndex((name) => {
    const c = canon(name);
    return (ALIASES[c] || [c]).includes(p);
  });
}

// ISBN do Brasil: grupos 85 e 65
const isBrIsbn = (isbn13) => /^978(85|65)/.test(isbn13 || "");
const isPt = (r) => /^(pt|por)/.test(r.lang || "") || isBrIsbn(r.isbn13);

/* ---------- normalização das fontes ---------- */

const year = (s) => { const m = String(s || "").match(/\d{4}/); return m ? +m[0] : null; };
const first = (v) => (Array.isArray(v) ? v[0] : v) || "";

function isbnPair(list13 = [], list10 = []) {
  for (const v of [...list13, ...list10]) {
    const p = parseIsbn(v);
    if (p) return p;
  }
  return { isbn13: "", isbn10: "" };
}

/**
 * Capa do Google Books. A listagem só traz "thumbnail" (~128 px). O mesmo endereço
 * aceita fife=w800, que devolve a imagem original até 800 px de largura (ver NOTAS.md).
 */
function googleCover(v) {
  const t = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  if (!t) return "";
  return t.replace(/^http:/, "https:").replace(/&edge=curl/, "").replace(/&zoom=\d/, "&zoom=1") + "&fife=w800";
}

function fromGoogle(item) {
  const v = item.volumeInfo || {};
  const ids = v.industryIdentifiers || [];
  const pick = (t) => ids.filter((i) => i.type === t).map((i) => i.identifier);
  return {
    title: v.title || "",
    author: (v.authors || []).join(", "),
    publisher: v.publisher || "",
    year: year(v.publishedDate),
    ...isbnPair(pick("ISBN_13"), pick("ISBN_10")),
    totalPages: v.pageCount || null,
    coverUrl: googleCover(v),
    lang: v.language || "",
  };
}

const olCoverId = (id, size = "L") => (id ? `https://covers.openlibrary.org/b/id/${id}-${size}.jpg` : "");
export const olCoverIsbn = (isbn, size = "L") =>
  isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false` : "";

function fromOlEdition(e, work) {
  const pair = isbnPair(e.isbn_13 || (e.isbn || []).filter((i) => clean(i).length === 13),
    e.isbn_10 || (e.isbn || []).filter((i) => clean(i).length === 10));
  const lang = first(e.language) || (e.languages || []).map((l) => l.key?.split("/").pop())[0] || "";
  return {
    title: e.title || work.title || "",
    author: (work.author_name || []).join(", "),
    publisher: first(e.publisher || e.publishers),
    year: year(e.publish_date && first(e.publish_date)),
    ...pair,
    totalPages: e.number_of_pages || e.number_of_pages_median || null,
    coverUrl: olCoverId(first(e.cover_i) || first(e.covers)) || olCoverIsbn(pair.isbn13),
    lang,
  };
}

/* ---------- chamadas ---------- */

async function getJson(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

function googleUrl(q, { lang, key }) {
  const u = new URL("https://www.googleapis.com/books/v1/volumes");
  u.searchParams.set("q", q);
  if (lang) u.searchParams.set("langRestrict", "pt");
  u.searchParams.set("printType", "books");
  u.searchParams.set("maxResults", "40");
  if (key) u.searchParams.set("key", key);
  return u;
}

const OL_FIELDS = [
  "key", "title", "author_name", "first_publish_year", "cover_i", "number_of_pages_median", "language",
  "editions", "editions.title", "editions.publisher", "editions.publish_date", "editions.isbn",
  "editions.language", "editions.cover_i", "editions.number_of_pages_median",
].join(",");

/** Converte "título, autor" para a sintaxe do Google; sem vírgula, termos livres. */
function googleQuery(text) {
  const [t, a] = text.split(",").map((s) => s.trim());
  return a ? `intitle:"${t}" inauthor:"${a}"` : text;
}

/**
 * Busca por título e autor.
 * Devolve { results, partial } com as prioritárias primeiro. partial = alguma fonte falhou.
 */
export async function searchText(text, { signal, publishers = [], key = "" } = {}) {
  const q = googleQuery(text.trim());
  let partial = false;
  let googleDown = false;

  const google = (query, lang) => {
    if (googleDown) return Promise.resolve([]);
    return getJson(googleUrl(query, { lang, key }), signal)
      .then((d) => (d.items || []).map(fromGoogle))
      .catch((e) => {
        if (e.name === "AbortError") throw e;
        if (e.status === 429) googleDown = true;
        partial = true;
        return [];
      });
  };

  const base = google(q, true).then(async (list) =>
    list.length < 5 ? [...list, ...(await google(q, false))] : list);

  const byPublisher = publishers.map((p) => google(`${q} inpublisher:"${p}"`, false));

  // Open Library devolve uma edição por obra, a que melhor casa com a consulta.
  // Com publisher:"X" na consulta, essa edição passa a ser a da editora pedida.
  const terms = text.replace(/,/g, " ").trim();
  const openLibrary = async (q, limit, extra = {}) => {
    const u = new URL("https://openlibrary.org/search.json");
    u.searchParams.set("q", q);
    u.searchParams.set("fields", OL_FIELDS);
    u.searchParams.set("limit", String(limit));
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    try {
      const docs = (await getJson(u, signal)).docs || [];
      return docs.flatMap((w) => (w.editions?.docs || []).map((e) => fromOlEdition(e, w)));
    } catch (e) {
      if (e.name === "AbortError") throw e;
      partial = true;
      return [];
    }
  };
  const olBase = openLibrary(terms, 12, { language: "por", lang: "pt" }).then(async (list) =>
    list.length ? list : openLibrary(terms, 12));
  const olByPublisher = publishers.map((p) => openLibrary(`${terms} publisher:"${p}"`, 4));

  const lists = await Promise.all([base, ...byPublisher, olBase, ...olByPublisher]);
  return { results: rank(merge(lists.flat()), publishers), partial };
}

/** Busca por ISBN em todas as fontes. */
export async function searchIsbn(isbn, { signal, publishers = [], key = "" } = {}) {
  const p = parseIsbn(isbn);
  if (!p) return { results: [], partial: false };
  let partial = false;
  const soft = (promise) => promise.catch((e) => {
    if (e.name === "AbortError") throw e;
    partial = true;
    return [];
  });

  const google = soft(getJson(googleUrl(`isbn:${p.isbn13 || p.isbn10}`, { key }), signal)
    .then((d) => (d.items || []).map(fromGoogle)));

  const ol = soft((async () => {
    const keys = [p.isbn13, p.isbn10].filter(Boolean).map((i) => `ISBN:${i}`).join(",");
    const d = await getJson(`https://openlibrary.org/api/books?bibkeys=${keys}&format=json&jscmd=data`, signal);
    return Object.values(d).map((b) => ({
      title: b.title || "",
      author: (b.authors || []).map((a) => a.name).join(", "),
      publisher: b.publishers?.[0]?.name || "",
      year: year(b.publish_date),
      ...isbnPair(b.identifiers?.isbn_13, b.identifiers?.isbn_10),
      totalPages: b.number_of_pages || null,
      coverUrl: b.cover?.large || b.cover?.medium || "",
      lang: "",
    }));
  })());

  const all = merge((await Promise.all([google, ol])).flat())
    // o Google às vezes devolve parentes do ISBN pedido; fica o que bate
    .filter((r) => !r.isbn13 || r.isbn13 === p.isbn13);
  const results = all.length ? all : [];
  for (const r of results) {
    r.isbn13 ||= p.isbn13;
    r.isbn10 ||= p.isbn10;
    r.coverUrl ||= olCoverIsbn(r.isbn13);
  }
  return { results: rank(results, publishers), partial };
}

/* ---------- juntar e ordenar ---------- */

/** Junta edições repetidas (mesmo ISBN, ou mesmo título + editora + ano), completando lacunas. */
function merge(list) {
  const map = new Map();
  for (const r of list) {
    if (!r.title) continue;
    const k = r.isbn13 || `${norm(r.title)}|${canon(r.publisher)}|${r.year || ""}`;
    const prev = map.get(k);
    if (!prev) { map.set(k, { ...r }); continue; }
    for (const f of ["author", "publisher", "year", "isbn10", "totalPages", "coverUrl", "lang"]) {
      prev[f] ||= r[f];
    }
  }
  return [...map.values()];
}

/**
 * Prioritárias primeiro (na ordem da lista), depois português, depois o resto.
 * Dentro de cada grupo, quem tem capa e páginas vem antes. Empates mantêm a ordem das fontes.
 */
export function rank(list, publishers) {
  return list
    .map((r, i) => {
      const pri = priorityIndex(r.publisher, publishers);
      r.priority = pri >= 0;
      r.coverUrl ||= olCoverIsbn(r.isbn13, "L");
      const complete = (r.coverUrl && !r.coverUrl.includes("default=false") ? 1 : 0) + (r.totalPages ? 1 : 0);
      return { r, i, group: pri >= 0 ? 0 : isPt(r) ? 1 : 2, pri, complete };
    })
    .sort((a, b) => a.group - b.group || (a.group === 0 && a.pri - b.pri) || b.complete - a.complete || a.i - b.i)
    .map((x) => x.r);
}

// Verificação mínima do casamento de editoras:
//   import("./js/lib/search.js").then(m => m.selfCheck())
export function selfCheck() {
  const L = ["Editora 34", "Penguin-Companhia", "Martin Claret", "Edipro", "Vozes", "Companhia das Letras"];
  const t = (p, want) => console.assert(priorityIndex(p, L) === want, p, priorityIndex(p, L), want);
  t("Editora 34", 0);
  t("34", 0);
  t("Editora 34 Ltda.", 0);
  t("34 Letras", -1);
  t("Penguin", -1);
  t("Penguin Books", -1);
  t("Penguin Classics", -1);
  t("Penguin-Companhia das Letras", 1);
  t("Penguin Companhia", 1);
  t("Companhia de Bolso", 5);
  t("Companhia das Letras", 5);
  t("Editora Vozes", 4);
  t("Vozes Nobres", -1);
  t("EDIPRO", 3);
  t("Martin Claret", 2);
  return "ok";
}
