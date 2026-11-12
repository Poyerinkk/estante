// Inicialização e roteador de telas.

import { state, load, on, emit } from "./state.js";
import * as db from "./db.js";
import { edgeColor } from "./lib/cover.js";
import { icons } from "./ui/icons.js";
import { $, $$ } from "./ui/dom.js";
import * as shelf from "./ui/shelf.js";
import * as settings from "./ui/settings.js";
import * as timer from "./ui/timer.js";
import * as stats from "./ui/stats.js";
import { openAddBook } from "./ui/addBook.js";

const TABS = {
  estante: { title: "Estante", screen: shelf },
  ler: { title: "Ler", screen: timer },
  dados: { title: "Dados", screen: stats },
  ajustes: { title: "Ajustes", screen: settings },
};

let current = null;

function go(tab) {
  if (!TABS[tab]) tab = "estante";
  current?.screen.leave?.();
  current = TABS[tab];
  $$(".tab").forEach((b) => b.removeAttribute("aria-current"));
  $(`.tab[data-tab="${tab}"]`).setAttribute("aria-current", "page");
  $("#topbar-title").textContent = current.title;
  const actions = $("#topbar-actions");
  actions.innerHTML = "";
  current.screen.actions?.(actions);
  const main = $("#main");
  main.innerHTML = "";
  current.screen.render(main);
  if (location.hash.slice(1) !== tab) history.replaceState(history.state, "", `#${tab}`);
}

/* ---------- tema ---------- */

const darkQuery = matchMedia("(prefers-color-scheme: dark)");

export function applyTheme() {
  const pref = state.settings.theme;
  const theme = pref === "auto" ? (darkQuery.matches ? "dark" : "light") : pref;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("estante.theme", pref); } catch {}
}

/* ---------- partida ---------- */

async function start() {
  $$("[data-icon]").forEach((el) => { el.outerHTML = icons[el.dataset.icon]; });
  await load();
  applyTheme();
  darkQuery.addEventListener("change", applyTheme);
  on("settings", applyTheme);

  // pede ao navegador para não apagar os dados quando faltar espaço
  navigator.storage?.persist?.().catch(() => {});

  $(".tabbar").addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) go(b.dataset.tab);
  });
  addEventListener("hashchange", () => go(location.hash.slice(1)));
  on("add-book", () => openAddBook());
  on("go", (tab) => go(tab));

  // ponto discreto na aba Ler enquanto houver leitura em andamento
  const markReading = () => $('.tab[data-tab="ler"]').classList.toggle("is-reading", !!state.active);
  on("active", markReading);
  markReading();
  timer.init();

  go(timer.needsLongCheck() ? "ler" : location.hash.slice(1) || "estante");

  // offline depois da primeira carga. A versão nova do sw.js entra em vigor na próxima abertura:
  // a página atual nunca é recarregada, nem no meio de uma leitura cronometrada.
  backfillSpineEdges();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

/** Livros salvos antes da lombada feita da capa: calcula a cor da borda uma vez, em segundo plano. */
async function backfillSpineEdges() {
  const todo = [...state.books.values()].filter((b) => b.cover instanceof Blob && !b.spineEdge);
  if (!todo.length) return;
  for (const b of todo) b.spineEdge = await edgeColor(b.cover).catch(() => "");
  await db.write(todo.filter((b) => b.spineEdge).map((b) => ({ put: "books", value: b })));
  emit("books");
}

start();
