// Ler: leitura cronometrada (seção 4.2), lançamento manual e controle da tela acesa.
// O tempo nunca é contado: vem de Date.now() - início - pausas. A tela só redesenha.

import {
  state, on, elapsedMs, startSession, pauseSession, resumeSession, finishSession,
  setActiveDuration, cancelSession, addManualSession, lastReadBookId,
} from "../state.js";
import { clock, duration, today } from "../lib/time.js";
import { coverSrc, inkFor } from "../lib/cover.js";
import { esc, confirm, openSheet, html, toast } from "./dom.js";

const SIX_HOURS = 6 * 3600 * 1000;
let host = null;
let tick = 0;
let view = "idle";        // idle | ending | saving | summary
let summary = null;
let askedLong = false;    // pergunta das 6 horas: uma vez por abertura do app

export function render(main) {
  host = main;
  draw();
}

export function leave() {
  clearInterval(tick);
  host = null;
}

/* ---------- livro em miniatura ---------- */

export function bookThumb(b, cls = "thumb") {
  const src = coverSrc(b);
  if (src) return `<img class="${cls}" src="${esc(src)}" alt="">`;
  const c = b.spineColor;
  return `<div class="${cls} ${cls}--plain" style="${c ? `--c:${c};--ink:${inkFor(c)}` : ""}"><span>${esc(b.title)}</span></div>`;
}

const pagesOf = (b) => b.totalPages ? `página ${b.currentPage || 0} de ${b.totalPages}` : `página ${b.currentPage || 0}`;

const candidates = () => [...state.books.values()]
  .filter((b) => b.status !== "lido")
  .sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title, "pt-BR") : a.status === "lendo" ? -1 : 1));

/* ---------- desenho ---------- */

function draw() {
  if (!host) return;
  clearInterval(tick);
  if (view === "saving") return; // entre gravar a sessão e mostrar o resumo
  const a = state.active;
  if (a && state.books.has(a.bookId)) {
    if (view === "ending") return drawEnding();
    return drawRunning();
  }
  if (view === "summary" && summary) return drawSummary();
  view = "idle";
  drawIdle();
}

