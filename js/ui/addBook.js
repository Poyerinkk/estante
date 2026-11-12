// Adicionar livro: busca, link da Amazon, ISBN (com câmera) e cadastro manual.
// Depois de escolher, uma tela de revisão com tudo editável.

import { state, newBook, addBook, updateBook, firstShelfWithRoom } from "../state.js";
import { searchText, searchIsbn, olCoverIsbn } from "../lib/search.js";
import { parse as parseIsbn, amazonCode, isValid10, to13 } from "../lib/isbn.js";
import { download, resize, dominantColor, edgeColor } from "../lib/cover.js";
import { openSheet, html, esc, toast } from "./dom.js";
import { icons } from "./icons.js";

const MODES = [["buscar", "Buscar"], ["link", "Link"], ["isbn", "ISBN"], ["manual", "Manual"]];

export function openAddBook() {
  const sheet = openSheet({ title: "Adicionar livro" });
  const ctx = { sheet, mode: "buscar", abort: null, panels: {} };

  sheet.body.innerHTML = `
    <div class="add">
      <div class="segmented add__modes" role="tablist" aria-label="Como adicionar">
        ${MODES.map(([k, l]) => `<button type="button" role="tab" data-mode="${k}" aria-selected="${k === "buscar"}">${l}</button>`).join("")}
      </div>
      <div class="add__panel" data-panel></div>
    </div>`;
  const panelHost = sheet.body.querySelector("[data-panel]");

  const show = (mode) => {
    ctx.mode = mode;
    sheet.body.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", b.dataset.mode === mode));
    // cada painel guarda seu estado; trocar de aba não apaga o que foi digitado
    ctx.panels[mode] ??= PANELS[mode](ctx);
    panelHost.replaceChildren(ctx.panels[mode]);
    ctx.panels[mode].querySelector("input")?.focus({ preventScroll: true });
  };
  sheet.body.querySelector(".add__modes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) show(b.dataset.mode);
  });

  // Voltar na tela de revisão volta para a busca, não fecha tudo
  sheet.onback = () => {
    if (!ctx.reviewing) return false;
    leaveReview(ctx);
    return true;
  };
  sheet.onclose = () => { ctx.abort?.abort(); stopScanner(); };

  show("buscar");
}

/* ---------- lista de resultados ---------- */

function resultItem(r) {
  const meta = [r.publisher || "Editora não informada", r.year, r.totalPages && `${r.totalPages} p.`]
    .filter(Boolean).map(esc).join(" · ");
  const thumb = r.coverUrl
    ? `<img class="result__cover" src="${esc(r.coverUrl.replace("-L.jpg", "-M.jpg"))}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'result__cover result__cover--none'}))">`
    : `<div class="result__cover result__cover--none"></div>`;
  return `
    <li class="result">
      ${thumb}
      <div class="result__text">
        <p class="result__title">${esc(r.title)}</p>
        ${r.author ? `<p class="result__author">${esc(r.author)}</p>` : ""}
        <p class="result__meta">${meta}</p>
        ${r.priority ? `<span class="badge">Editora prioritária</span>` : ""}
      </div>
      <button class="btn btn--small" data-choose>Escolher</button>
    </li>`;
}

function renderResults(host, results, ctx, { partial = false, empty = "Nada encontrado." } = {}) {
  const pri = results.filter((r) => r.priority);
  const rest = results.filter((r) => !r.priority);
  const section = (title, list) => list.length ? `
    <section class="results__group">
      ${title ? `<h3 class="eyebrow results__heading">${title}</h3>` : ""}
      <ul class="list results__list">${list.map(resultItem).join("")}</ul>
    </section>` : "";

  host.innerHTML = results.length
    ? `${partial ? `<p class="note results__note">Algumas fontes não responderam.</p>` : ""}
       ${section(pri.length ? "Editoras prioritárias" : "", pri)}
       ${section(pri.length ? "Outras edições" : "", rest)}`
    : `<p class="empty">${esc(empty)}</p>
       ${partial ? `<p class="note results__note" style="text-align:center">Algumas fontes não responderam.</p>` : ""}`;

  const all = [...pri, ...rest];
  host.querySelectorAll("[data-choose]").forEach((b, i) =>
    b.addEventListener("click", () => openReview(ctx, all[i])));
}

const searchOpts = (signal) => ({
  signal,
  publishers: state.settings.priorityPublishers,
  key: state.settings.googleBooksKey,
});

/* ---------- A. busca por título e autor ---------- */

