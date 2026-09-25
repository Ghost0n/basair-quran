#!/usr/bin/env node
/**
 * Interface i18n tooling (message ids = the Arabic source strings).
 *
 *   node scripts/i18n.mjs report          list Arabic UI literals not yet wrapped in t()
 *   node scripts/i18n.mjs wrap [files…]   wrap them (in functions/components) with t("…")
 *   node scripts/i18n.mjs catalog         write lib/i18n/catalog.json from every t("…") call
 *   node scripts/i18n.mjs check           catalog up to date + locale files valid; prints coverage
 *
 * Skipped on purpose: Quranic text (Uthmani marks), module-level constants
 * (translated where displayed: `t(item.label)`), object keys, comparisons,
 * switch cases, types, imports and className/id/href-like attributes.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCAN_DIRS = ["app", "components", "features", "lib"];
const CATALOG = path.join(ROOT, "lib/i18n/catalog.json");
const LOCALES_DIR = path.join(ROOT, "lib/i18n/locales");

const ARABIC = /[؀-ۿ]/;
// Uthmani-only marks: alef wasla, small high/low Quranic annotation signs.
const QURANIC = /[ٱۖ-ۭ࣓-ࣿ]/;
const SKIP_ATTRS = new Set(["className", "key", "id", "href", "lang", "dir", "role", "type", "name", "htmlFor", "src"]);
// Arabic here is data (search examples, letter maps, digit tables, the Arabic
// transliteration keyboard), not interface text.
const EXCLUDED_FILES = new Set([
  "lib/arabic-transliteration.ts",
  "lib/quran-nav.ts",
  "lib/numerals.ts",
  "components/yamli-init.tsx",
  "features/workspace/lib/search-helpers.ts",
  "lib/studio-prefill.ts",
]);
const SKIP_PROPS = new Set(["value", "key", "id", "match", "pattern", "code", "kind", "rule", "mode", "status"]);

function listFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || full.includes(`${path.sep}lib${path.sep}i18n`)) continue;
        walk(full);
      } else if (/\.(tsx?|mts)$/.test(entry.name) && !/\.test\./.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        if (!EXCLUDED_FILES.has(path.relative(ROOT, full))) out.push(full);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));
  return out.sort();
}

function isTCall(node) {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(t|tt)$/.test(node.expression.text);
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessor(current)
    )
      return current;
  }
  return null;
}

/** Fully vowelled text is scripture (or a scholarly quote), never interface copy. */
function looksQuranic(text) {
  if (QURANIC.test(text)) return true;
  const letters = (text.match(/[\u0621-\u064A]/g) ?? []).length;
  const marks = (text.match(/[\u064B-\u0652]/g) ?? []).length;
  return letters >= 6 && marks / letters > 0.45;
}

/** `// i18n-ignore` on a statement (or at the top of a file) keeps its literals as they are. */
function ignored(node) {
  const sf = node.getSourceFile();
  if (/^\s*(\/\/|\/\*).*i18n-ignore-file/m.test(sf.text.slice(0, 400))) return true;
  for (let current = node; current && current !== sf; current = current.parent) {
    const ranges = ts.getLeadingCommentRanges(sf.text, current.getFullStart()) ?? [];
    if (ranges.some((range) => sf.text.slice(range.pos, range.end).includes("i18n-ignore"))) return true;
  }
  return false;
}

function skipReason(node, text) {
  const parent = node.parent;
  if (!parent) return "root";
  if (ignored(node)) return "ignored";
  const core = text.trim();
  if (core.length <= 2 && !/\s/.test(core)) return "letter";
  if (/^[\s\d\u0660-\u0669\u06F0-\u06F9.,:;()\-–—/·]+$/.test(core)) return "digits";
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return "import";
  if (ts.isLiteralTypeNode(parent)) return "type";
  if (ts.isPropertyAssignment(parent) && parent.name === node) return "key";
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && SKIP_PROPS.has(parent.name.text)) return "data-prop";
  if (ts.isElementAccessExpression(parent)) return "index";
  if (ts.isCaseClause(parent)) return "case";
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) return "compare";
  if (ts.isCallExpression(parent) && isTCall(parent)) return "wrapped";
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression.getText();
    if (/^console\.|^new RegExp|\.(includes|startsWith|endsWith|indexOf|split|replace|test|match)$/.test(callee)) return "logic";
  }
  if (ts.isJsxAttribute(parent) && SKIP_ATTRS.has(parent.name.getText())) return "attr";
  if (ts.isJsxAttribute(parent) && parent.name.getText().startsWith("data-")) return "attr";
  return null;
}

