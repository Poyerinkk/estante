// Capas: baixar, redimensionar e tirar a cor dominante para a lombada.
// O canvas aqui é só ferramenta de processamento, fora da tela; nunca é desenhado na interface.

const loadImage = (src, cors) => new Promise((resolve, reject) => {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("imagem não carregou"));
  img.src = src;
});

const toBlob = (canvas, q) => new Promise((resolve, reject) =>
  canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/jpeg", q));

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

/** Redimensiona para no máximo maxW de largura, JPEG 0,85. */
export async function resize(blobOrImg, maxW = 600, quality = 0.85) {
  const img = blobOrImg instanceof Blob ? await imageFromBlob(blobOrImg) : blobOrImg;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, quality);
}

// capa "vazia" (placeholder do servidor) costuma ser minúscula
const looksReal = (img) => img.naturalWidth >= 40 && img.naturalHeight >= 60;

/**
 * Tenta cada endereço: primeiro fetch direto; se o CORS bloquear, <img crossOrigin> + canvas.
 * Devolve { blob, url } com a primeira que der certo, ou { blob: null, url: primeiro endereço }.
 */
export async function download(urls) {
  const list = urls.filter(Boolean);
  for (const url of list) {
    try {
      const r = await fetch(url, { mode: "cors" });
      if (r.ok && (r.headers.get("content-type") || "").startsWith("image/")) {
        const img = await imageFromBlob(await r.blob());
        if (looksReal(img)) return { blob: await resize(img), url };
      }
    } catch {}
    try {
      const img = await loadImage(url, true);
      if (looksReal(img)) return { blob: await resize(img), url };
    } catch {}
  }
  return { blob: null, url: list[0] || "" };
}

// um endereço blob: por imagem, reaproveitado por todas as telas
const urls = new WeakMap();
export function blobUrl(blob) {
  if (!(blob instanceof Blob)) return "";
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
}

/** Endereço para mostrar a capa: Blob salvo, senão a URL remota, senão "". */
export function coverSrc(book) {
  return blobUrl(book?.cover) || book?.coverRemoteUrl || "";
}

// faixa da capa usada como lombada: de 2% a 8% da largura, a partir da borda esquerda.
// Os 2% iniciais ficam de fora porque capas escaneadas costumam ter um fio branco na borda.
export const EDGE_FROM = 0.02;
export const EDGE_TO = 0.08;

/** Cor média da faixa da borda esquerda da capa (sem domesticar), para escolher a cor do texto. */
export async function edgeColor(blob) {
  if (!blob) return "";
  const img = await imageFromBlob(blob);
  const w = 100;
  const h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const x0 = Math.round(w * EDGE_FROM), x1 = Math.round(w * EDGE_TO);
  const px = g.getImageData(x0, 0, x1 - x0, h).data;
  let r = 0, gr = 0, b = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; n++; }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(gr)}${hex(b)}`;
}

/* ---------- cor ---------- */

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** "Domestica" a cor: saturação até 45%, luminosidade entre 25% e 70%. */
export function tame(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [h, s, l] = rgbToHsl(n >> 16, (n >> 8) & 255, n & 255);
  return hslToHex(h, Math.min(s, 0.45), Math.min(0.7, Math.max(0.25, l)));
}

/**
 * Cor dominante: reduz a 32 px, agrupa cores parecidas e fica com o grupo mais frequente
 * que não seja quase branco nem quase preto. Devolve "#rrggbb" já domesticado, ou "".
 */
export async function dominantColor(blob) {
  if (!blob) return "";
  const img = await imageFromBlob(blob);
  const size = 32;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = Math.max(1, Math.round(size * img.naturalHeight / img.naturalWidth));
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;

  const groups = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], gr = px[i + 1], b = px[i + 2];
    const l = (Math.max(r, gr, b) + Math.min(r, gr, b)) / 510;
    if (l > 0.9 || l < 0.1) continue;
    const key = ((r >> 4) << 8) | ((gr >> 4) << 4) | (b >> 4); // 16 níveis por canal
    const e = groups.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += gr; e.b += b;
    groups.set(key, e);
  }
  let best = null;
  for (const e of groups.values()) if (!best || e.n > best.n) best = e;
  if (!best) return "";
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return tame(`#${hex(best.r)}${hex(best.g)}${hex(best.b)}`);
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
}

/** Texto claro ou escuro, o que tiver mais contraste com a lombada. */
export function inkFor(hex) {
  if (!hex) return "";
  const L = luminance(hex);
  const vsLight = (luminance("#F7F2E9") + 0.05) / (L + 0.05);
  const vsDark = (L + 0.05) / (luminance("#231F1B") + 0.05);
  return vsLight >= vsDark ? "#F7F2E9" : "#231F1B";
}