function panelSearch(ctx) {
  const el = html(`
    <div class="stack">
      <label class="field">
        <span class="sr-only">Título e autor</span>
        <input class="input" type="search" placeholder="Título e autor" autocomplete="off" enterkeyhint="search">
        <span class="field__hint">Para refinar, separe com vírgula: título, autor.</span>
      </label>
      <div class="results" aria-live="polite"></div>
    </div>`);
  const input = el.querySelector("input");
  const out = el.querySelector(".results");
  let timer;

  const run = async () => {
    const q = input.value.trim();
    ctx.abort?.abort();
    if (q.length < 2) { out.innerHTML = ""; return; }
    const ac = (ctx.abort = new AbortController());
    out.innerHTML = `<p class="empty">Buscando…</p>`;
    try {
      const { results, partial } = await searchText(q, searchOpts(ac.signal));
      if (!ac.signal.aborted) renderResults(out, results, ctx, { partial });
    } catch (e) {
      if (e.name !== "AbortError") out.innerHTML = `<p class="empty">Não foi possível buscar agora.</p>`;
    }
  };
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 400); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { clearTimeout(timer); run(); } });
  return el;
}

/* ---------- busca por ISBN, usada por B e C ---------- */

async function runIsbn(ctx, isbn, out) {
  ctx.abort?.abort();
  const ac = (ctx.abort = new AbortController());
  out.innerHTML = `<p class="empty">Buscando…</p>`;
  try {
    const { results, partial } = await searchIsbn(isbn, searchOpts(ac.signal));
    if (ac.signal.aborted) return;
    const p = parseIsbn(isbn);
    renderResults(out, results, ctx, {
      partial,
      empty: "Nenhuma fonte conhece este ISBN. O cadastro manual resolve.",
    });
    if (!results.length) {
      out.insertAdjacentHTML("beforeend", `<div class="results__fallback"><button class="btn" data-manual>Cadastrar à mão com este ISBN</button></div>`);
      out.querySelector("[data-manual]").addEventListener("click", () =>
        openReview(ctx, { title: "", isbn13: p?.isbn13 || "", isbn10: p?.isbn10 || "" }));
    }
  } catch (e) {
    if (e.name !== "AbortError") out.innerHTML = `<p class="empty">Não foi possível buscar agora.</p>`;
  }
}

/* ---------- B. link da Amazon (o app nunca acessa a Amazon) ---------- */

function panelLink(ctx) {
  const el = html(`
    <div class="stack">
      <label class="field">
        <span class="field__label">Colar link do produto</span>
        <input class="input" type="url" inputmode="url" placeholder="https://www.amazon.com.br/…/dp/…" autocomplete="off">
        <span class="field__hint">O app lê só o código do endereço. A página da Amazon não é aberta.</span>
      </label>
      <button class="btn btn--primary btn--block" data-go>Buscar</button>
      <div class="results" aria-live="polite"></div>
    </div>`);
  const input = el.querySelector("input");
  const out = el.querySelector(".results");
  const go = () => {
    const code = amazonCode(input.value);
    if (!code) {
      out.innerHTML = `<p class="empty">Não encontrei o código do produto neste link.</p>`;
      return;
    }
    if (code.startsWith("B0")) {
      out.innerHTML = `<p class="empty">Este link não traz o ISBN do livro impresso. Tente a busca por título, o ISBN ou o cadastro manual.</p>`;
      return;
    }
    if (!isValid10(code)) {
      out.innerHTML = `<p class="empty">O código ${esc(code)} não é um ISBN válido.</p>`;
      return;
    }
    runIsbn(ctx, to13(code), out);
  };
  el.querySelector("[data-go]").addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  input.addEventListener("paste", () => setTimeout(go, 0));
  return el;
}

/* ---------- C. ISBN digitado ou lido pela câmera ---------- */

function panelIsbn(ctx) {
  const el = html(`
    <div class="stack">
      <label class="field">
        <span class="field__label">ISBN</span>
        <input class="input" inputmode="numeric" placeholder="10 ou 13 dígitos" autocomplete="off" maxlength="17">
        <span class="field__hint" data-hint></span>
      </label>
      <div class="row">
        <button class="btn btn--primary" data-go>Buscar</button>
        <button class="btn" data-scan>${icons.barcode}<span>Ler código de barras</span></button>
      </div>
      <div class="results" aria-live="polite"></div>
    </div>`);
  const input = el.querySelector("input");
  const hint = el.querySelector("[data-hint]");
  const out = el.querySelector(".results");
  const go = () => {
    const p = parseIsbn(input.value);
    if (!p) { hint.textContent = "ISBN inválido. Confira os dígitos."; return; }
    hint.textContent = "";
    runIsbn(ctx, p.isbn13 || p.isbn10, out);
  };
  el.querySelector("[data-go]").addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  el.querySelector("[data-scan]").addEventListener("click", async () => {
    const code = await scanBarcode();
    if (code) { input.value = code; go(); }
  });
  return el;
}

