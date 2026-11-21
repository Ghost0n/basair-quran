/**
 * The Markdown a chat answer (or an exported session) is written in, parsed
 * into blocks the view renders as React elements — never as HTML, so nothing
 * in an answer can inject markup. Headings, paragraphs (line breaks kept),
 * bullet and numbered lists, quotes, rules; inline **bold**, *italic* and
 * `code`. Anything else stays as written.
 */
export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { kind: "h"; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: "p"; inline: Inline[] }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; start: number; items: Inline[][] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "hr" };

const INLINE = /`([^`\n]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g;

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    if (match[1] !== undefined) parts.push({ text: match[1], code: true });
    else if (match[2] !== undefined || match[3] !== undefined) parts.push({ text: (match[2] ?? match[3]) as string, bold: true });
    else parts.push({ text: match[4], italic: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.filter((part) => part.text.length > 0);
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", inline: parseInline(paragraph.join("\n")) });
    paragraph.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "h", level: Math.min(heading[1].length, 3) as 1 | 2 | 3, inline: parseInline(heading[2]) });
      continue;
    }
    if (line.startsWith(">")) {
      flush();
      const quoted: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      index -= 1;
      blocks.push({ kind: "quote", blocks: parseMarkdown(quoted.join("\n")) });
      continue;
    }
    const bullet = /^[-*•+]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      const item = parseInline(bullet[1]);
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
      continue;
    }
    const numbered = /^(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      flush();
      const last = blocks[blocks.length - 1];
      const item = parseInline(numbered[2]);
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", start: Number(numbered[1]), items: [item] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

// Arabic-script and Hebrew letters (the right-to-left scripts the answers use).
const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/gu;
const ANY_LETTER = /\p{L}/gu;

/**
 * Which way an answer reads: by the letters of its own words, leaving out the
 * Quranic quotations it carries (﴿…﴾, «…», "…"), which stay Arabic whatever
 * the answer's language. Right-to-left when most of its letters are.
 */
export function textDirection(text: string): "rtl" | "ltr" {
  const own = text.replace(/﴿[^﴾]*﴾|«[^»]*»|"[^"]*"|“[^”]*”/g, " ");
  const letters = own.match(ANY_LETTER)?.length ?? 0;
  if (!letters) return /[؀-ۿ]/.test(text) ? "rtl" : "ltr";
  const rtl = own.match(RTL_LETTER)?.length ?? 0;
  return rtl * 2 >= letters ? "rtl" : "ltr";
}
