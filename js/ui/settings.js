// Ajustes. Nesta fase: aparência. O restante (editoras, dados, backup) vem na fase 7.

import { state, saveSettings } from "../state.js";

const THEMES = [["auto", "Automático"], ["light", "Claro"], ["dark", "Escuro"]];

export function render(main) {
  const s = state.settings;
  main.innerHTML = `
    <section class="screen screen--padded">
      <div class="settings-group">
        <h2 class="section-title">Aparência</h2>
        <div class="segmented" role="group" aria-label="Tema">
          ${THEMES.map(([v, l]) => `<button type="button" data-theme-opt="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join("")}
        </div>
      </div>
      <p class="caption settings-version">Estante 0.3</p>
    </section>`;

  main.querySelector(".segmented").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-theme-opt]");
    if (!b) return;
    main.querySelectorAll("[data-theme-opt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    await saveSettings({ theme: b.dataset.themeOpt });
  });
}
