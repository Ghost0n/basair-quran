#!/usr/bin/env node
/**
 * The sign-in pages say what the app says (docs/keycloak.md).
 *
 * src/login/i18n/web-strings.json maps a Keycloak message key to the web's
 * Arabic message id. This script looks each one up in every web locale
 * (apps/web/lib/i18n/locales/<code>.json) with the web's own fallback (the
 * locale, then English, then the Arabic id) and writes the result into the
 * `withCustomTranslations` block of src/login/i18n.ts, keyed by Keycloak's tag
 * for the locale (the web's zh is Keycloak's zh-CN). Keycloakify needs that
 * block literal: it turns it into the theme's server-side message files.
 *
 *   node scripts/web-messages.mjs           write the block
 *   node scripts/web-messages.mjs --check   fail when the block is stale (tests, CI)
 *
 * Fails when a mapped id is not in the web's catalog: the theme only reuses
 * strings the web already ships and translates.
 *
 * src/login/i18n/own-messages.json adds the Keycloak messages the web has no
 * words for, written per language; every language must have each one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webI18n = path.resolve(root, "../web/lib/i18n");
const i18nFile = path.join(root, "src/login/i18n.ts");
const START = "// web-messages:start (scripts/web-messages.mjs — do not edit by hand)";
const END = "// web-messages:end";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const strings = Object.entries(readJson(path.join(root, "src/login/i18n/web-strings.json"))).filter(([key]) => !key.startsWith("//"));
const catalog = new Set(readJson(path.join(webI18n, "catalog.json")));

const missing = strings.filter(([, id]) => !catalog.has(id));
if (missing.length) {
  console.error(`not in the web's catalog: ${missing.map(([key, id]) => `${key} → «${id}»`).join(", ")}`);
  process.exit(1);
}

const english = readJson(path.join(webI18n, "locales/en.json"));
const codes = ["ar", ...fs.readdirSync(path.join(webI18n, "locales")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))].sort();

const own = Object.entries(readJson(path.join(root, "src/login/i18n/own-messages.json"))).filter(([key]) => !key.startsWith("//"));
const gaps = own.flatMap(([key, texts]) => codes.filter((code) => typeof texts[code] !== "string").map((code) => `${key} (${code})`));
if (gaps.length) {
  console.error(`own-messages.json lacks: ${gaps.join(", ")}`);
  process.exit(1);
}

const lines = codes.map((code) => {
  const dictionary = code === "ar" ? {} : readJson(path.join(webI18n, "locales", `${code}.json`));
  const messages = Object.fromEntries(
    strings.map(([key, id]) => {
      // Arabic is the source: the id is the text.
      const text = code === "ar" ? id : (dictionary[id] ?? english[id] ?? id);
      if (typeof text !== "string") throw new Error(`${code}: «${id}» is a counted (plural) entry`);
      return [key, text];
    }).concat(own.map(([key, texts]) => [key, texts[code]])),
  );
  const tag = code === "zh" ? "zh-CN" : code;
  return `      ${JSON.stringify(tag)}: ${JSON.stringify(messages)},`;
});
const block = [`    ${START}`, "    {", ...lines, "    }", `    ${END}`].join("\n");

const source = fs.readFileSync(i18nFile, "utf8");
const from = source.indexOf(START);
const to = source.indexOf(END);
if (from < 0 || to < from) throw new Error(`${path.relative(root, i18nFile)}: the web-messages markers are missing`);
const lineStart = source.lastIndexOf("\n", from) + 1;
const next = source.slice(0, lineStart) + block + source.slice(to + END.length);

if (process.argv.includes("--check")) {
  if (next !== source) {
    console.error("src/login/i18n.ts is stale: run `pnpm --filter @q-basair/keycloak-theme messages`.");
    process.exit(1);
  }
  console.log(`web strings up to date (${strings.length} keys × ${codes.length} locales)`);
} else {
  fs.writeFileSync(i18nFile, next);
  console.log(`web strings: ${strings.length} keys + ${own.length} own × ${codes.length} locales → src/login/i18n.ts`);
}
