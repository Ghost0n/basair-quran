import { t } from "@/lib/i18n";

/**
 * Share formats (spec §5): cards and carousel slides rendered on a canvas as
 * PNGs, then shared through the Web Share API or downloaded. Everything is
 * drawn from the app's own fonts and palettes — no network, no third party.
 *
 * - Sizes: 4:5 portrait (1080×1350, what feeds show whole), square
 *   (1080×1080) and story (1080×1920).
 * - Styles: «ليلي» (night gold), «ورقي» (parchment) and «زمرّدي» (emerald).
 * - Kinds: a verse card, a research cover, and a closing slide (for the
 *   carousel built in `carousel.ts`).
 *
 * Quran text is always drawn in the Quran face and never truncated mid-card
 * without an ellipsis; a slide that can't hold an ayah shrinks the type first.
 */

export type ShareFormat = "portrait" | "square" | "story";
export type ShareStyle = "night" | "parchment" | "emerald";

export type ShareCardInput =
  | {
      kind: "verse";
      text: string;
      reference: string;
      note?: string | null;
      /** Small heading above the ayah (the research title, on carousel slides). */
      heading?: string | null;
      /** e.g. «٢ / ٧» on carousel slides. */
      counter?: string | null;
      /** Marks a note that is AI-generated or experimental. */
      noteLabel?: string | null;
    }
  | {
      kind: "research";
      title: string;
      summary?: string | null;
      meta: string;
      excerpt?: string | null;
      /** e.g. the Tafssir experimental label. */
      badge?: string | null;
      counter?: string | null;
    }
  | {
      kind: "closing";
      title: string;
      lines: string[];
      url?: string | null;
      badge?: string | null;
      counter?: string | null;
    };

export type ShareOptions = { format?: ShareFormat; style?: ShareStyle };

export const SHARE_FORMATS: Record<ShareFormat, { w: number; h: number; label: string }> = {
  portrait: { w: 1080, h: 1350, get label() {
    return t("منشور ٤:٥");
  } },
  square: { w: 1080, h: 1080, get label() {
    return t("مربّع");
  } },
  story: { w: 1080, h: 1920, get label() {
    return t("قصّة ٩:١٦");
  } },
};

type Palette = { bgTop: string; bgBottom: string; frame: string; gold: string; ink: string; muted: string; wash: string };

export const SHARE_STYLES: Record<ShareStyle, Palette & { label: string }> = {
  night: {
    get label() {
    return t("ليلي");
  },
    bgTop: "#1d1a12",
    bgBottom: "#0f0d08",
    frame: "rgba(212, 175, 55, 0.55)",
    gold: "#e3c35a",
    ink: "#f4ecd6",
    muted: "rgba(244, 236, 214, 0.62)",
    wash: "rgba(212, 175, 55, 0.10)",
  },
  parchment: {
    get label() {
    return t("ورقي");
  },
    bgTop: "#fbf6e9",
    bgBottom: "#efe3c6",
    frame: "rgba(154, 116, 23, 0.55)",
    gold: "#8f6a12",
    ink: "#2b2415",
    muted: "rgba(43, 36, 21, 0.66)",
    wash: "rgba(154, 116, 23, 0.10)",
  },
  emerald: {
    get label() {
    return t("زمرّدي");
  },
    bgTop: "#123029",
    bgBottom: "#07130f",
    frame: "rgba(212, 175, 55, 0.5)",
    gold: "#e6c865",
    ink: "#eef3ea",
    muted: "rgba(238, 243, 234, 0.64)",
    wash: "rgba(230, 200, 101, 0.10)",
  },
};

const PAD = 96;
const QURAN = "'Amiri Quran', Amiri, serif";
const HEADING = "Amiri, serif";
const UI = "Cairo, sans-serif";

async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    ["64px 'Amiri Quran'", "700 56px Amiri", "40px Amiri", "600 32px Cairo", "32px Cairo"].map((font) =>
      document.fonts.load(font).catch(() => undefined),
    ),
  );
}

