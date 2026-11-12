// Datas sempre no horário local do aparelho.
// "YYYY-MM-DD" é tratado como data local, nunca passado direto a new Date() (que o leria como UTC).

const pad = (n) => String(n).padStart(2, "0");

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => isoDate();

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(s, opts = { day: "numeric", month: "short", year: "numeric" }) {
  const d = parseDate(s);
  return d ? d.toLocaleDateString("pt-BR", opts).replace(/\./g, "") : "";
}

/** 1:05:09 */
export function clock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 3600)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
}

/** "23 minutos", "1 hora e 5 minutos" */
export function duration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} ${m === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(m / 60), r = m % 60;
  const hs = `${h} ${h === 1 ? "hora" : "horas"}`;
  return r ? `${hs} e ${r} ${r === 1 ? "minuto" : "minutos"}` : hs;
}
