// Abrir o livro (seção 6.5) e a página do livro (seção 7).
// O livro sai da estante como um prisma em CSS 3D: a lombada gira -90° e a capa, que está
// na face lateral direita, termina de frente, no lugar exato da capa da página.

import {
  state, on, emit, setCurrentPage, setStatus, updateBook, removeBook,
  sessionsOf, updateSession, deleteSession,
} from "../state.js";
import { coverSrc, inkFor, resize, blobUrl } from "../lib/cover.js";
import { formatDate, duration, today } from "../lib/time.js";
import { esc, html, confirm, menu, formDialog, toast } from "./dom.js";
import { openEditBook } from "./addBook.js";

const DURATION = 420;
const EASE = "cubic-bezier(.2, .7, .2, 1)";
// Se o Safari do iPhone se comportar mal com preserve-3d, trocar para false
// usa a alternativa da seção 6.5 item 7: escala e fade da lombada para a capa (ver NOTAS.md).
const USE_3D = true;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const ICON_MORE = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/></svg>`;

let current = null; // só uma página de livro aberta por vez

/* ---------- capa (imagem ou gerada) ---------- */

export function coverFace(b) {
  const src = coverSrc(b);
  if (src) return `<img src="${esc(src)}" alt="" draggable="false">`;
  const c = b.spineColor;
  return `
    <div class="gen-cover" style="${c ? `--c:${c};--ink:${inkFor(c)}` : ""}">
      <div class="gen-cover__in">
        <p class="gen-cover__title">${esc(b.title)}</p>
        ${b.author ? `<p class="gen-cover__author">${esc(b.author)}</p>` : ""}
      </div>
    </div>`;
}

/* ---------- prisma ---------- */

// o clone leva o mesmo fundo da lombada: cor, faixa da capa ou foto da lombada
function spineBg(cs) {
  return [
    `background-color:${cs.backgroundColor}`,
    `background-image:${cs.backgroundImage.replace(/"/g, "'")}`,
    `background-size:${cs.backgroundSize}`,
    `background-position:${cs.backgroundPosition}`,
    `background-repeat:${cs.backgroundRepeat}`,
  ].join(";");
}
const spineInner = (spine) => (spine.classList.contains("has-photo") ? "" : spine.innerHTML);

function prism(spine, b, s, h, c) {
  const el = document.createElement("div");
  el.className = "fly";
  const cs = getComputedStyle(spine);
  el.innerHTML = `
    <div class="fly__face fly__spine" style="width:${s}px;--w:${s}px;${spineBg(cs)};color:${cs.color};transform:translateZ(${c / 2}px)">
      ${spineInner(spine)}
    </div>
    <div class="fly__face fly__cover" style="left:${(s - c) / 2}px;width:${c}px;transform:rotateY(90deg) translateZ(${s / 2}px)">
      ${coverFace(b)}
    </div>`;
  return el;
}

/**
 * Keyframes do prisma entre a lombada (sr) e a capa (cr).
 * Ordem: girar, recuar em z para a face visível ficar no plano da tela, escalar, mover.
 */
function prismFrames(sr, cr) {
  const s = sr.width, h = sr.height;
  const c = h * cr.width / cr.height; // largura da face da capa antes de escalar
  const k = cr.height / h;
  const dx = cr.left + cr.width / 2 - (sr.left + s / 2);
  const dy = cr.top + cr.height / 2 - (sr.top + h / 2);
  const t = (x, y, k, z, r) => `perspective(1200px) translate(${x}px, ${y}px) scale3d(${k}, ${k}, ${k}) translateZ(${z}px) rotateY(${r}deg)`;
  return {
    c,
    spineFrame: { transform: t(0, 0, 1, -c / 2, 0) },
    coverFrame: { transform: t(dx, dy, k, -s / 2, -90) },
  };
}

