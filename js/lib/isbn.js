// Validação e conversão de ISBN-10 e ISBN-13.

export const clean = (s) => String(s || "").toUpperCase().replace(/[^0-9X]/g, "");

export function isValid10(s) {
  const v = clean(s);
  if (!/^\d{9}[\dX]$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (v[i] === "X" ? 10 : +v[i]) * (10 - i);
  return sum % 11 === 0;
}

export function isValid13(s) {
  const v = clean(s);
  if (!/^\d{13}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += +v[i] * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

function check13(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += +first12[i] * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

function check10(first9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += +first9[i] * (10 - i);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? "X" : String(c);
}

/** ISBN-10 válido para ISBN-13: 978 + 9 primeiros dígitos + novo verificador. */
export function to13(isbn10) {
  const v = clean(isbn10);
  if (!isValid10(v)) return "";
  const base = "978" + v.slice(0, 9);
  return base + check13(base);
}

/** Só ISBN-13 com prefixo 978 tem equivalente de 10 dígitos. */
export function to10(isbn13) {
  const v = clean(isbn13);
  if (!isValid13(v) || !v.startsWith("978")) return "";
  const base = v.slice(3, 12);
  return base + check10(base);
}

/** Aceita 10 ou 13 dígitos e devolve { isbn13, isbn10 } ou null se inválido. */
export function parse(s) {
  const v = clean(s);
  if (v.length === 10 && isValid10(v)) return { isbn10: v, isbn13: to13(v) };
  if (v.length === 13 && isValid13(v)) return { isbn13: v, isbn10: to10(v) };
  return null;
}

/** Código do produto num link da Amazon: /dp/XXXXXXXXXX ou /gp/product/XXXXXXXXXX. */
export function amazonCode(url) {
  const m = String(url || "").match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})(?=[/?#]|$)/i);
  return m ? m[1].toUpperCase() : "";
}

// Verificação mínima: rode no console com  import("./js/lib/isbn.js").then(m => m.selfCheck())
export function selfCheck() {
  console.assert(isValid10("8573261080"), "isbn10 válido");
  console.assert(!isValid10("8573261081"), "isbn10 inválido");
  console.assert(to13("8573261080") === "9788573261080", "10 para 13");
  console.assert(to10("9788573261080") === "8573261080", "13 para 10");
  console.assert(isValid10("080442957X"), "X como verificador");
  console.assert(amazonCode("https://www.amazon.com.br/Ana-Karenina/dp/8535911200/ref=sr_1_1") === "8535911200", "link dp");
  console.assert(amazonCode("https://amazon.com.br/gp/product/B0BXYZ1234?x=1") === "B0BXYZ1234", "link gp");
  return "ok";
}
