// A estante: páginas de 1 a 4 prateleiras, livros de lombada.
// Toque abre o livro. Pressão longa (450 ms) ou "Editar" entra no modo de edição:
// lombadas tremem, arrastar reordena (FLIP), "×" remove, prateleiras são geridas.

import {
  state, on, emit, booksOn, spineWidth, moveBook, removeBook, addShelf, renameShelf, deleteShelf,
} from "../state.js";
import { inkFor } from "../lib/cover.js";
import { icons } from "./icons.js";
import { esc, confirm, menu, formDialog, toast } from "./dom.js";
import { openBook } from "./bookOpen.js";

const PER_PAGE = 4;
const LONG_PRESS = 450;
const MOVE_CANCEL = 8;
const EDGE = 40;
const EDGE_WAIT = 600;
const FLIP_MS = 180;

let host = null;
let bar = null;
let editing = false;
let subscribed = false;

/* ---------- barra superior ---------- */

export function actions(el) {
  bar = el;
  bar.innerHTML = `
    <button class="icon-btn" data-add aria-label="Adicionar livro">${icons.plus}</button>
    <button class="link-btn" data-edit>${editing ? "Concluir" : "Editar"}</button>`;
  bar.querySelector("[data-add]").addEventListener("click", () => emit("add-book"));
  bar.querySelector("[data-edit]").addEventListener("click", () => setEditing(!editing));
}

function setEditing(on) {
  if (editing === on) return;
  editing = on;
  const btn = bar?.querySelector("[data-edit]");
  if (btn) btn.textContent = editing ? "Concluir" : "Editar";
  if (bar) bar.querySelector("[data-add]").hidden = editing;
  if (host) draw();
}

export function render(main) {
  host = main;
  if (!subscribed) {
    on("books", () => host?.isConnected && !drag && draw());
    subscribed = true;
  }
  draw();
}

export function leave() {
  editing = false;
  host = null;
}

/* ---------- desenho ---------- */

function hash(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function spine(b) {
  const w = spineWidth(b);
  const h = hash(b.id);
  const color = b.spineColor || "";
  // altura entre 90% e 100%, e um atraso de tremor próprio para não tremerem juntas
  const style = [`--w:${w}px`, `--h:${(0.9 + (h % 11) / 100).toFixed(2)}`, `--jd:-${h % 140}ms`];
  if (color) style.push(`--c:${color}`, `--ink:${inkFor(color)}`);
  const cls = ["spine", w >= 30 && b.author ? "spine--wide" : "", `is-${b.status}`].filter(Boolean).join(" ");
  const label = [b.title, b.author].filter(Boolean).join(", ");
  return `
    <div class="${cls}" style="${style.join(";")}" data-book="${esc(b.id)}" role="button" tabindex="0" aria-label="${esc(label)}">
      <span class="spine__label" aria-hidden="true">
        <span class="spine__title">${esc(b.title)}</span>
        ${b.author ? `<span class="spine__author">${esc(b.author)}</span>` : ""}
      </span>
      ${editing ? `<button class="spine__x" data-remove aria-label="Remover ${esc(b.title)}">${icons.close}</button>` : ""}
    </div>`;
}

function shelfEl(s) {
  const name = editing
    ? `<button class="shelf__name shelf__name--btn" data-shelf-menu aria-label="Opções da ${esc(s.name)}">${esc(s.name)} <span aria-hidden="true">···</span></button>`
    : `<span class="shelf__name">${esc(s.name)}</span>`;
  return `
    <div class="shelf" data-shelf="${esc(s.id)}">
      ${name}
      <div class="shelf__row">${booksOn(s.id).map(spine).join("")}</div>
      <div class="shelf__board" aria-hidden="true"></div>
    </div>`;
}

/** Posições atuais das lombadas, para animar o rearranjo (FLIP). */
function measure() {
  const m = new Map();
  host?.querySelectorAll(".spine[data-book]").forEach((el) => m.set(el.dataset.book, el.getBoundingClientRect()));
  return m;
}

const onScreen = (r) => r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;

function flip(before, els) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const el of els) {
    const a = before.get(el.dataset.book);
    if (!a) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if ((!dx && !dy) || !onScreen(a) || !onScreen(b)) continue;
    // só o "translate" individual: o tremor usa "rotate", e os dois convivem
    el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: FLIP_MS, easing: "ease-out" });
  }
}

