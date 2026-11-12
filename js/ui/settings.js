// Ajustes (seção 4.4): aparência, editoras prioritárias, estatísticas, leitura, dados e avançado.

import { state, saveSettings, DEFAULT_PUBLISHERS } from "../state.js";
import { getMeta } from "../db.js";
import { exportBackup, readBackup, importBackup, eraseAll } from "../lib/backup.js";
import { esc, confirm, menu, toast } from "./dom.js";

export const APP_VERSION = "1.0";
const THEMES = [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]];
let host = null;

export function render(main) {
  host = main;
  draw();
}

export function leave() { host = null; }

const toggle = (key, label, hint = "") => `
  <label class="switch">
    <span class="switch__text">${esc(label)}${hint ? `<span class="caption">${esc(hint)}</span>` : ""}</span>
    <input type="checkbox" role="switch" data-toggle="${key}" ${state.settings[key] ? "checked" : ""}>
    <span class="switch__ui" aria-hidden="true"></span>
  </label>`;

async function backupNote() {
  const last = await getMeta("lastBackupAt");
  if (!last) return state.books.size ? "Nenhum backup feito ainda." : "";
  const days = Math.floor((Date.now() - new Date(last)) / 86400000);
  const when = days === 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
  return days > 30 ? `Último backup ${when}. Vale fazer um novo.` : `Último backup ${when}.`;
}