// alternativa sem 3D: a lombada cresce até o retângulo da capa enquanto a capa aparece por cima
function flatFrames(sr, cr) {
  const sx = cr.width / sr.width, sy = cr.height / sr.height;
  const dx = cr.left + cr.width / 2 - (sr.left + sr.width / 2);
  const dy = cr.top + cr.height / 2 - (sr.top + sr.height / 2);
  return {
    spineFrame: { transform: "none" },
    coverFrame: { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
  };
}

function flatClone(spine, b, sr) {
  const el = document.createElement("div");
  el.className = "fly fly--flat";
  const cs = getComputedStyle(spine);
  el.innerHTML = `
    <div class="fly__face fly__spine" style="width:100%;--w:${sr.width}px;${spineBg(cs)};color:${cs.color}">${spineInner(spine)}</div>
    <div class="fly__face fly__cover fly__cover--flat" style="width:100%">${coverFace(b)}</div>`;
  return el;
}

function placeFly(el, sr) {
  Object.assign(el.style, { left: `${sr.left}px`, top: `${sr.top}px`, width: `${sr.width}px`, height: `${sr.height}px` });
  document.body.append(el);
}

const visible = (r) => r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;

/* ---------- abrir ---------- */

export function openBook(id, spine) {
  const b = state.books.get(id);
  // um fechamento ainda em andamento não pode impedir de abrir outro livro
  if (current?.closing) {
    current.el.remove();
    document.querySelectorAll(".fly").forEach((f) => f.remove());
    document.querySelectorAll(".spine[style*='visibility']").forEach((s) => { s.style.visibility = ""; });
    current = null;
  }
  if (!b || current) return;
  const page = buildPage(b);
  current = page;
  document.body.append(page.el);
  history.pushState({ bookPage: page.token }, "");
  addEventListener("popstate", page.onPop);

  const coverEl = page.el.querySelector("[data-cover]");
  const sr = spine?.getBoundingClientRect();

  if (reduced() || !sr || !visible(sr)) {
    page.el.classList.add("is-fading-in");
    page.el.classList.remove("is-opening");
    page.ready = true;
    return;
  }

  const cr = coverEl.getBoundingClientRect();
  spine.style.visibility = "hidden";
  page.spine = spine;

  let fly, frames;
  if (USE_3D) {
    frames = prismFrames(sr, cr);
    fly = prism(spine, b, sr.width, sr.height, frames.c);
  } else {
    frames = flatFrames(sr, cr);
    fly = flatClone(spine, b, sr);
  }
  placeFly(fly, sr);
  if (!USE_3D) fly.querySelector(".fly__cover--flat").animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: EASE, fill: "both" });

  page.el.querySelector(".bookpage__bg").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out", fill: "both" });
  const anim = fly.animate([frames.spineFrame, frames.coverFrame], { duration: DURATION, easing: EASE, fill: "both" });
  page.anim = anim;
  anim.finished.then(() => {
    page.el.classList.remove("is-opening");
    fly.remove();
    page.ready = true;
    revealBlocks(page.el);
  }).catch(() => {});
}

function revealBlocks(root) {
  root.querySelectorAll("[data-block]").forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: 180, delay: i * 40, easing: "ease-out", fill: "backwards" },
    );
  });
}

/* ---------- fechar ---------- */

async function closePage(page, { animate = true } = {}) {
  if (page.closing) return;
  page.closing = true;
  removeEventListener("popstate", page.onPop);
  page.off.forEach((f) => f());
  const done = () => {
    page.el.remove();
    if (page.spine) page.spine.style.visibility = "";
    document.querySelectorAll(".spine[style*='visibility']").forEach((s) => { s.style.visibility = ""; });
    if (current === page) current = null;
  };

  const b = state.books.get(page.id);
  const spine = b && document.querySelector(`.spine[data-book="${CSS.escape(page.id)}"]`);
  const sr = spine?.getBoundingClientRect();
  if (!animate || reduced() || !b || !sr || !visible(sr)) {
    page.el.classList.add("is-fading-out");
    setTimeout(done, 110);
    return;
  }

  // 1. o conteúdo some depressa; a página volta ao topo para a capa estar à vista
  const body = page.el.querySelector(".bookpage__body");
  const blocks = [...page.el.querySelectorAll("[data-block]")];
  await Promise.all(blocks.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" }).finished));
  body.scrollTop = 0;

  // 2. o prisma faz o caminho inverso, da capa para a lombada
  const coverEl = page.el.querySelector("[data-cover]");
  const cr = coverEl.getBoundingClientRect();
  spine.style.visibility = "hidden";
  page.spine = spine;
  let fly, frames;
  if (USE_3D) {
    frames = prismFrames(sr, cr);
    fly = prism(spine, b, sr.width, sr.height, frames.c);
  } else {
    frames = flatFrames(sr, cr);
    fly = flatClone(spine, b, sr);
    fly.querySelector(".fly__cover--flat").animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION, easing: EASE, fill: "both" });
  }
  placeFly(fly, sr);
  coverEl.style.visibility = "hidden";
  page.el.querySelector(".bookpage__bg").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: 60, easing: "ease-out", fill: "both" });
  page.el.querySelector(".bookpage__bar").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" });
  await fly.animate([frames.coverFrame, frames.spineFrame], { duration: DURATION, easing: EASE, fill: "both" }).finished.catch(() => {});
  fly.remove();
  done();
}

