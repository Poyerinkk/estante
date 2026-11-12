// Inicialização e roteador de telas.

import { state, load, on } from "./state.js";
import { icons } from "./ui/icons.js";
import { $, $$ } from "./ui/dom.js";
import * as shelf from "./ui/shelf.js";
import * as settings from "./ui/settings.js";
import { openAddBook } from "./ui/addBook.js";

const TABS = {
  estante: { title: "Estante", screen: shelf },
  ler: { title: "Ler", screen: placeholder("O cronômetro de leitura chega na próxima fase.") },
  dados: { title: "Dados", screen: placeholder("As estatísticas chegam numa fase seguinte.") },
  ajustes: { title: "Ajustes", screen: settings },
};

let current = null;

function placeholder(text) {
  return {
    render(main) {
      main.innerHTML = `<section class="screen screen--padded"><p class="empty">${text}</p></section>`;
    },
  };
}

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

  go(location.hash.slice(1) || "estante");
}

start();