function draw() {
  const s = state.settings;
  const pubs = s.priorityPublishers;
  const top = host.querySelector(".screen")?.scrollTop || 0;
  const redraw = !!host.querySelector(".settings");

  host.innerHTML = `
    <section class="screen screen--padded settings${redraw ? " is-static" : ""}">
      <div class="settings-group">
        <h2 class="section-title">Aparência</h2>
        <div class="segmented" role="group" aria-label="Tema">
          ${THEMES.map(([v, l]) => `<button type="button" data-theme-opt="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join("")}
        </div>
      </div>

      <div class="settings-group">
        <h2 class="section-title">Editoras prioritárias</h2>
        <p class="caption">Na busca, as edições destas editoras aparecem primeiro, nesta ordem.</p>
        <ul class="list pubs">
          ${pubs.map((p, i) => `
            <li class="pub" data-i="${i}">
              <span class="pub__name">${esc(p)}</span>
              <button class="icon-btn pub__btn" data-up aria-label="Subir ${esc(p)}" ${i === 0 ? "disabled" : ""}>${ARROW_UP}</button>
              <button class="icon-btn pub__btn" data-down aria-label="Descer ${esc(p)}" ${i === pubs.length - 1 ? "disabled" : ""}>${ARROW_DOWN}</button>
              <button class="icon-btn pub__btn" data-del aria-label="Remover ${esc(p)}">${CROSS}</button>
            </li>`).join("")}
        </ul>
        <form class="row pubs__add" data-add-pub>
          <input class="input" name="pub" placeholder="Nome da editora" autocomplete="off" aria-label="Nova editora">
          <button class="btn" type="submit" style="flex:none">Adicionar</button>
        </form>
        ${JSON.stringify(pubs) !== JSON.stringify(DEFAULT_PUBLISHERS) ? `<button class="btn btn--text btn--small" data-reset-pubs>Voltar à lista padrão</button>` : ""}
      </div>

      <div class="settings-group">
        <h2 class="section-title">Estatísticas</h2>
        ${toggle("showPace", "Mostrar ritmo (páginas por hora)")}
      </div>

      <div class="settings-group">
        <h2 class="section-title">Leitura</h2>
        ${toggle("keepAwake", "Manter tela acesa durante a leitura",
          "wakeLock" in navigator ? "" : "Este navegador não permite; a opção fica sem efeito.")}
      </div>

      <div class="settings-group">
        <h2 class="section-title">Dados</h2>
        <p class="caption">Os dados ficam só neste aparelho. Não há conta nem nuvem.</p>
        <p class="note" data-backup-note></p>
        <div class="settings-actions">
          <button class="btn" data-export>Exportar backup</button>
          <label class="btn">Importar backup<input type="file" accept="application/json,.json" hidden data-import></label>
        </div>
        <button class="btn btn--text btn--danger" data-erase>Apagar tudo</button>
      </div>

      <div class="settings-group">
        <h2 class="section-title">Avançado</h2>
        <label class="field">
          <span class="field__label">Chave da API do Google Books (opcional)</span>
          <input class="input" data-key value="${esc(s.googleBooksKey)}" autocomplete="off" spellcheck="false" placeholder="Sem chave, o Google limita as buscas">
          <span class="field__hint">Fica só neste aparelho e vai apenas nas buscas ao Google Books.</span>
        </label>
      </div>

      <p class="caption settings-version">Estante ${APP_VERSION}</p>
    </section>`;

  const screen = host.querySelector(".screen");
  screen.scrollTop = top;
  backupNote().then((t) => { const el = screen.querySelector("[data-backup-note]"); if (el) el.textContent = t; });
  bind(screen);
}

function bind(screen) {
  screen.querySelector(".segmented").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-theme-opt]");
    if (!b) return;
    screen.querySelectorAll("[data-theme-opt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    await saveSettings({ theme: b.dataset.themeOpt });
  });

  const pubs = () => [...state.settings.priorityPublishers];
  screen.querySelector(".pubs").addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    const li = e.target.closest(".pub");
    if (!btn || !li) return;
    const i = +li.dataset.i;
    const list = pubs();
    if (btn.matches("[data-up]") && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (btn.matches("[data-down]") && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    else if (btn.matches("[data-del]")) list.splice(i, 1);
    else return;
    await saveSettings({ priorityPublishers: list });
    draw();
  });
  screen.querySelector("[data-add-pub]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.pub.value.trim();
    if (!name) return;
    if (pubs().some((p) => p.toLowerCase() === name.toLowerCase())) { toast("Essa editora já está na lista."); return; }
    await saveSettings({ priorityPublishers: [...pubs(), name] });
    draw();
  });
  screen.querySelector("[data-reset-pubs]")?.addEventListener("click", async () => {
    await saveSettings({ priorityPublishers: [...DEFAULT_PUBLISHERS] });
    draw();
  });

  screen.querySelectorAll("[data-toggle]").forEach((inp) =>
    inp.addEventListener("change", () => saveSettings({ [inp.dataset.toggle]: inp.checked })));

  const key = screen.querySelector("[data-key]");
  key.addEventListener("change", () => saveSettings({ googleBooksKey: key.value.trim() }));

  const exp = screen.querySelector("[data-export]");
  exp.addEventListener("click", async () => {
    exp.disabled = true;
    try {
      const r = await exportBackup();
      if (r.ok) { toast("Backup exportado."); draw(); }
    } catch {
      toast("Não foi possível exportar.");
    } finally {
      exp.disabled = false;
    }
  });

  screen.querySelector("[data-import]").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let parsed;
    try { parsed = await readBackup(file); } catch (err) { toast(err.message); return; }
    const { books, sessions } = parsed.summary;
    const choice = await menu([
      { value: "merge", label: "Mesclar com o que já está aqui" },
      { value: "replace", label: "Substituir tudo", danger: true },
    ], { label: `Backup com ${books} ${books === 1 ? "livro" : "livros"} e ${sessions} ${sessions === 1 ? "sessão" : "sessões"}` });
    if (!choice) return;
    if (choice === "replace" && !await confirm(
      `Substituir tudo pelo backup (${books} livros, ${sessions} sessões)? O que está no aparelho agora será apagado.`,
      { ok: "Substituir", danger: true })) return;
    await importBackup(parsed.data, choice);
    location.reload();
  });

  screen.querySelector("[data-erase]").addEventListener("click", async () => {
    if (!await confirm("Apagar todos os livros, leituras e ajustes deste aparelho?", { ok: "Continuar", danger: true })) return;
    if (!await confirm("Isto não pode ser desfeito. Apagar tudo mesmo?", { ok: "Apagar tudo", danger: true })) return;
    await eraseAll();
    try { localStorage.removeItem("estante.theme"); } catch {}
    location.reload();
  });
}

// ícones pequenos, locais a esta tela
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ARROW_UP = svg(`<path d="M12 18V6"/><path d="M7 11l5-5 5 5"/>`);
const ARROW_DOWN = svg(`<path d="M12 6v12"/><path d="M7 13l5 5 5-5"/>`);
const CROSS = svg(`<path d="M7 7l10 10"/><path d="M17 7L7 17"/>`);
