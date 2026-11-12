// A estante: páginas de 1 a 4 prateleiras, livros de lombada.
// Modo de edição e arrastar chegam na fase 6; abrir o livro, na fase 5.

import { state, on, emit, booksOn, spineWidth } from "../state.js";
import { inkFor } from "../lib/cover.js";
import { icons } from "./icons.js";
import { esc, toast } from "./dom.js";

const PER_PAGE = 4;
let host = null;
let unsub = false;

export function actions(bar) {
  bar.innerHTML = `
    <button class="icon-btn" data-add aria-label="Adicionar livro">${icons.plus}</button>
    <button class="link-btn" data-edit>Editar</button>`;
  bar.querySelector("[data-add]").addEventListener("click", () => emit("add-book"));
  bar.querySelector("[data-edit]").addEventListener("click", () =>
    toast("O modo de edição chega numa próxima fase."));
}

export function render(main) {
  host = main;
  if (!unsub) {
    on("books", () => host?.isConnected && draw());
    unsub = true;
  }
  draw();
}

export function leave() { host = null; }

// pequena variação de altura por livro (90% a 100%), estável: vem do id
function heightFactor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (0.9 + (h % 11) / 100).toFixed(2);
}

function spine(b) {
  const w = spineWidth(b);
  const color = b.spineColor || "";
  const style = [`--w:${w}px`, `--h:${heightFactor(b.id)}`];
  if (color) style.push(`--c:${color}`, `--ink:${inkFor(color)}`);
  const cls = ["spine", w >= 30 && b.author ? "spine--wide" : "", `is-${b.status}`].filter(Boolean).join(" ");
  const label = [b.title, b.author].filter(Boolean).join(", ");
  return `
    <button class="${cls}" style="${style.join(";")}" data-book="${esc(b.id)}" aria-label="${esc(label)}">
      <span class="spine__label" aria-hidden="true">
        <span class="spine__title">${esc(b.title)}</span>
        ${b.author ? `<span class="spine__author">${esc(b.author)}</span>` : ""}
      </span>
    </button>`;
}

function shelfEl(s) {
  const books = booksOn(s.id);
  return `
    <div class="shelf" data-shelf="${esc(s.id)}">
      <span class="shelf__name">${esc(s.name)}</span>
      <div class="shelf__row">${books.map(spine).join("")}</div>
      <div class="shelf__board" aria-hidden="true"></div>
    </div>`;
}

function draw() {
  const pages = [];
  for (let i = 0; i < state.shelves.length; i += PER_PAGE) pages.push(state.shelves.slice(i, i + PER_PAGE));
  const empty = state.books.size === 0;
  const prevScroll = host.querySelector(".pages")?.scrollLeft || 0;
  const redraw = !!host.querySelector(".shelf-screen"); // atualização de dados: sem fade

  host.innerHTML = `
    <section class="screen shelf-screen${empty ? " is-empty" : ""}${redraw ? " is-static" : ""}" aria-label="Estante">
      <div class="pages">
        ${pages.map((p, i) => `
          <div class="page" data-page="${i}" aria-label="Página ${i + 1} de ${pages.length}">
            ${p.map(shelfEl).join("")}
          </div>`).join("")}
      </div>
      ${empty ? `
        <div class="shelf-empty">
          <p class="shelf-empty__title">A estante está vazia.</p>
          <p class="shelf-empty__text">Comece pelo livro que está lendo agora.</p>
          <button class="btn btn--primary" data-add>Adicionar livro</button>
        </div>` : ""}
      <div class="dots" aria-hidden="true" ${pages.length < 2 ? "hidden" : ""}>
        ${pages.map((_, i) => `<span class="dot${i === 0 ? " is-on" : ""}"></span>`).join("")}
      </div>
    </section>`;

  host.querySelector(".shelf-empty [data-add]")?.addEventListener("click", () => emit("add-book"));

  const scroller = host.querySelector(".pages");
  scroller.scrollLeft = prevScroll;
  const dots = [...host.querySelectorAll(".dot")];
  let raf = 0;
  scroller.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.round(scroller.scrollLeft / scroller.clientWidth);
      dots.forEach((d, j) => d.classList.toggle("is-on", i === j));
    });
  }, { passive: true });
}
