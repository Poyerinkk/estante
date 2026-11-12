// Dados: as análises da seção 4.3, na ordem pedida, com gráficos SVG feitos à mão e monocromáticos.
// Nada é inventado: sem leituras, cada seção diz isso e para.

import { state, on } from "../state.js";
import { isoDate, parseDate, formatDate, today } from "../lib/time.js";
import { esc } from "./dom.js";

let host = null;
let unit = "pages"; // pages | time, para "Por período"
let subscribed = false;

export function render(main) {
  host = main;
  if (!subscribed) {
    on("sessions", () => host?.isConnected && draw());
    on("books", () => host?.isConnected && draw());
    on("settings", () => host?.isConnected && draw());
    subscribed = true;
  }
  draw();
}

export function leave() { host = null; }

/* ---------- utilidades ---------- */

const nf = (n) => Math.round(n).toLocaleString("pt-BR");
const pagesTxt = (n) => `${nf(n)} ${Math.round(n) === 1 ? "página" : "páginas"}`;

/** 45 min · 3 h 20 min */
function timeTxt(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** segunda-feira da semana de d */
const monday = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (key) => MONTHS[+key.slice(5) - 1];

function byDay(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const e = m.get(s.date) || { pages: 0, sec: 0 };
    e.pages += s.pagesRead;
    e.sec += s.durationSec;
    m.set(s.date, e);
  }
  return m;
}

function sumRange(days, from, to) { // datas "YYYY-MM-DD", inclusivas
  let pages = 0, sec = 0;
  for (const [d, v] of days) if (d >= from && d <= to) { pages += v.pages; sec += v.sec; }
  return { pages, sec };
}

