// Ícones de linha simples. stroke em currentColor para seguir o tema.

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  shelf: svg(`<path d="M3 20h18"/><path d="M5 20V6.5"/><path d="M8.5 20V4"/><path d="M12 20V7.5"/><path d="M14.6 8.2l3.6 11.3"/>`),
  timer: svg(`<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10"/><path d="M10 3h4"/>`),
  chart: svg(`<path d="M4 20h16"/><path d="M7 16v-4"/><path d="M12 16V7"/><path d="M17 16v-6"/>`),
  sliders: svg(`<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>`),
  plus: svg(`<path d="M12 5v14"/><path d="M5 12h14"/>`),
  close: svg(`<path d="M6 6l12 12"/><path d="M18 6L6 18"/>`),
  camera: svg(`<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`),
  image: svg(`<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 16l4.5-4.5 4 4 2.5-2.5L20 18"/><circle cx="15.5" cy="9.5" r="1.3"/>`),
  barcode: svg(`<path d="M4 6v12"/><path d="M7 6v12"/><path d="M10.5 6v12"/><path d="M13 6v12"/><path d="M16.5 6v12"/><path d="M20 6v12"/>`),
  search: svg(`<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>`),
};