/** Fecha a página do livro aberta (usado ao trocar de aba). */
export function closeOpenBook(opts) {
  if (!current) return Promise.resolve();
  const page = current;
  if (history.state?.bookPage === page.token) history.back();
  return closePage(page, opts);
}

/* ---------- página ---------- */

const STATUS = [["quero_ler", "Quero ler"], ["lendo", "Lendo"], ["lido", "Lido"]];
const DIFF = [["facil", "Fácil"], ["medio", "Médio"], ["dificil", "Difícil"]];

function buildPage(b) {
  const token = Math.random().toString(36).slice(2);
  const el = html(`
    <div class="bookpage is-opening" role="dialog" aria-modal="true" aria-label="${esc(b.title)}">
      <div class="bookpage__bg"></div>
      <div class="bookpage__col">
        <header class="sheet__bar bookpage__bar" data-block>
          <button class="icon-btn" data-back aria-label="Voltar">${ICON_BACK}</button>
          <span class="sheet__title"></span>
          <button class="icon-btn" data-more aria-label="Mais opções">${ICON_MORE}</button>
        </header>
        <div class="bookpage__body"></div>
      </div>
    </div>`);
  const page = { el, token, id: b.id, ready: false, off: [] };
  page.onPop = () => { if (history.state?.bookPage !== token && !history.state?.sheet) closePage(page); };

  fill(page);

  el.querySelector("[data-back]").addEventListener("click", () => {
    if (history.state?.bookPage === token) history.back(); else closePage(page);
  });
  el.querySelector("[data-more]").addEventListener("click", async () => {
    const book = state.books.get(page.id);
    const choice = await menu([
      { value: "edit", label: "Editar dados" },
      { value: "remove", label: "Remover", danger: true },
    ]);
    if (choice === "edit") openEditBook(book);
    if (choice === "remove") {
      const ok = await confirm(`Remover "${book.title}" da estante? As leituras registradas também serão apagadas.`, {
        ok: "Remover", danger: true,
      });
      if (!ok) return;
      await closeOpenBook({ animate: false });
      await removeBook(book.id);
      toast("Livro removido.");
    }
  });

  // arrastar para baixo, com a página no topo, fecha
  const body = el.querySelector(".bookpage__body");
  let y0 = null, x0 = 0;
  body.addEventListener("touchstart", (e) => {
    y0 = body.scrollTop <= 0 ? e.touches[0].clientY : null;
    x0 = e.touches[0].clientX;
  }, { passive: true });
  body.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (dy > 90 && dy > dx * 1.5) { y0 = null; el.querySelector("[data-back]").click(); }
  }, { passive: true });

  // dados mudaram (edição, sessão salva): redesenha mantendo a rolagem
  const refresh = () => {
    if (!page.ready || page.closing) return;
    if (!state.books.has(page.id)) return closePage(page, { animate: false });
    const top = body.scrollTop;
    const focused = document.activeElement?.name;
    fill(page);
    body.scrollTop = top;
    if (focused) body.querySelector(`[name="${focused}"]`)?.focus({ preventScroll: true });
  };
  page.off.push(on("books", refresh), on("sessions", refresh));
  return page;
}