/* ---------- D. manual: a própria tela de revisão, vazia ---------- */

function panelManual(ctx) {
  return reviewForm(ctx, {});
}

const PANELS = { buscar: panelSearch, link: panelLink, isbn: panelIsbn, manual: panelManual };

/* ---------- revisão ---------- */

function openReview(ctx, result) {
  ctx.reviewing = true;
  ctx.savedScroll = ctx.sheet.body.scrollTop;
  ctx.searchView = [...ctx.sheet.body.childNodes];
  ctx.sheet.setTitle("Revisar");
  ctx.sheet.body.replaceChildren(reviewForm(ctx, result));
  ctx.sheet.body.scrollTop = 0;
}

function leaveReview(ctx) {
  ctx.reviewing = false;
  ctx.coverJob = null;
  ctx.sheet.setTitle("Adicionar livro");
  ctx.sheet.body.replaceChildren(...ctx.searchView);
  ctx.sheet.body.scrollTop = ctx.savedScroll || 0;
}

const STATUS = [["quero_ler", "Quero ler"], ["lendo", "Lendo"], ["lido", "Lido"]];

/** Editar dados de um livro já na estante: o mesmo formulário, sem status nem prateleira. */
export function openEditBook(book) {
  const sheet = openSheet({ title: "Editar dados" });
  sheet.body.append(reviewForm({ sheet }, book, { edit: book }));
}