/** Greedy word wrap for RTL Arabic (measures with the current ctx font). */
export function wrapWords(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink the font until the wrapped text fits `maxLines`; returns the lines and size used. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  sizes: number[],
  maxWidth: number,
  maxLines: number,
  weight = "",
): { lines: string[]; size: number } {
  const font = (size: number) => `${weight ? `${weight} ` : ""}${size}px ${family}`;
  for (const size of sizes) {
    ctx.font = font(size);
    const lines = wrapWords((value) => ctx.measureText(value).width, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = font(size);
  const lines = wrapWords((value) => ctx.measureText(value).width, text, maxWidth).slice(0, maxLines);
  if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} …`;
  return { lines, size };
}

/** Scale a list of type sizes for the canvas height (story gets larger type, square smaller). */
function scaled(sizes: number[], h: number): number[] {
  const factor = h >= 1900 ? 1.12 : h <= 1100 ? 0.9 : 1;
  return sizes.map((size) => Math.round(size * factor));
}

function frame(ctx: CanvasRenderingContext2D, palette: Palette, w: number, h: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, palette.bgTop);
  gradient.addColorStop(1, palette.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  // A soft light field behind the text.
  const glow = ctx.createRadialGradient(w * 0.7, h * 0.18, 0, w * 0.7, h * 0.18, w * 0.8);
  glow.addColorStop(0, palette.wash);
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = palette.frame;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, w - 80, h - 80);
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, w - 112, h - 112);
}

function footer(ctx: CanvasRenderingContext2D, palette: Palette, w: number, h: number, counter?: string | null) {
  ctx.fillStyle = palette.gold;
  ctx.font = `700 40px ${HEADING}`;
  ctx.textAlign = "center";
  ctx.fillText(t("بصائر"), w / 2, h - 100);
  if (counter) {
    ctx.fillStyle = palette.muted;
    ctx.font = `600 26px ${UI}`;
    ctx.textAlign = "left";
    ctx.fillText(counter, PAD, h - 100);
  }
}

function badgePill(ctx: CanvasRenderingContext2D, palette: Palette, text: string, xRight: number, y: number) {
  ctx.font = `700 26px ${UI}`;
  const width = ctx.measureText(text).width + 40;
  ctx.fillStyle = palette.wash;
  ctx.strokeStyle = palette.frame;
  ctx.lineWidth = 1.5;
  const x = xRight - width;
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(x + r, y - 24);
  ctx.arcTo(x + width, y - 24, x + width, y + 24, r);
  ctx.arcTo(x + width, y + 24, x, y + 24, r);
  ctx.arcTo(x, y + 24, x, y - 24, r);
  ctx.arcTo(x, y - 24, x + width, y - 24, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.gold;
  ctx.textAlign = "right";
  ctx.fillText(text, xRight - 20, y + 1);
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number): number {
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawVerse(ctx: CanvasRenderingContext2D, p: Palette, w: number, h: number, input: Extract<ShareCardInput, { kind: "verse" }>) {
  const inner = w - PAD * 2;
  let top = 150;
  if (input.heading) {
    const heading = fitText(ctx, input.heading, HEADING, [40, 34], inner, 2, "700");
    ctx.fillStyle = p.gold;
    ctx.textAlign = "center";
    top = drawLines(ctx, heading.lines, w / 2, top, heading.size * 1.5) + 10;
  }
  const noteSpace = input.note ? Math.round(h * 0.16) : 0;
  const bottom = h - 190 - noteSpace;
  const maxLines = Math.max(3, Math.floor((bottom - top - 80) / (40 * 1.9)));
  const verse = fitText(ctx, `﴿${input.text}﴾`, QURAN, scaled([68, 60, 52, 46, 40, 34], h), inner, maxLines);
  const lineHeight = verse.size * 1.9;
  const block = verse.lines.length * lineHeight + 70;
  let y = top + Math.max(0, (bottom - top - block) / 2) + lineHeight / 2;
  ctx.fillStyle = p.ink;
  ctx.textAlign = "center";
  y = drawLines(ctx, verse.lines, w / 2, y, lineHeight);
  ctx.fillStyle = p.gold;
  ctx.font = `600 34px ${UI}`;
  ctx.fillText(input.reference, w / 2, y + 20);
  if (input.note) {
    let noteY = y + 110;
    if (input.noteLabel) {
      ctx.fillStyle = p.gold;
      ctx.font = `700 24px ${UI}`;
      ctx.fillText(input.noteLabel, w / 2, noteY - 6);
      noteY += 40;
    }
    const note = fitText(ctx, input.note, UI, [30, 27, 24], inner, Math.max(2, Math.floor((h - 190 - noteY) / 44)));
    ctx.fillStyle = p.muted;
    drawLines(ctx, note.lines, w / 2, noteY, note.size * 1.6);
  }
}

function drawResearch(ctx: CanvasRenderingContext2D, p: Palette, w: number, h: number, input: Extract<ShareCardInput, { kind: "research" }>) {
  const inner = w - PAD * 2;
  ctx.textAlign = "right";
  ctx.fillStyle = p.muted;
  ctx.font = `600 30px ${UI}`;
  ctx.fillText(t("بحث"), w - PAD, 170);
  if (input.badge) badgePill(ctx, p, input.badge, w - PAD - 90, 170);
  const title = fitText(ctx, input.title, HEADING, scaled([72, 62, 54], h), inner, 3, "700");
  ctx.fillStyle = p.gold;
  ctx.textAlign = "right";
  let y = drawLines(ctx, title.lines, w - PAD, 262, title.size * 1.5);
  ctx.fillStyle = p.muted;
  ctx.font = `30px ${UI}`;
  ctx.fillText(input.meta, w - PAD, y + 10);
  y += 90;
  if (input.summary) {
    const summaryLines = h >= 1900 ? 8 : h <= 1100 ? 4 : 6;
    const summary = fitText(ctx, input.summary, UI, scaled([36, 32, 28], h), inner, summaryLines);
    ctx.fillStyle = p.ink;
    y = drawLines(ctx, summary.lines, w - PAD, y, summary.size * 1.7) + 40;
  }
  if (input.excerpt) {
    // The quoted ayah fills the remaining space, centred between the text and the footer.
    const bottom = h - 200;
    const excerpt = fitText(ctx, `﴿${input.excerpt}﴾`, QURAN, scaled([58, 52, 46, 40, 34], h), inner, 8);
    const lineHeight = excerpt.size * 1.9;
    const room = Math.max(0, bottom - y);
    const lines = excerpt.lines.slice(0, Math.max(1, Math.floor(room / lineHeight)));
    if (lines.length < excerpt.lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} …`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = "center";
    drawLines(ctx, lines, w / 2, y + (room - lines.length * lineHeight) / 2 + lineHeight / 2, lineHeight);
  }
}