function fill(page) {
  const b = state.books.get(page.id);
  const body = page.el.querySelector(".bookpage__body");
  const pct = b.totalPages ? Math.min(100, Math.round((b.currentPage || 0) / b.totalPages * 100)) : null;
  const meta = [b.publisher, b.edition, b.year, b.totalPages && `${b.totalPages} páginas`, b.isbn13 || b.isbn10 ? `ISBN ${b.isbn13 || b.isbn10}` : ""]
    .filter(Boolean).map(esc).join(" · ");
  const sessions = sessionsOf(b.id);
  const tot = sessions.reduce((a, s) => ({ p: a.p + s.pagesRead, t: a.t + s.durationSec }), { p: 0, t: 0 });

  body.innerHTML = `
    <div class="bp-head" data-block>
      <h1 class="bp-title">${esc(b.title)}</h1>
      ${b.author ? `<p class="bp-author">${esc(b.author)}</p>` : ""}
    </div>

    <div class="bp-cover-wrap">
      <div class="bp-cover" data-cover>${coverFace(b)}</div>
      ${b.coverRemoteUrl && !b.cover ? `<p class="caption bp-cover-note">Capa não salva offline.</p>` : ""}
      <div class="bp-spine-photo" data-block>
        ${b.spinePhoto ? `<span class="bp-spine-thumb" style="background-image:url('${blobUrl(b.spinePhoto)}')" aria-hidden="true"></span>` : ""}
        <label class="btn btn--small">
          ${b.spinePhoto ? "Trocar foto da lombada" : "Foto da lombada"}
          <input type="file" accept="image/*" hidden data-spine-photo>
        </label>
        ${b.spinePhoto ? `<button class="btn btn--small btn--text" data-spine-remove>Remover</button>` : ""}
      </div>
      ${b.spinePhoto ? "" : `<p class="caption bp-spine-hint">Na estante, a lombada usa a borda da capa. Para ficar igual ao livro, fotografe a lombada de pé, ocupando a altura da foto.</p>`}
    </div>

    ${meta ? `<p class="bp-meta" data-block>${meta}</p>` : ""}

    <section class="bp-section" data-block>
      ${pct != null ? `<div class="bp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${b.totalPages}" aria-valuenow="${b.currentPage || 0}"><span style="width:${pct}%"></span></div>` : ""}
      <div class="bp-progress">
        <p class="muted">página ${b.currentPage || 0}${b.totalPages ? ` de ${b.totalPages} · ${pct}%` : ""}</p>
        <label class="bp-page">
          <span class="caption">Corrigir</span>
          <input class="input bp-page__input" name="currentPage" inputmode="numeric" pattern="[0-9]*" value="${b.currentPage || 0}" aria-label="Página atual">
        </label>
      </div>
    </section>

    <section class="bp-section" data-block>
      <div class="segmented" role="group" aria-label="Status" data-status>
        ${STATUS.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${b.status === v}">${l}</button>`).join("")}
      </div>
    </section>

    <section class="bp-section" data-block>
      <button class="btn btn--primary btn--block" data-read>Ler agora</button>
    </section>

    <section class="bp-section bp-eval" data-block>
      <h2 class="section-title">Avaliação</h2>
      <div class="field">
        <span class="field__label">Nota</span>
        <div class="segmented" role="group" aria-label="Nota" data-rating>
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" aria-pressed="${b.rating === n}">${n}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <span class="field__label">Dificuldade</span>
        <div class="segmented" role="group" aria-label="Dificuldade" data-diff>
          ${DIFF.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${b.difficulty === v}">${l}</button>`).join("")}
        </div>
      </div>
      <p class="caption">Opcional. Toque de novo para limpar.</p>
    </section>

    <section class="bp-section" data-block>
      <h2 class="section-title">Anotações</h2>
      <textarea class="textarea" name="notes" placeholder="Escreva o que quiser lembrar deste livro." aria-label="Anotações">${esc(b.notes)}</textarea>
    </section>

    <section class="bp-section" data-block>
      <h2 class="section-title">Leituras</h2>
      ${sessions.length ? `
        <p class="caption">${sessions.length} ${sessions.length === 1 ? "leitura" : "leituras"} · ${tot.p} ${tot.p === 1 ? "página" : "páginas"}${tot.t ? ` · ${esc(duration(tot.t))}` : ""}</p>
        <ul class="list sessions">
          ${sessions.map((s) => `
            <li class="session" data-session="${esc(s.id)}">
              <div class="session__text">
                <p>${esc(formatDate(s.date))}</p>
                <p class="caption">pp. ${s.startPage}–${s.endPage} · ${s.pagesRead} ${s.pagesRead === 1 ? "página" : "páginas"}${s.durationSec ? ` · ${esc(duration(s.durationSec))}` : ""}${s.source === "manual" ? " · manual" : ""}</p>
              </div>
              <button class="btn btn--small btn--text" data-edit-session>Editar</button>
              <button class="btn btn--small btn--text btn--danger" data-del-session>Apagar</button>
            </li>`).join("")}
        </ul>` : `<p class="muted">Ainda não há leituras registradas.</p>`}
    </section>`;

  page.el.querySelector(".sheet__title").textContent = "";
  bind(page, b, body);
}

function toggleSeg(group, attr, value) {
  group.querySelectorAll("[data-v]").forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === String(value)));
}

function bind(page, b, body) {
  const pageInput = body.querySelector("[name=currentPage]");
  pageInput.addEventListener("change", async () => {
    const n = parseInt(pageInput.value, 10);
    if (!(n >= 0)) { pageInput.value = b.currentPage || 0; return; }
    if (b.totalPages && n > b.totalPages) {
      toast(`O livro tem ${b.totalPages} páginas.`);
      pageInput.value = b.currentPage || 0;
      return;
    }
    await setCurrentPage(b, n);
  });
  pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") pageInput.blur(); });

  body.querySelector("[data-status]").addEventListener("click", (e) => {
    const v = e.target.closest("[data-v]")?.dataset.v;
    if (v && v !== b.status) setStatus(b, v);
  });

  body.querySelector("[data-read]").addEventListener("click", async () => {
    state.ui.timerBookId = b.id;
    if (state.active && state.active.bookId !== b.id) toast("Há uma leitura em andamento de outro livro.");
    await closeOpenBook({ animate: false });
    emit("go", "ler");
  });

  body.querySelector("[data-rating]").addEventListener("click", (e) => {
    const n = +e.target.closest("[data-v]")?.dataset.v;
    if (!n) return;
    const rating = b.rating === n ? 0 : n;
    toggleSeg(e.currentTarget, "v", rating);
    updateBook(b, { rating });
  });
  body.querySelector("[data-diff]").addEventListener("click", (e) => {
    const v = e.target.closest("[data-v]")?.dataset.v;
    if (!v) return;
    const difficulty = b.difficulty === v ? null : v;
    toggleSeg(e.currentTarget, "v", difficulty);
    updateBook(b, { difficulty });
  });

  const spineInput = body.querySelector("[data-spine-photo]");
  spineInput.addEventListener("change", async () => {
    const file = spineInput.files?.[0];
    spineInput.value = "";
    if (!file) return;
    try {
      // fotos de lombada são altas e finas: guarda até 900 px de largura para sobrar nitidez no recorte
      await updateBook(b, { spinePhoto: await resize(file, 900, 0.85) });
      toast("Foto da lombada salva.");
    } catch {
      toast("Não foi possível ler esta imagem.");
    }
  });
  body.querySelector("[data-spine-remove]")?.addEventListener("click", async () => {
    if (await confirm("Remover a foto da lombada? A lombada volta a usar a borda da capa.", { ok: "Remover", danger: true })) {
      await updateBook(b, { spinePhoto: null });
    }
  });

  const notes = body.querySelector("[name=notes]");
  notes.addEventListener("blur", () => { if (notes.value !== b.notes) updateBook(b, { notes: notes.value }); });

  body.querySelectorAll("[data-session]").forEach((li) => {
    const s = state.sessions.find((x) => x.id === li.dataset.session);
    li.querySelector("[data-edit-session]").addEventListener("click", async () => {
      const v = await formDialog("Editar leitura", [
        { name: "date", label: "Data", type: "date", value: s.date, max: today() },
        { name: "startPage", label: "Página inicial", inputmode: "numeric", value: s.startPage },
        { name: "endPage", label: "Página final", inputmode: "numeric", value: s.endPage },
        { name: "minutes", label: "Duração em minutos", inputmode: "numeric", value: Math.round(s.durationSec / 60) },
      ]);
      if (!v) return;
      const start = parseInt(v.startPage, 10), end = parseInt(v.endPage, 10), minutes = parseInt(v.minutes, 10) || 0;
      if (!v.date || !(start >= 0) || !(end >= 0)) { toast("Confira a data e as páginas."); return; }
      if (b.totalPages && end > b.totalPages) { toast(`O livro tem ${b.totalPages} páginas.`); return; }
      await updateSession(s.id, { date: v.date, startPage: start, endPage: end, minutes });
    });
    li.querySelector("[data-del-session]").addEventListener("click", async () => {
      if (await confirm("Apagar esta leitura?", { ok: "Apagar", danger: true })) await deleteSession(s.id);
    });
  });
}