function draw() {
  const pages = [];
  for (let i = 0; i < state.shelves.length; i += PER_PAGE) pages.push(state.shelves.slice(i, i + PER_PAGE));
  const empty = state.books.size === 0;
  const prevScroll = host.querySelector(".pages")?.scrollLeft || 0;
  const redraw = !!host.querySelector(".shelf-screen"); // atualização de dados: sem fade
  const before = redraw ? measure() : null;

  host.innerHTML = `
    <section class="screen shelf-screen${empty ? " is-empty" : ""}${redraw ? " is-static" : ""}${editing ? " is-editing" : ""}" aria-label="Estante">
      <div class="pages">
        ${pages.map((p, i) => `
          <div class="page" data-page="${i}" aria-label="Página ${i + 1} de ${pages.length}">
            ${p.map(shelfEl).join("")}
            ${editing && i === pages.length - 1 ? `
              <div class="shelf-add"><button class="btn btn--small" data-add-shelf>Adicionar prateleira</button></div>` : ""}
          </div>`).join("")}
      </div>
      ${empty && !editing ? `
        <div class="shelf-empty">
          <p class="shelf-empty__title">A estante está vazia.</p>
          <p class="shelf-empty__text">Comece pelo livro que está lendo agora.</p>
          <button class="btn btn--primary" data-add>Adicionar livro</button>
        </div>` : ""}
      <div class="dots" aria-hidden="true" ${pages.length < 2 ? "hidden" : ""}>
        ${pages.map((_, i) => `<span class="dot${i === 0 ? " is-on" : ""}"></span>`).join("")}
      </div>
    </section>`;

  const scroller = host.querySelector(".pages");
  scroller.scrollLeft = prevScroll;
  const dots = [...host.querySelectorAll(".dot")];
  const syncDots = () => {
    const i = Math.round(scroller.scrollLeft / scroller.clientWidth);
    dots.forEach((d, j) => d.classList.toggle("is-on", i === j));
  };
  syncDots();
  let raf = 0;
  scroller.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncDots);
  }, { passive: true });

  if (before) flip(before, host.querySelectorAll(".spine[data-book]"));
  bind();
}

/* ---------- interação ---------- */

let press = null;  // dedo na lombada, antes de virar pressão longa ou arrasto
let drag = null;   // arrasto em andamento
let blank = null;  // toque em área vazia (sai do modo de edição)
let swallowClick = false;

function bind() {
  const screen = host.querySelector(".shelf-screen");
  screen.querySelector(".shelf-empty [data-add]")?.addEventListener("click", () => emit("add-book"));
  screen.querySelector("[data-add-shelf]")?.addEventListener("click", async () => {
    await addShelf();
    const sc = host.querySelector(".pages");
    sc.scrollTo({ left: sc.scrollWidth, behavior: "smooth" });
  });
  screen.addEventListener("contextmenu", (e) => { if (e.target.closest(".spine")) e.preventDefault(); });
  screen.addEventListener("pointerdown", onDown);
  screen.addEventListener("click", onClick);
  screen.addEventListener("keydown", (e) => {
    const el = e.target.closest?.(".spine");
    if (el && (e.key === "Enter" || e.key === " ") && !editing) { e.preventDefault(); openBook(el.dataset.book, el); }
  });
}

function onDown(e) {
  if (e.button > 0 || drag) return;
  const el = e.target.closest(".spine");
  if (e.target.closest("button")) return;
  if (!el) {
    blank = editing ? { x: e.clientX, y: e.clientY } : null;
    return;
  }
  press = { el, id: el.dataset.book, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, armed: editing };
  if (!editing) {
    press.timer = setTimeout(() => {
      if (!press) return;
      navigator.vibrate?.(10);
      swallowClick = true;
      press.armed = true; // já pode arrastar sem soltar o dedo
      setEditing(true);
      press.el = host.querySelector(`.spine[data-book="${CSS.escape(press.id)}"]`);
    }, LONG_PRESS);
  }
  addEventListener("pointermove", onMove, { passive: false });
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onCancel);
}

function onMove(e) {
  if (drag) return dragMove(e);
  if (!press) return;
  press.x = e.clientX;
  press.y = e.clientY;
  const d = Math.hypot(e.clientX - press.x0, e.clientY - press.y0);
  if (!press.armed) {
    // mexeu antes dos 450 ms: é rolagem, não pressão longa
    if (d > MOVE_CANCEL) { clearTimeout(press.timer); press = null; detach(); }
    return;
  }
  if (d > 4 && press.el) startDrag(e);
}

function onUp(e) {
  if (drag) return drop();
  if (press) clearTimeout(press.timer);
  press = null;
  detach();
}

function onCancel() {
  if (press) clearTimeout(press.timer);
  press = null;
  if (drag) cancelDrag();
  detach();
}

function detach() {
  removeEventListener("pointermove", onMove);
  removeEventListener("pointerup", onUp);
  removeEventListener("pointercancel", onCancel);
}

// impede a rolagem da página enquanto o livro está preso ao dedo
document.addEventListener("touchmove", (e) => { if (drag || press?.armed) e.preventDefault(); }, { passive: false });