/** sequência atual (termina hoje ou ontem) e a maior */
function streaks(days) {
  const dates = [...days.keys()].filter((d) => days.get(d).pages > 0 || days.get(d).sec > 0).sort();
  let best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev && isoDate(addDays(parseDate(prev), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const set = new Set(dates);
  let cur = 0;
  let day = set.has(today()) ? new Date() : addDays(new Date(), -1);
  while (set.has(isoDate(day))) { cur++; day = addDays(day, -1); }
  return { cur, best };
}

/* ---------- gráficos ---------- */

const W = 358;

/** Barras verticais. values: números; labels: textos curtos sob as barras. */
function bars(values, labels, { fmt = nf, label = "" } = {}) {
  const H = 128, top = 16, bottom = 20, n = values.length;
  const max = Math.max(...values, 0);
  const slot = W / n, bw = Math.min(18, slot * 0.6);
  const ch = H - top - bottom;
  const rects = values.map((v, i) => {
    const h = max ? Math.max(v > 0 ? 2 : 0, (v / max) * ch) : 0;
    const x = i * slot + (slot - bw) / 2;
    return `
      <rect x="${x.toFixed(1)}" y="${(top + ch - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="chart__bar"><title>${esc(labels[i])}: ${esc(fmt(v))}</title></rect>
      <text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 6}" class="chart__label" text-anchor="middle">${esc(labels[i])}</text>`;
  }).join("");
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}. Máximo: ${esc(fmt(max))}.">
      <line x1="0" x2="${W}" y1="${top + ch + 0.5}" y2="${top + ch + 0.5}" class="chart__axis"/>
      ${max ? `<text x="0" y="10" class="chart__label">${esc(fmt(max))}</text>` : ""}
      ${rects}
    </svg>`;
}

/** Barras horizontais com rótulo e valor, para listas curtas (faixas do dia, dificuldade). */
function hbars(rows, { fmt = nf } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return `
    <ul class="list hbars">
      ${rows.map((r) => `
        <li class="hbar">
          <span class="hbar__label">${esc(r.label)}</span>
          <span class="hbar__track"><span class="hbar__fill" style="width:${max ? (r.value / max) * 100 : 0}%"></span></span>
          <span class="hbar__value">${esc(fmt(r.value))}</span>
        </li>`).join("")}
    </ul>`;
}

/** Calendário: 26 semanas em colunas, de segunda a domingo; 4 intensidades de um tom só. */
function calendar(days) {
  const weeks = 26, cell = 11, gap = 2, step = cell + gap;
  const start = addDays(monday(new Date()), -7 * (weeks - 1));
  const vals = [];
  for (let w = 0; w < weeks; w++) for (let d = 0; d < 7; d++) {
    const date = addDays(start, w * 7 + d);
    const v = days.get(isoDate(date));
    vals.push({ w, d, date, pages: v?.pages || 0, sec: v?.sec || 0 });
  }
  // níveis pelos quartis dos dias com leitura: o calendário se ajusta ao próprio ritmo
  const nz = vals.filter((v) => v.pages > 0 || v.sec > 0).map((v) => v.pages || 1).sort((a, b) => a - b);
  const q = (p) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] || 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => {
    if (!(v.pages > 0 || v.sec > 0)) return 0;
    const p = v.pages || 1;
    return p <= cuts[0] ? 1 : p <= cuts[1] ? 2 : p <= cuts[2] ? 3 : 4;
  };
  const now = new Date();
  const h = 7 * step + 14;
  let monthMarks = "";
  let lastMonth = -1, lastW = -9;
  for (let w = 0; w < weeks; w++) {
    const d = addDays(start, w * 7);
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      // rótulo só com espaço desde o anterior, para não encavalar
      if (w < weeks - 1 && w - lastW >= 3 && (lastW = w) >= 0) monthMarks += `<text x="${w * step}" y="${h - 2}" class="chart__label">${MONTHS[lastMonth]}</text>`;
    }
  }
  const cells = vals.filter((v) => v.date <= now).map((v) =>
    `<rect x="${v.w * step}" y="${v.d * step}" width="${cell}" height="${cell}" rx="2" class="cal cal--${level(v)}"><title>${esc(formatDate(isoDate(v.date)))}: ${esc(pagesTxt(v.pages))}</title></rect>`).join("");
  return `
    <svg class="chart chart--cal" viewBox="0 0 ${weeks * step - gap} ${h}" role="img" aria-label="Dias com leitura nas últimas 26 semanas: ${nz.length}.">
      ${cells}${monthMarks}
    </svg>
    <div class="cal-legend" aria-hidden="true"><span>menos</span>${[0, 1, 2, 3, 4].map((l) => `<i class="cal-swatch cal--${l}"></i>`).join("")}<span>mais</span></div>`;
}

/* ---------- seções ---------- */

const section = (title, body, note = "") => `
  <section class="stats__section">
    <h2 class="section-title">${title}</h2>
    ${note ? `<p class="caption">${note}</p>` : ""}
    ${body}
  </section>`;

const EMPTY = `<p class="muted">Ainda não há leituras registradas.</p>`;

function summary(days) {
  const t = today();
  const now = new Date();
  const ranges = [
    ["Hoje", t, t],
    ["Semana", isoDate(monday(now)), t],
    ["Mês", isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), t],
    ["Ano", isoDate(new Date(now.getFullYear(), 0, 1)), t],
  ];
  const st = streaks(days);
  let best = null;
  for (const [d, v] of days) if (!best || v.pages > best.v.pages || (v.pages === best.v.pages && v.sec > best.v.sec)) best = { d, v };
  return `
    <div class="tiles">
      ${ranges.map(([l, a, b]) => { const s = sumRange(days, a, b); return `
        <div class="tile">
          <p class="eyebrow">${l}</p>
          <p class="tile__value">${nf(s.pages)}<span> p.</span></p>
          <p class="caption">${timeTxt(s.sec)}</p>
        </div>`; }).join("")}
    </div>
    <dl class="facts">
      <div><dt>Sequência atual</dt><dd>${st.cur} ${st.cur === 1 ? "dia" : "dias"}</dd></div>
      <div><dt>Maior sequência</dt><dd>${st.best} ${st.best === 1 ? "dia" : "dias"}</dd></div>
      ${best ? `<div><dt>Melhor dia</dt><dd>${esc(formatDate(best.d))} · ${pagesTxt(best.v.pages)}</dd></div>` : ""}
    </dl>`;
}

function periods(sessions) {
  const now = new Date();
  const val = (s) => (unit === "pages" ? s.pagesRead : s.durationSec / 60);
  const fmt = unit === "pages" ? nf : (m) => timeTxt(m * 60);

  const weekStarts = Array.from({ length: 12 }, (_, i) => addDays(monday(now), -7 * (11 - i)));
  const weekKeys = weekStarts.map(isoDate);
  const w = new Array(12).fill(0);
  for (const s of sessions) {
    const k = isoDate(monday(parseDate(s.date)));
    const i = weekKeys.indexOf(k);
    if (i >= 0) w[i] += val(s);
  }
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  const m = new Array(12).fill(0);
  for (const s of sessions) {
    const i = months.indexOf(s.date.slice(0, 7));
    if (i >= 0) m[i] += val(s);
  }
  const what = unit === "pages" ? "Páginas" : "Tempo";
  return `
    <div class="segmented stats__unit" role="group" aria-label="Medida">
      <button type="button" data-unit="pages" aria-pressed="${unit === "pages"}">Páginas</button>
      <button type="button" data-unit="time" aria-pressed="${unit === "time"}">Tempo</button>
    </div>
    <p class="eyebrow">Por semana</p>
    ${bars(w, weekStarts.map((d) => `${d.getDate()}/${d.getMonth() + 1}`).map((l, i) => (i % 2 ? "" : l)), { fmt, label: `${what} por semana, últimas 12 semanas` })}
    <p class="eyebrow">Por mês</p>
    ${bars(m, months.map(monthLabel), { fmt, label: `${what} por mês, últimos 12 meses` })}`;
}

function booksSection() {
  const all = [...state.books.values()];
  const count = (st) => all.filter((b) => b.status === st).length;
  const done = all.filter((b) => b.status === "lido" && b.finishedOn);
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  const perMonth = months.map((k) => done.filter((b) => b.finishedOn.startsWith(k)).length);
  const years = [...new Set(done.map((b) => b.finishedOn.slice(0, 4)))].sort();
  return `
    <dl class="facts facts--row">
      <div><dt>Lidos</dt><dd>${count("lido")}</dd></div>
      <div><dt>Lendo</dt><dd>${count("lendo")}</dd></div>
      <div><dt>Quero ler</dt><dd>${count("quero_ler")}</dd></div>
    </dl>
    ${done.length ? `
      <p class="eyebrow">Concluídos por mês</p>
      ${bars(perMonth, months.map(monthLabel), { label: "Livros concluídos por mês, últimos 12 meses" })}
      <p class="eyebrow">Concluídos por ano</p>
      ${hbars(years.map((y) => ({ label: y, value: done.filter((b) => b.finishedOn.startsWith(y)).length })))}`
      : `<p class="muted">Nenhum livro marcado como lido com data de conclusão.</p>`}`;
}

const DIFF = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };

function perBook(sessions) {
  const ids = [...new Set(sessions.map((s) => s.bookId))].filter((id) => state.books.has(id));
  if (!ids.length) return EMPTY;
  const rows = ids.map((id) => {
    const b = state.books.get(id);
    const ss = sessions.filter((s) => s.bookId === id);
    const pages = ss.reduce((a, s) => a + s.pagesRead, 0);
    const sec = ss.reduce((a, s) => a + s.durationSec, 0);
    const span = b.startedOn && b.finishedOn
      ? Math.round((parseDate(b.finishedOn) - parseDate(b.startedOn)) / 86400000) : null;
    return { b, pages, sec, n: ss.length, span };
  }).sort((a, b) => b.pages - a.pages);
  return `
    <ul class="list perbook">
      ${rows.map((r) => `
        <li class="perbook__item">
          <p class="perbook__title">${esc(r.b.title)}</p>
          <p class="caption">${[
            pagesTxt(r.pages), timeTxt(r.sec), `${r.n} ${r.n === 1 ? "sessão" : "sessões"}`,
            r.span != null ? `${r.span} ${r.span === 1 ? "dia" : "dias"} do início ao fim` : "",
            r.b.difficulty ? DIFF[r.b.difficulty] : "", r.b.rating ? `nota ${r.b.rating}` : "",
          ].filter(Boolean).map(esc).join(" · ")}</p>
        </li>`).join("")}
    </ul>`;
}

// ritmo: só sessões de mais de 5 minutos
const paceable = (sessions) => sessions.filter((s) => s.durationSec > 300);
const pph = (ss) => {
  const sec = ss.reduce((a, s) => a + s.durationSec, 0);
  return sec ? ss.reduce((a, s) => a + s.pagesRead, 0) / (sec / 3600) : 0;
};

function pace(sessions) {
  const ss = paceable(sessions);
  if (!ss.length) return `<p class="muted">Ainda não há sessões com mais de 5 minutos.</p>`;
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  const monthly = months.map((k) => pph(ss.filter((s) => s.date.startsWith(k))));
  const ids = [...new Set(ss.map((s) => s.bookId))].filter((id) => state.books.has(id));
  const rows = ids.map((id) => ({ label: state.books.get(id).title, value: pph(ss.filter((s) => s.bookId === id)) }))
    .sort((a, b) => b.value - a.value);
  return `
    <p class="stats__big">${nf(pph(ss))} <span>páginas por hora</span></p>
    <p class="eyebrow">Por mês</p>
    ${bars(monthly, months.map(monthLabel), { label: "Páginas por hora, por mês" })}
    <p class="eyebrow">Por livro</p>
    ${hbars(rows)}`;
}

function whenYouRead(sessions) {
  // lançamentos manuais não têm horário de verdade: ficam de fora
  const ss = sessions.filter((s) => s.source === "timer");
  if (!ss.length) return `<p class="muted">Ainda não há leituras cronometradas.</p>`;
  const bands = [["Madrugada", 0, 6], ["Manhã", 6, 12], ["Tarde", 12, 18], ["Noite", 18, 24]];
  const total = ss.reduce((a, s) => a + s.durationSec, 0) || 1;
  const rows = bands.map(([label, a, b]) => {
    const sec = ss.filter((s) => { const h = new Date(s.startedAt).getHours(); return h >= a && h < b; })
      .reduce((x, s) => x + s.durationSec, 0);
    return { label, value: sec };
  });
  return hbars(rows, { fmt: (v) => `${Math.round((v / total) * 100)}%` });
}

/** Só aparece com pelo menos 3 livros com dificuldade declarada e ritmo medido. */
function difficulty(sessions) {
  const ss = paceable(sessions);
  const books = [...state.books.values()].filter((b) => b.difficulty && ss.some((s) => s.bookId === b.id));
  if (books.length < 3) return "";
  const rows = Object.entries(DIFF).map(([k, label]) => {
    const group = books.filter((b) => b.difficulty === k);
    return { label: `${label} (${group.length})`, value: group.length ? pph(ss.filter((s) => group.some((b) => b.id === s.bookId))) : 0 };
  });
  return section("Dificuldade", hbars(rows), "Páginas por hora, pela dificuldade que você declarou.");
}

/* ---------- desenho ---------- */

function draw() {
  const sessions = state.sessions.filter((s) => state.books.has(s.bookId));
  const days = byDay(sessions);
  const has = sessions.length > 0;
  const showPace = state.settings.showPace;
  const scroll = host.querySelector(".screen")?.scrollTop || 0;
  const redraw = !!host.querySelector(".stats");

  host.innerHTML = `
    <section class="screen screen--padded stats${redraw ? " is-static" : ""}">
      ${section("Resumo", has ? summary(days) : EMPTY)}
      ${section("Dias lidos", has ? calendar(days) : EMPTY, has ? "Últimas 26 semanas." : "")}
      ${section("Por período", has ? periods(sessions) : EMPTY)}
      ${section("Livros", booksSection())}
      ${section("Por livro", perBook(sessions))}
      ${showPace ? section("Ritmo", has ? pace(sessions) : EMPTY, has ? "Considera apenas sessões com mais de 5 minutos." : "") : ""}
      ${section("Quando você lê", has ? whenYouRead(sessions) : EMPTY, has ? "Parte do tempo cronometrado em cada faixa do dia." : "")}
      ${showPace ? difficulty(sessions) : ""}
    </section>`;

  const screen = host.querySelector(".screen");
  screen.scrollTop = scroll;
  screen.querySelector(".stats__unit")?.addEventListener("click", (e) => {
    const u = e.target.closest("[data-unit]")?.dataset.unit;
    if (u && u !== unit) { unit = u; draw(); }
  });
}
