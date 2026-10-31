#!/usr/bin/env node
/**
 * Detector de textos de interfaz en inglés (Fase 1 — glosario §5).
 *
 * Recorre `src/**\/*.{ts,tsx}` y extrae cadenas visibles: texto JSX y las props
 * que se pintan al usuario (title, subtitle, label, placeholder, body, hint,
 * description, heading, aria-label). Marca las que parecen inglés.
 *
 * Criterio: sin acentos ni ñ + al menos un token de la lista de palabras
 * inglesas. La lista blanca del glosario (JEV, API, MCP, FinOps…) no está
 * incluida, así que no genera ruido.
 *
 * Uso: node scripts/find-english-text.mjs [--all]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

const ENGLISH = new Set(
  `the of to with and for from by your our this that these those not on off is are
   was were be been will can has have all any each per new more less than into out over
   how what when where which who why yes please loading loaded missing failed
   enabled disabled active inactive pending ready running queued done
   tenant tenants customer customers organization subscription subscriptions revenue
   partner partners cost costs usage budget budgets policy policies model models
   gateway audit compliance retention export exports import imports run runs dataset
   datasets feedback trace traces region regions release releases migration migrations
   marketplace onboarding notification notifications staff settings capacity optimizer
   metering governance trust safety risk center health realtime chat insights
   knowledge source sources agent agents workflow workflows copilot ecosystem factory
   billing provider providers latency confidence fallback primary shadow canary
   rewrite evidence attempts fast path decision decisions rules rule today yesterday
   average avg estimate estimated breakdown summary overview
   mode count items create edit delete
   save cancel close open add remove search filter sort next previous back
   action actions step steps message messages user users role roles screen screens
   language locale timezone currency date dates time times day days week weeks
   month months year years hour hours minute minutes second seconds
   up down start stop pause resume retry reset refresh download upload
   key keys token tokens secret secrets scope scopes quota quotas limit limits
   trial paid free pro enterprise plan plans invoice invoices payment payments
   subscription cancel renewal renew upgrade downgrade
   alert alerts incident incidents drill drills backup backups restore
   anomaly anomalies pattern patterns trend trends funnel cohort cohorts
   bottom high low medium critical warning success danger neutral
   primary secondary tertiary`.split(/\s+/)
);

/**
 * Términos que ya se usan así en español (o son nombre propio del producto) y
 * no se traducen: si una cadena solo tiene estas palabras, no se marca.
 */
const ACCEPTED = new Set(
  `token tokens dataset datasets plan planes role roles workspace workspaces
   feedback marketplace onboarding insight insights chat copilot policy
   control center drill drills prompt prompts sandbox rollback backend frontend
   score top api sdk mcp jev id uuid url http json csv pdf`
    .split(/\s+/)
    .filter(Boolean)
);

const PROPS = [
  "header",
  "title",
  "subtitle",
  "label",
  "placeholder",
  "body",
  "hint",
  "description",
  "heading",
  "aria-label",
];

const ALLOWED_WITHOUT_SCORE = /^[A-Z0-9]{2,6}$/;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function tokens(text) {
  return text
    .split(/[^A-Za-z]+/)
    .filter((t) => t.length > 1)
    .map((t) => t.toLowerCase());
}

function looksEnglish(text) {
  const value = text.trim();
  if (value.length < 3) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (/[áéíóúÁÉÍÓÚñÑüÜ¿¡]/.test(value)) return false;
  if (ALLOWED_WITHOUT_SCORE.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("http") || value.includes("://")) return false;
  // Fragmentos de código (ternarios, comparaciones, interpolaciones).
  if (/[{}()?]|&&|\|\||=>/.test(value)) return false;
  if (/^[a-z]+[A-Z]/.test(value)) return false; // camelCase = identificador
  if (/^[a-z0-9_.-]+$/.test(value) && !value.includes(" ")) {
    // Una sola palabra en minúsculas: solo si es inglesa y no está aceptada.
    return !ACCEPTED.has(value) && ENGLISH.has(value);
  }
  const list = tokens(value);
  if (list.length === 0) return false;
  // Los términos aceptados no cuentan ni a favor ni en contra.
  const relevant = list.filter((token) => !ACCEPTED.has(token));
  if (relevant.length === 0) return false;
  if (relevant.length === 1) return ENGLISH.has(relevant[0]);
  // Frase: se marca solo si la mitad o más de sus palabras son inglesas.
  const english = relevant.filter((token) => ENGLISH.has(token)).length;
  return english / relevant.length >= 0.5;
}

function extract(source) {
  const found = [];
  const lines = source.split(/\r?\n/);

  const jsxText = />([^<>{}]+)</g;
  const propExpr = new RegExp(`(?:${PROPS.join("|")})="([^"]+)"`, "g");
  const propSingle = new RegExp(`(?:${PROPS.join("|")})='([^']+)'`, "g");

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("*") || line.trimStart().startsWith("//")) return;
    for (const match of line.matchAll(jsxText)) {
      if (looksEnglish(match[1])) found.push({ line: index + 1, text: match[1].trim() });
    }
    for (const regex of [propExpr, propSingle]) {
      for (const match of line.matchAll(regex)) {
        if (looksEnglish(match[1])) found.push({ line: index + 1, text: match[1].trim() });
      }
    }
  });

  return found;
}

const showAll = process.argv.includes("--all");
const onlyPath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const results = walk(SRC)
  .filter(
    (file) =>
      !onlyPath ||
      file.replace(/\\/g, "/").includes(onlyPath.replace(/\\/g, "/")),
  )
  .map((file) => ({ file: relative(join(HERE, ".."), file), hits: extract(readFileSync(file, "utf8")) }))
  .filter((entry) => entry.hits.length > 0)
  .sort((a, b) => b.hits.length - a.hits.length);

const total = results.reduce((sum, entry) => sum + entry.hits.length, 0);
console.log(`\nCadenas sospechosas de inglés: ${total} en ${results.length} archivos\n`);

for (const entry of results) {
  console.log(`${String(entry.hits.length).padStart(4)}  ${entry.file}`);
  if (showAll) {
    for (const hit of entry.hits) console.log(`        ${hit.line}: ${hit.text}`);
  } else {
    for (const hit of entry.hits.slice(0, 3)) console.log(`        ${hit.line}: ${hit.text}`);
  }
}
console.log("");