async function onClick(e) {
  if (swallowClick) { swallowClick = false; return; }
  const x = e.target.closest("[data-remove]");
  if (x) {
    const id = x.closest(".spine").dataset.book;
    const b = state.books.get(id);
    const ok = await confirm(`Remover "${b.title}" da estante? As leituras registradas também serão apagadas.`, {
      ok: "Remover", danger: true,
    });
    if (ok) await removeBook(id);
    return;
  }
  const m = e.target.closest("[data-shelf-menu]");
  if (m) return shelfMenu(m.closest(".shelf").dataset.shelf);

  const el = e.target.closest(".spine");
  if (el && !editing) return openBook(el.dataset.book, el);

  // toque numa área vazia sai do modo de edição (deslizar entre páginas, não)
  if (editing && !el && blank && !e.target.closest("button")
    && Math.hypot(e.clientX - blank.x, e.clientY - blank.y) < MOVE_CANCEL) setEditing(false);
  blank = null;
}

async function shelfMenu(id) {
  const s = state.shelves.find((x) => x.id === id);
  const choice = await menu([
    { value: "rename", label: "Renomear" },
    { value: "delete", label: "Apagar prateleira", danger: true },
  ], { label: s.name });
  if (choice === "rename") {
    const v = await formDialog("Renomear prateleira", [{ name: "name", label: "Nome", value: s.name }]);
    if (v?.name) await renameShelf(id, v.name);
  }
  if (choice === "delete") {
    if (state.shelves.length < 2) { toast("A estante precisa de pelo menos uma prateleira."); return; }
    const n = booksOn(id).length;
    const first = state.shelves[0].id === id;
    const msg = n
      ? `Apagar "${s.name}"? ${n === 1 ? "O livro passa" : `Os ${n} livros passam`} para a prateleira ${first ? "seguinte" : "anterior"}.`
      : `Apagar "${s.name}"?`;
    if (await confirm(msg, { ok: "Apagar", danger: true })) await deleteShelf(id);
  }
}

/* ---------- arrastar ---------- */

function startDrag(e) {
  const el = press.el;
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add("is-ghost");
  ghost.querySelector(".spine__x")?.remove();
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  document.body.append(ghost);
  el.classList.add("is-placeholder");
  drag = { id: press.id, el, ghost, x0: press.x0, y0: press.y0, edgeTimer: null, edgeSide: 0 };
  press = null;
  dragMove(e);
}

function dragMove(e) {
  e.preventDefault?.();
  const { ghost, el } = drag;
  const x = e.clientX, y = e.clientY;
  ghost.style.transform = `translate(${x - drag.x0}px, ${y - drag.y0}px) scale(1.06)`;

  const scroller = host.querySelector(".pages");
  const page = scroller.children[Math.round(scroller.scrollLeft / scroller.clientWidth)];
  const shelves = [...page.querySelectorAll(".shelf")];
  // prateleira pela posição vertical do dedo
  let shelf = shelves.find((s) => { const r = s.getBoundingClientRect(); return y >= r.top && y < r.bottom; });
  if (!shelf) shelf = y < shelves[0].getBoundingClientRect().top ? shelves[0] : shelves.at(-1);
  const row = shelf.querySelector(".shelf__row");
  // posição na fileira pela horizontal, comparada ao centro das vizinhas
  const others = [...row.children].filter((c) => c !== el);
  const index = others.filter((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 < x; }).length;
  const ref = others[index] || null;
  if (el.parentElement !== row || el.nextElementSibling !== ref) {
    const before = measure();
    row.insertBefore(el, ref);
    flip(before, host.querySelectorAll(".spine[data-book]:not(.is-placeholder)"));
  }

  // dedo parado perto da borda troca de página, sem soltar o livro
  const pr = scroller.getBoundingClientRect();
  const side = x < pr.left + EDGE ? -1 : x > pr.right - EDGE ? 1 : 0;
  if (side !== drag.edgeSide) {
    clearTimeout(drag.edgeTimer);
    drag.edgeSide = side;
    if (side) drag.edgeTimer = setTimeout(function turn() {
      if (!drag) return;
      scroller.scrollBy({ left: side * scroller.clientWidth, behavior: "smooth" });
      drag.edgeTimer = setTimeout(turn, EDGE_WAIT + 300);
    }, EDGE_WAIT);
  }
}

async function drop() {
  const { id, el, ghost } = drag;
  clearTimeout(drag.edgeTimer);
  detach();
  const shelfId = el.closest(".shelf").dataset.shelf;
  const index = [...el.parentElement.children].indexOf(el);
  // o fantasma assenta no lugar e some
  const r = el.getBoundingClientRect();
  const g = ghost.getBoundingClientRect();
  await ghost.animate(
    [{ transform: ghost.style.transform }, { transform: `translate(${r.left - parseFloat(ghost.style.left)}px, ${r.top - parseFloat(ghost.style.top)}px)` }],
    { duration: g.width ? 140 : 0, easing: "ease-out", fill: "forwards" },
  ).finished.catch(() => {});
  ghost.remove();
  el.classList.remove("is-placeholder");
  drag = null;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 50);
  await moveBook(id, shelfId, index); // grava ao soltar; rebalance() empurra o excesso
}

function cancelDrag() {
  clearTimeout(drag.edgeTimer);
  drag.ghost.remove();
  drag = null;
  draw();
}
