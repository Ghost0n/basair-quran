/**
 * The research document body format: a tiny markdown subset rendered as React
 * text (never as HTML) — paragraphs, "- " bullet lists and **bold** runs. Pure
 * tokenizer so the view and the tests share one definition.
 */
export type Inline = { text: string; bold: boolean };
export type Block = { kind: "p"; inline: Inline[] } | { kind: "ul"; items: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.filter((part) => part.text.length > 0);
}

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", inline: parseInline(paragraph.join(" ")) });
    paragraph.length = 0;
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      const item = parseInline(bullet[1]);
      if (last && last.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
