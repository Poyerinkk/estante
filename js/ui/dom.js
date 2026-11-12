// Pequenos utilitários de interface usados por todas as telas.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/** Confirmação com <dialog> nativo. Resolve true ou false. */
export function confirm(message, { ok = "Confirmar", cancel = "Cancelar", danger = false } = {}) {
  return new Promise((resolve) => {
    const d = html(`
      <dialog class="dialog">
        <p class="dialog__msg">${esc(message)}</p>
        <form method="dialog" class="dialog__actions">
          <button class="btn btn--text" value="no">${esc(cancel)}</button>
          <button class="btn ${danger ? "btn--danger" : "btn--primary"}" value="yes">${esc(ok)}</button>
        </form>
      </dialog>`);
    document.body.append(d);
    d.addEventListener("close", () => { resolve(d.returnValue === "yes"); d.remove(); });
    d.showModal();
  });
}

let toastTimer;
/** Aviso discreto que some sozinho. */
export function toast(message) {
  document.querySelector(".toast")?.remove();
  const t = html(`<div class="toast" role="status">${esc(message)}</div>`);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/** Folha sobreposta com barra de título e botão Voltar; fecha também pelo voltar do sistema. */
export function openSheet({ title = "", label = "Voltar" } = {}) {
  const el = html(`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet__col">
        <header class="sheet__bar">
          <button class="icon-btn" data-close aria-label="${esc(label)}">${ICON_BACK}</button>
          <h2 class="sheet__title"></h2>
          <div class="sheet__actions"></div>
        </header>
        <div class="sheet__body"></div>
      </div>
    </div>`);
  const titleEl = el.querySelector(".sheet__title");
  titleEl.textContent = title;
  document.body.append(el);
  history.pushState({ sheet: true }, "");

  let closed = false;
  const onPop = () => finish();
  const finish = () => {
    if (closed) return;
    closed = true;
    removeEventListener("popstate", onPop);
    el.classList.add("is-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 200);
    api.onclose?.();
  };
  addEventListener("popstate", onPop);
  el.querySelector("[data-close]").addEventListener("click", () => api.close());

  const api = {
    el,
    body: el.querySelector(".sheet__body"),
    actions: el.querySelector(".sheet__actions"),
    setTitle: (t) => { titleEl.textContent = t; },
    onback: null,   // se definido e devolver true, o Voltar foi tratado internamente
    onclose: null,
    close() {
      if (api.onback?.()) return;
      if (history.state?.sheet) history.back(); else finish();
    },
  };
  return api;
}

const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