function drawIdle() {
  const list = candidates();
  if (!state.books.size) {
    host.innerHTML = `<section class="screen screen--padded"><p class="empty">Adicione um livro à estante para começar.</p></section>`;
    return;
  }
  let id = state.ui.timerBookId || lastReadBookId();
  if (!list.some((b) => b.id === id)) id = list[0]?.id;
  const b = state.books.get(id);

  host.innerHTML = `
    <section class="screen screen--padded timer">
      ${b ? `
        <div class="timer__book">
          ${bookThumb(b)}
          <div class="timer__book-text">
            <p class="timer__title">${esc(b.title)}</p>
            ${b.author ? `<p class="muted timer__author">${esc(b.author)}</p>` : ""}
          </div>
        </div>
        <label class="field">
          <span class="field__label">Livro</span>
          <select class="select" data-book>
            ${list.map((x) => `<option value="${esc(x.id)}" ${x.id === id ? "selected" : ""}>${esc(x.title)}${x.status === "lendo" ? "" : " (quero ler)"}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Página inicial</span>
          <input class="input" data-start inputmode="numeric" pattern="[0-9]*" value="${b.currentPage || 0}">
          <span class="field__hint">Última página registrada: ${b.currentPage || 0}</span>
        </label>
        <button class="btn btn--primary btn--block" data-go>Iniciar</button>
      ` : `<p class="empty">Todos os livros da estante estão marcados como lidos.</p>`}
      <div class="timer__manual">
        <button class="btn btn--text" data-manual>Registrar leitura manualmente</button>
      </div>
    </section>`;

  host.querySelector("[data-book]")?.addEventListener("change", (e) => {
    state.ui.timerBookId = e.target.value;
    drawIdle();
  });
  host.querySelector("[data-go]")?.addEventListener("click", async () => {
    const start = parseInt(host.querySelector("[data-start]").value, 10);
    if (!(start >= 0)) { toast("Informe a página inicial."); return; }
    if (b.totalPages && start > b.totalPages) { toast(`O livro tem ${b.totalPages} páginas.`); return; }
    state.ui.timerBookId = null;
    await startSession(b.id, start);
  });
  host.querySelector("[data-manual]").addEventListener("click", () => openManual(id));
}

function drawRunning() {
  const a = state.active;
  const b = state.books.get(a.bookId);
  const paused = a.pausedAtMs != null;
  const long = !askedLong && elapsedMs(a) > SIX_HOURS;

  host.innerHTML = `
    <section class="screen screen--padded timer timer--running">
      ${long ? `
        <div class="card timer__long">
          <p>Esta leitura ficou aberta por ${Math.floor(elapsedMs(a) / 3600000)} horas. Ajustar o tempo?</p>
          <label class="field">
            <span class="field__label">Duração em minutos</span>
            <input class="input" data-fix inputmode="numeric" placeholder="Ex.: 40">
          </label>
          <div class="row">
            <button class="btn" data-keep>Manter</button>
            <button class="btn btn--primary" data-adjust>Ajustar</button>
          </div>
        </div>` : ""}
      <div class="timer__now">
        <p class="eyebrow">${paused ? "Pausado" : "Lendo"}</p>
        <p class="timer__title timer__title--center">${esc(b.title)}</p>
        <p class="caption">Desde a página ${a.startPage}</p>
      </div>
      <p class="timer__clock" data-clock aria-live="off">${clock(elapsedMs(a))}</p>
      <div class="timer__actions">
        <button class="btn" data-pause>${paused ? "Retomar" : "Pausar"}</button>
        <button class="btn btn--primary" data-end>Encerrar</button>
      </div>
    </section>`;

  const el = host.querySelector("[data-clock]");
  // só redesenha; o valor sempre vem do relógio
  if (!paused) tick = setInterval(() => { el.textContent = clock(elapsedMs()); }, 250);

  host.querySelector("[data-pause]").addEventListener("click", () => (paused ? resumeSession() : pauseSession()));
  host.querySelector("[data-end]").addEventListener("click", async () => {
    await pauseSession(); // o tempo para no toque; "Voltar à leitura" retoma
    view = "ending";
    draw();
  });
  host.querySelector("[data-keep]")?.addEventListener("click", () => { askedLong = true; draw(); });
  host.querySelector("[data-adjust]")?.addEventListener("click", async () => {
    const m = parseInt(host.querySelector("[data-fix]").value, 10);
    if (!(m > 0)) { toast("Informe a duração em minutos."); return; }
    askedLong = true;
    await setActiveDuration(m * 60000);
  });
}

function drawEnding() {
  const a = state.active;
  const b = state.books.get(a.bookId);
  host.innerHTML = `
    <section class="screen screen--padded timer">
      <div class="timer__now">
        <p class="eyebrow">Encerrar leitura</p>
        <p class="timer__title timer__title--center">${esc(b.title)}</p>
        <p class="timer__clock timer__clock--small">${clock(elapsedMs(a))}</p>
      </div>
      <form class="stack" data-form novalidate>
        <label class="field">
          <span class="field__label">Página final</span>
          <input class="input" name="end" inputmode="numeric" pattern="[0-9]*" autocomplete="off" required>
          <span class="field__hint">Começou na página ${a.startPage}${b.totalPages ? ` · o livro tem ${b.totalPages}` : ""}.</span>
        </label>
        <p class="note timer__error" data-error role="alert"></p>
        <button class="btn btn--primary btn--block" type="submit">Salvar leitura</button>
        <button class="btn btn--block" type="button" data-back>Voltar à leitura</button>
        <button class="btn btn--text btn--danger btn--block" type="button" data-discard>Descartar esta leitura</button>
      </form>
    </section>`;

  const form = host.querySelector("[data-form]");
  const err = host.querySelector("[data-error]");
  form.end.focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const end = parseInt(form.end.value, 10);
    const ok = await checkEndPage(b, a.startPage, end, err);
    if (!ok) return;
    const markRead = !!b.totalPages && end === b.totalPages && b.status !== "lido"
      && await confirm("Marcar como lido?", { ok: "Marcar como lido", cancel: "Agora não" });
    view = "saving";
    const s = await finishSession(end, { markRead });
    summary = s;
    view = "summary";
    draw();
  });
  host.querySelector("[data-back]").addEventListener("click", async () => {
    view = "idle";
    await resumeSession();
    draw();
  });
  host.querySelector("[data-discard]").addEventListener("click", async () => {
    if (!await confirm("Descartar esta leitura? O tempo não será registrado.", { ok: "Descartar", danger: true })) return;
    view = "idle";
    await cancelSession();
  });
}

/** Validações da seção 4.2: releitura pede confirmação; acima do total pede correção. */
async function checkEndPage(b, start, end, err) {
  err.textContent = "";
  if (!(end >= 0)) { err.textContent = "Informe a página final."; return false; }
  if (b.totalPages && end > b.totalPages) {
    err.textContent = `O livro tem ${b.totalPages} páginas. Confira a página final.`;
    return false;
  }
  if (end < start) {
    return confirm("A página final é menor que a inicial. Você voltou páginas (releitura)?", {
      ok: "Sim, releitura", cancel: "Corrigir",
    });
  }
  return true;
}

/** "Você leu 18 páginas em 23 minutos." Sem ritmo. */
export function summaryText(s) {
  const p = s.pagesRead;
  const pages = `${p} ${p === 1 ? "página" : "páginas"}`;
  return s.durationSec > 0 ? `Você leu ${pages} em ${duration(s.durationSec)}.` : `Você leu ${pages}.`;
}

function drawSummary() {
  const b = state.books.get(summary.bookId);
  host.innerHTML = `
    <section class="screen screen--padded timer">
      <div class="timer__summary">
        <p class="eyebrow">Leitura registrada</p>
        <p class="timer__summary-text">${esc(summaryText(summary))}</p>
        ${b ? `<p class="muted">${esc(b.title)} · ${esc(pagesOf(b))}${b.status === "lido" ? " · lido" : ""}</p>` : ""}
      </div>
      <button class="btn btn--primary btn--block" data-ok>Concluir</button>
    </section>`;
  host.querySelector("[data-ok]").addEventListener("click", () => {
    summary = null;
    view = "idle";
    draw();
  });
}

/* ---------- lançamento manual ---------- */

export function openManual(bookId) {
  const sheet = openSheet({ title: "Registrar leitura" });
  const books = [...state.books.values()].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  const form = html(`
    <form class="stack" novalidate>
      <label class="field"><span class="field__label">Livro</span>
        <select class="select" name="book">
          ${books.map((b) => `<option value="${esc(b.id)}" ${b.id === bookId ? "selected" : ""}>${esc(b.title)}</option>`).join("")}
        </select></label>
      <label class="field"><span class="field__label">Data</span>
        <input class="input" type="date" name="date" max="${today()}" value="${today()}" required></label>
      <div class="row">
        <label class="field"><span class="field__label">Página inicial</span>
          <input class="input" name="start" inputmode="numeric" pattern="[0-9]*"></label>
        <label class="field"><span class="field__label">Página final</span>
          <input class="input" name="end" inputmode="numeric" pattern="[0-9]*"></label>
      </div>
      <label class="field"><span class="field__label">Duração em minutos (opcional)</span>
        <input class="input" name="minutes" inputmode="numeric" pattern="[0-9]*"></label>
      <p class="note timer__error" data-error role="alert"></p>
      <button class="btn btn--primary btn--block" type="submit">Registrar</button>
    </form>`);
  sheet.body.append(form);
  const fillStart = () => { form.start.value = state.books.get(form.book.value)?.currentPage || 0; };
  fillStart();
  form.book.addEventListener("change", fillStart);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = form.querySelector("[data-error]");
    const b = state.books.get(form.book.value);
    const start = parseInt(form.start.value, 10);
    const end = parseInt(form.end.value, 10);
    const minutes = parseInt(form.minutes.value, 10) || 0;
    if (!form.date.value || form.date.value > today()) { err.textContent = "Escolha uma data até hoje."; return; }
    if (!(start >= 0)) { err.textContent = "Informe a página inicial."; return; }
    if (!await checkEndPage(b, start, end, err)) return;
    const markRead = !!b.totalPages && end === b.totalPages && b.status !== "lido"
      && await confirm("Marcar como lido?", { ok: "Marcar como lido", cancel: "Agora não" });
    const s = await addManualSession({ bookId: b.id, date: form.date.value, startPage: start, endPage: end, minutes, markRead });
    sheet.close();
    toast(summaryText(s));
  });
}

/* ---------- tela acesa e eventos globais ---------- */

let lock = null;

async function syncWakeLock() {
  const want = state.settings.keepAwake && state.active && state.active.pausedAtMs == null
    && document.visibilityState === "visible";
  try {
    if (want && !lock && navigator.wakeLock) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } else if (!want && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; } // sem suporte ou negado: ignora sem erro
}

export function init() {
  on("active", () => { syncWakeLock(); if (host) draw(); });
  on("settings", syncWakeLock);
  on("books", () => { if (host && view === "idle" && !state.active) draw(); });
  document.addEventListener("visibilitychange", () => {
    syncWakeLock();
    if (document.visibilityState === "visible" && host) draw(); // relógio volta certo
  });
  syncWakeLock();
}

/** Sessão aberta há mais de 6 horas na abertura do app: vale levar o usuário direto à aba Ler. */
export const needsLongCheck = () => !!state.active && elapsedMs() > SIX_HOURS;