function isGetterCandidate(node) {
  const parent = node.parent;
  return (
    parent &&
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    ts.isObjectLiteralExpression(parent.parent) &&
    (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name) || ts.isNumericLiteral(parent.name)) &&
    !ts.isTemplateExpression(node)
  );
}

function arabicLiteral(node) {
  if (ts.isJsxText(node)) return ARABIC.test(node.text) ? node.text : null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return ARABIC.test(node.text) ? node.text : null;
  if (ts.isTemplateExpression(node)) {
    const raw = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("");
    return ARABIC.test(raw) ? raw : null;
  }
  return null;
}

/** Collect candidate literals of one file. */
function scan(file) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const visit = (node) => {
    const text = arabicLiteral(node);
    if (text !== null) {
      // Template literals nested in a wrapped template are handled with it.
      let reason = looksQuranic(text) ? "quran" : skipReason(node, text) ?? (enclosingFunction(node) ? null : "module");
      // A module-level `label: "…"` becomes a getter, so it is translated when read.
      if (reason === "module" && isGetterCandidate(node)) reason = "getter";
      found.push({ node, text, reason });
      if (ts.isTemplateExpression(node)) return; // don't descend into spans (handled as a whole)
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { source, sf, found };
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function report() {
  const byReason = {};
  const pending = [];
  for (const file of listFiles()) {
    const { sf, found } = scan(file);
    for (const item of found) {
      byReason[item.reason ?? "wrap"] = (byReason[item.reason ?? "wrap"] ?? 0) + 1;
      if (item.reason === null || item.reason === "module" || item.reason === "getter" || process.argv.includes("--all")) {
        pending.push(`${path.relative(ROOT, file)}:${lineOf(sf, item.node)} [${item.reason ?? "wrap"}] ${item.text.trim().slice(0, 60)}`);
      }
    }
  }
  console.log(JSON.stringify(byReason));
  if (process.argv.includes("--list")) console.log(pending.join("\n"));
  return pending.length;
}

function declaresT(sf) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name) && node.name.text === "t") found = true;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function wrapFile(file) {
  const { source, sf, found } = scan(file);
  const targets = found.filter((item) => item.reason === null || item.reason === "getter");
  if (!targets.length) return 0;
  const fn = declaresT(sf) ? "tt" : "t";
  const edits = [];
  for (const { node, text, reason } of targets) {
    if (reason === "getter") {
      const property = node.parent;
      edits.push({
        start: property.getStart(),
        end: property.getEnd(),
        text: `get ${property.name.getText()}() {\n    return ${fn}(${JSON.stringify(text)});\n  }`,
      });
      continue;
    }
    if (ts.isJsxText(node)) {
      const raw = node.getFullText();
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      const core = raw.slice(lead.length, raw.length - trail.length).replace(/\s*\n\s*/g, " ");
      if (!core) continue;
      edits.push({ start: node.getFullStart(), end: node.getEnd(), text: `${lead}{${fn}(${JSON.stringify(core)})}${trail}` });
    } else if (ts.isTemplateExpression(node)) {
      let template = node.head.text;
      const vars = [];
      node.templateSpans.forEach((span, index) => {
        template += `{${index}}` + span.literal.text;
        vars.push(`${index}: ${span.expression.getText()}`);
      });
      const call = `${fn}(${JSON.stringify(template)}, { ${vars.join(", ")} })`;
      const replacement = ts.isJsxAttribute(node.parent) ? `{${call}}` : call;
      edits.push({ start: node.getStart(), end: node.getEnd(), text: replacement });
    } else {
      const call = `${fn}(${JSON.stringify(text)})`;
      const replacement = ts.isJsxAttribute(node.parent) ? `{${call}}` : call;
      edits.push({ start: node.getStart(), end: node.getEnd(), text: replacement });
    }
  }
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const importLine = fn === "t" ? `import { t } from "@/lib/i18n";` : `import { t as tt } from "@/lib/i18n";`;
  if (!output.includes('from "@/lib/i18n"')) {
    const imports = [...output.matchAll(/^import[\s\S]*?;\s*$/gm)];
    if (imports.length) {
      const last = imports[imports.length - 1];
      const at = last.index + last[0].length;
      output = `${output.slice(0, at)}\n${importLine}${output.slice(at)}`;
    } else {
      const directive = output.match(/^\s*["']use client["'];?\s*\n/);
      const at = directive ? directive[0].length : 0;
      output = `${output.slice(0, at)}${importLine}\n${output.slice(at)}`;
    }
  }
  fs.writeFileSync(file, output);
  return edits.length;
}

function collectCatalog() {
  const ids = new Map();
  for (const file of listFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (isTCall(node) && node.arguments.length && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
        const id = node.arguments[0].text;
        if (!ids.has(id)) ids.set(id, path.relative(ROOT, file));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  // Extra ids used through variables (t(item.label)) are declared in lib/i18n/extra-messages.ts.
  const extra = path.join(ROOT, "lib/i18n/extra-messages.ts");
  if (fs.existsSync(extra)) {
    for (const match of fs.readFileSync(extra, "utf8").matchAll(/^\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
      const id = JSON.parse(`"${match[1]}"`);
      if (!ids.has(id)) ids.set(id, "lib/i18n/extra-messages.ts");
    }
  }
  return [...ids.keys()].sort((a, b) => a.localeCompare(b, "ar"));
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
}

function check() {
  const catalog = collectCatalog();
  let ok = true;
  const stored = fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, "utf8")) : [];
  if (JSON.stringify(stored) !== JSON.stringify(catalog)) {
    console.error("catalog.json is out of date — run: node scripts/i18n.mjs catalog");
    ok = false;
  }
  // New interface text must go through t(): an unwrapped Arabic literal inside a component fails.
  for (const file of listFiles()) {
    const { sf, found } = scan(file);
    for (const item of found.filter((entry) => entry.reason === null || entry.reason === "getter")) {
      console.error(`${path.relative(ROOT, file)}:${lineOf(sf, item.node)} untranslated: ${item.text.trim().slice(0, 60)} — run: node scripts/i18n.mjs wrap ${path.relative(ROOT, file)}`);
      ok = false;
    }
  }
  const ids = new Set(catalog);
  for (const file of fs.readdirSync(LOCALES_DIR).filter((name) => name.endsWith(".json")).sort()) {
    const messages = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf8"));
    let translated = 0;
    for (const [id, value] of Object.entries(messages)) {
      if (!ids.has(id)) continue; // stale entries are harmless; `catalog --prune` style cleanup is manual
      if (typeof value !== "string" || !value.trim()) continue;
      if (placeholders(id) !== placeholders(value)) {
        console.error(`${file}: placeholder mismatch for ${JSON.stringify(id)}`);
        ok = false;
      }
      translated += 1;
    }
    console.log(`${file.replace(".json", "").padEnd(4)} ${String(translated).padStart(5)} / ${catalog.length}  (${Math.round((translated / catalog.length) * 100)}%)`);
  }
  return ok;
}

const [command, ...rest] = process.argv.slice(2);
if (command === "report") {
  report();
} else if (command === "wrap") {
  const files = rest.filter((arg) => !arg.startsWith("--"));
  const targets = files.length ? files.map((file) => path.resolve(file)) : listFiles();
  let total = 0;
  for (const file of targets) total += wrapFile(file);
  console.log(`wrapped ${total} literals`);
} else if (command === "catalog") {
  const catalog = collectCatalog();
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 1) + "\n");
  console.log(`${catalog.length} messages → ${path.relative(ROOT, CATALOG)}`);
} else if (command === "check") {
  process.exit(check() ? 0 : 1);
} else {
  console.log("usage: node scripts/i18n.mjs report|wrap|catalog|check");
  process.exit(2);
}