function drawClosing(ctx: CanvasRenderingContext2D, p: Palette, w: number, h: number, input: Extract<ShareCardInput, { kind: "closing" }>) {
  const inner = w - PAD * 2;
  const title = fitText(ctx, input.title, HEADING, scaled([64, 56, 48], h), inner, 3, "700");
  const lineBlocks = input.lines.map((line) => fitText(ctx, line, UI, [32, 28], inner, 3));
  const total =
    title.lines.length * title.size * 1.5 +
    lineBlocks.reduce((sum, block) => sum + block.lines.length * block.size * 1.7 + 18, 0) +
    (input.url ? 90 : 0) +
    (input.badge ? 90 : 0) +
    60;
  let y = Math.max(170, (h - total) / 2);
  ctx.textAlign = "center";
  if (input.badge) {
    ctx.font = `700 26px ${UI}`;
    const width = ctx.measureText(input.badge).width + 40;
    badgePill(ctx, p, input.badge, w / 2 + width / 2, y);
    ctx.textAlign = "center";
    y += 90;
  }
  ctx.fillStyle = p.gold;
  ctx.font = `700 ${title.size}px ${HEADING}`;
  y = drawLines(ctx, title.lines, w / 2, y, title.size * 1.5) + 30;
  for (const block of lineBlocks) {
    ctx.fillStyle = p.ink;
    ctx.font = `${block.size}px ${UI}`;
    y = drawLines(ctx, block.lines, w / 2, y, block.size * 1.7) + 18;
  }
  if (input.url) {
    ctx.fillStyle = p.gold;
    ctx.font = `600 26px ${UI}`;
    const url = input.url.replace(/^https?:\/\//, "");
    ctx.fillText(url.length > 60 ? `${url.slice(0, 57)}…` : url, w / 2, y + 40);
  }
}

export async function renderShareCanvas(input: ShareCardInput, options: ShareOptions = {}): Promise<HTMLCanvasElement> {
  await ensureFonts();
  const { w, h } = SHARE_FORMATS[options.format ?? "portrait"];
  const palette = SHARE_STYLES[options.style ?? "night"];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  frame(ctx, palette, w, h);
  if (input.kind === "verse") drawVerse(ctx, palette, w, h, input);
  else if (input.kind === "research") drawResearch(ctx, palette, w, h, input);
  else drawClosing(ctx, palette, w, h, input);
  footer(ctx, palette, w, h, input.counter);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not render the card."))), "image/png"),
  );
}

export async function renderShareCard(input: ShareCardInput, options: ShareOptions = {}): Promise<Blob> {
  return canvasToPng(await renderShareCanvas(input, options));
}

import { nativeShareFiles } from "@/lib/native-share";

type ShareNavigator = Navigator & { canShare?: (data: ShareData) => boolean };

/** Share through the OS sheet when files are shareable, else download. */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<"shared" | "downloaded"> {
  // The standalone app: the phone's own sheet (a download does nothing there).
  try {
    const native = await nativeShareFiles([{ blob, name: filename }], text);
    if (native) return "shared";
  } catch {
    /* the sheet failed — try the web ways below */
  }
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  const nav = navigator as ShareNavigator;
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch {
      /* cancelled — fall through to a download so the action isn't lost */
    }
  }
  downloadBlob(blob, filename);
  return "downloaded";
}

/** Share several images at once (a carousel) when the OS allows it; else `null`. */
export async function shareFiles(files: File[], text: string): Promise<"shared" | null> {
  try {
    const native = await nativeShareFiles(files.map((file) => ({ blob: file, name: file.name })), text);
    if (native) return "shared";
  } catch {
    /* fall back to the web share */
  }
  const nav = navigator as ShareNavigator;
  if (!nav.share || !nav.canShare?.({ files })) return null;
  try {
    await nav.share({ files, text });
    return "shared";
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