function reviewForm(ctx, r, { edit = null } = {}) {
  const el = html(`
    <form class="review stack" novalidate>
      <div class="review__cover-row">
        <div class="review__cover" data-cover><span>Sem capa</span></div>
        <div class="review__cover-actions">
          <label class="btn btn--small">
            ${icons.camera}<span>Tirar foto da capa</span>
            <input type="file" accept="image/*" capture="environment" hidden data-file>
          </label>
          <label class="btn btn--small">
            ${icons.image}<span>Escolher da galeria</span>
            <input type="file" accept="image/*" hidden data-file>
          </label>
          <p class="caption" data-cover-note></p>
        </div>
      </div>

      <label class="field"><span class="field__label">Título</span>
        <input class="input" name="title" required autocomplete="off"></label>
      <label class="field"><span class="field__label">Autor</span>
        <input class="input" name="author" autocomplete="off"></label>
      <label class="field"><span class="field__label">Editora</span>
        <input class="input" name="publisher" autocomplete="off"></label>
      <label class="field"><span class="field__label">Edição</span>
        <input class="input" name="edition" placeholder="Ex.: edição comentada, 2ª ed." autocomplete="off"></label>
      <div class="row">
        <label class="field"><span class="field__label">Ano</span>
          <input class="input" name="year" inputmode="numeric" maxlength="4"></label>
        <label class="field"><span class="field__label">Páginas</span>
          <input class="input" name="totalPages" inputmode="numeric" maxlength="5"></label>
      </div>
      <label class="field"><span class="field__label">ISBN</span>
        <input class="input" name="isbn" inputmode="numeric" autocomplete="off">
        <span class="field__hint" data-isbn-hint></span></label>

      <div class="field" data-new-only>
        <span class="field__label">Status</span>
        <div class="segmented" role="group" aria-label="Status" data-status>
          ${STATUS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === "quero_ler"}">${l}</button>`).join("")}
        </div>
      </div>

      <label class="field" data-new-only><span class="field__label">Prateleira</span>
        <select class="select" name="shelf">
          ${state.shelves.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}
        </select>
        <span class="field__hint">O livro entra no fim da prateleira. Se não couber, o último passa para a seguinte.</span>
      </label>

      <p class="note" data-error role="alert"></p>
      <button class="btn btn--primary btn--block" type="submit">${edit ? "Salvar alterações" : "Adicionar à estante"}</button>
    </form>`);

  const f = el.elements;
  if (edit) el.querySelectorAll("[data-new-only]").forEach((x) => x.remove());
  f.edition.value = r.edition || "";
  f.title.value = r.title || "";
  f.author.value = r.author || "";
  f.publisher.value = r.publisher || "";
  f.year.value = r.year || "";
  f.totalPages.value = r.totalPages || "";
  f.isbn.value = r.isbn13 || r.isbn10 || "";

  let status = "quero_ler";
  el.querySelector("[data-status]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-v]");
    if (!b) return;
    status = b.dataset.v;
    el.querySelectorAll("[data-status] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });

  // prateleira padrão: a primeira com espaço; acompanha as páginas até o usuário escolher
  let shelfTouched = false;
  const suggestShelf = () => {
    if (!shelfTouched && f.shelf) f.shelf.value = firstShelfWithRoom({ totalPages: +f.totalPages.value || null });
  };
  suggestShelf();
  f.shelf?.addEventListener("change", () => { shelfTouched = true; });
  f.totalPages.addEventListener("input", suggestShelf);

  /* capa */
  const coverBox = el.querySelector("[data-cover]");
  const coverNote = el.querySelector("[data-cover-note]");
  const cover = { blob: null, remote: "" };
  const showCover = (src) => {
    coverBox.innerHTML = `<img src="${esc(src)}" alt="Capa">`;
  };
  const setBlob = (blob) => {
    cover.blob = blob;
    cover.remote = "";
    if (cover.objectUrl) URL.revokeObjectURL(cover.objectUrl);
    cover.objectUrl = URL.createObjectURL(blob);
    showCover(cover.objectUrl);
    coverNote.textContent = "";
  };

  el.querySelectorAll("[data-file]").forEach((inp) => inp.addEventListener("change", async () => {
    const file = inp.files?.[0];
    inp.value = "";
    if (!file) return;
    // a foto escolhida vence o download em andamento, e "Adicionar" espera por ela
    coverNote.textContent = "Preparando a foto…";
    const job = (ctx.coverJob = resize(file, 600, 0.85).then(
      (blob) => { if (ctx.coverJob === job) setBlob(blob); },
      () => { if (ctx.coverJob === job) coverNote.textContent = "Não foi possível ler esta imagem."; },
    ));
  }));

  // edição: começa com a capa que o livro já tem
  if (edit?.cover) setBlob(edit.cover);
  else if (edit?.coverRemoteUrl) {
    cover.remote = edit.coverRemoteUrl;
    showCover(edit.coverRemoteUrl);
    coverNote.textContent = "Capa não salva offline. Dá para trocar por uma foto.";
  }

  // a busca por título raramente traz o número de páginas; o registro do ISBN costuma ter
  if (!edit && !r.totalPages && (r.isbn13 || r.isbn10)) {
    searchIsbn(r.isbn13 || r.isbn10, { key: state.settings.googleBooksKey })
      .then(({ results }) => {
        const found = results.find((x) => x.totalPages);
        if (found && !f.totalPages.value) { f.totalPages.value = found.totalPages; suggestShelf(); }
        if (found?.year && !f.year.value) f.year.value = found.year;
      })
      .catch(() => {});
  }

  // capas do Open Library primeiro: elas permitem guardar a imagem; as do Google, não (CORS)
  const urls = [...new Set([
    r.coverUrl?.includes("openlibrary.org") ? r.coverUrl : "",
    olCoverIsbn(r.isbn13), olCoverIsbn(r.isbn10),
    r.coverUrl,
  ].filter(Boolean))];
  if (urls.length && !edit) {
    coverNote.textContent = "Salvando capa…";
    const job = (ctx.coverJob = download(urls));
    job.then((res) => {
      if (ctx.coverJob !== job) return;
      if (res.blob) setBlob(res.blob);
      else if (r.coverUrl) {
        cover.remote = r.coverUrl;
        showCover(r.coverUrl);
        coverNote.textContent = "Capa não salva offline. Dá para trocar por uma foto.";
      } else coverNote.textContent = "";
    });
  }

  el.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = el.querySelector("[data-error]");
    const isbnHint = el.querySelector("[data-isbn-hint]");
    err.textContent = "";
    isbnHint.textContent = "";
    const title = f.title.value.trim();
    if (!title) { err.textContent = "Falta o título."; f.title.focus(); return; }
    const isbnRaw = f.isbn.value.trim();
    const isbn = isbnRaw ? parseIsbn(isbnRaw) : { isbn13: "", isbn10: "" };
    if (!isbn) { isbnHint.textContent = "ISBN inválido. Corrija ou deixe em branco."; f.isbn.focus(); return; }

    const btn = el.querySelector("[type=submit]");
    btn.disabled = true;
    // se o download da capa ainda estiver em andamento, espera por ele
    if (ctx.coverJob) await ctx.coverJob;

    const year = parseInt(f.year.value, 10);
    const pages = parseInt(f.totalPages.value, 10);
    const fields = {
      title,
      author: f.author.value.trim(),
      publisher: f.publisher.value.trim(),
      edition: f.edition.value.trim(),
      year: year > 0 ? year : null,
      totalPages: pages > 0 ? pages : null,
      isbn13: isbn.isbn13 || "",
      isbn10: isbn.isbn10 || "",
      cover: cover.blob,
      coverRemoteUrl: cover.blob ? "" : cover.remote,
    };
    // a cor da lombada só é recalculada quando a capa muda
    const sameCover = edit && edit.cover === cover.blob;
    fields.spineColor = sameCover ? edit.spineColor
      : cover.blob ? await dominantColor(cover.blob).catch(() => "") : "";
    // cor média da borda esquerda: decide a cor do título sobre a lombada feita da capa
    fields.spineEdge = sameCover ? edit.spineEdge || ""
      : cover.blob ? await edgeColor(cover.blob).catch(() => "") : "";
    try {
      if (edit) {
        await updateBook(edit, fields);
        ctx.sheet.close();
        toast("Dados salvos.");
        return;
      }
      await addBook(newBook({ ...fields, status, shelfId: shelfTouched ? f.shelf.value : null }));
    } catch {
      btn.disabled = false;
      err.textContent = "Não foi possível salvar. Tente de novo.";
      return;
    }
    ctx.reviewing = false;
    ctx.sheet.close();
    toast("Livro adicionado à estante.");
  });

  return el;
}

/* ---------- leitor de código de barras ---------- */

let scanner = null;

function stopScanner() {
  scanner?.stop();
  scanner = null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.ZXingBrowser) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("leitor não carregou"));
    document.head.append(s);
  });
}

const isBookEan = (code) => /^97[89]\d{10}$/.test(code) && parseIsbn(code);

/**
 * Abre a câmera e devolve o ISBN lido (EAN-13 com 978/979), ou null se cancelado.
 * BarcodeDetector quando existe; no Safari do iPhone, zxing-js local em js/vendor/.
 */
function scanBarcode() {
  return new Promise(async (resolve) => {
    const ov = html(`
      <div class="scanner" role="dialog" aria-label="Ler código de barras">
        <video class="scanner__video" playsinline muted autoplay></video>
        <div class="scanner__frame" aria-hidden="true"></div>
        <p class="scanner__msg">Aponte para o código de barras do livro.</p>
        <button class="btn scanner__cancel">Cancelar</button>
      </div>`);
    document.body.append(ov);
    const video = ov.querySelector("video");
    const msg = ov.querySelector(".scanner__msg");
    let stream, controls, timer, done = false;

    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      controls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      ov.remove();
      scanner = null;
      resolve(code);
    };
    scanner = { stop: () => finish(null) };
    ov.querySelector(".scanner__cancel").addEventListener("click", () => finish(null));

    const constraints = { video: { facingMode: { ideal: "environment" } }, audio: false };
    try {
      const native = "BarcodeDetector" in window &&
        (await BarcodeDetector.getSupportedFormats()).includes("ean_13");
      if (native) {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (done) return finish(null);
        video.srcObject = stream;
        await video.play();
        const det = new BarcodeDetector({ formats: ["ean_13"] });
        const tick = async () => {
          if (done) return;
          try {
            const found = (await det.detect(video)).map((c) => c.rawValue).find(isBookEan);
            if (found) return finish(found);
          } catch {}
          timer = setTimeout(tick, 180);
        };
        tick();
      } else {
        await loadScript("js/vendor/zxing-browser.min.js");
        const reader = new window.ZXingBrowser.BrowserMultiFormatOneDReader();
        controls = await reader.decodeFromConstraints(constraints, video, (result) => {
          const code = result?.getText();
          if (code && isBookEan(code)) finish(code);
        });
        if (done) controls.stop();
      }
    } catch (e) {
      msg.textContent = e?.name === "NotAllowedError"
        ? "Sem permissão para usar a câmera. Digite o ISBN."
        : "Não foi possível abrir a câmera. Digite o ISBN.";
    }
  });
}
