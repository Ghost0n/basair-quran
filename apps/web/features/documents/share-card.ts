/**
 * Share formats (spec §5): a verse card and a research card rendered on a
 * canvas as a 1080×1350 PNG (the 4:5 portrait that social feeds show whole),
 * then shared through the Web Share API or downloaded. Everything is drawn
 * from the app's own fonts and palette — no network, no third party.
 */

export type ShareCardInput =
  | { kind: "verse"; text: string; reference: string; note?: string | null }
  | { kind: "research"; title: string; summary?: string | null; meta: string; excerpt?: string | null };

const W = 1080;
const H = 1350;
const PAD = 96;

const PALETTE = {
  bgTop: "#1d1a12",
  bgBottom: "#0f0d08",
  frame: "rgba(212, 175, 55, 0.55)",
  gold: "#e3c35a",
  ink: "#f4ecd6",
  muted: "rgba(244, 236, 214, 0.62)",
};

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
): { lines: string[]; size: number } {
  for (const size of sizes) {
    ctx.font = `${size}px ${family}`;
    const lines = wrapWords((value) => ctx.measureText(value).width, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }
  const size = sizes[sizes.length - 1];
  ctx.font = `${size}px ${family}`;
  const lines = wrapWords((value) => ctx.measureText(value).width, text, maxWidth).slice(0, maxLines);
  lines[lines.length - 1] = `${lines[lines.length - 1]} …`;
  return { lines, size };
}

function frame(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, PALETTE.bgTop);
  gradient.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, W - 112, H - 112);
}

function footer(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = PALETTE.gold;
  ctx.font = "700 40px Amiri";
  ctx.textAlign = "center";
  ctx.fillText("بصائر", W / 2, H - 100);
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  await ensureFonts();
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.direction = "rtl";
  ctx.textBaseline = "middle";
  frame(ctx);

  if (input.kind === "verse") {
    const { lines, size } = fitText(ctx, `﴿${input.text}﴾`, "'Amiri Quran', Amiri, serif", [68, 60, 52, 46, 40, 34], W - PAD * 2, 12);
    const lineHeight = size * 1.9;
    const noteSpace = input.note ? 160 : 0;
    let y = (H - noteSpace - lines.length * lineHeight) / 2 + lineHeight / 2;
    ctx.fillStyle = PALETTE.ink;
    ctx.textAlign = "center";
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += lineHeight;
    }
    ctx.fillStyle = PALETTE.gold;
    ctx.font = "600 34px Cairo";
    ctx.fillText(input.reference, W / 2, y + 30);
    if (input.note) {
      const note = fitText(ctx, input.note, "Cairo, sans-serif", [30, 26], W - PAD * 2, 3);
      ctx.fillStyle = PALETTE.muted;
      let noteY = y + 110;
      for (const line of note.lines) {
        ctx.fillText(line, W / 2, noteY);
        noteY += note.size * 1.6;
      }
    }
  } else {
    ctx.textAlign = "right";
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "600 30px Cairo";
    ctx.fillText("بحث", W - PAD, 170);
    const title = fitText(ctx, input.title, "Amiri, serif", [72, 62, 54], W - PAD * 2, 3);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 ${title.size}px Amiri, serif`;
    let y = 260;
    for (const line of title.lines) {
      ctx.fillText(line, W - PAD, y);
      y += title.size * 1.5;
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "30px Cairo";
    ctx.fillText(input.meta, W - PAD, y + 10);
    y += 90;
    if (input.summary) {
      const summary = fitText(ctx, input.summary, "Cairo, sans-serif", [36, 32, 28], W - PAD * 2, 6);
      ctx.fillStyle = PALETTE.ink;
      for (const line of summary.lines) {
        ctx.fillText(line, W - PAD, y);
        y += summary.size * 1.7;
      }
      y += 40;
    }
    if (input.excerpt) {
      // The quoted ayah fills the remaining space, centred between the text and the footer.
      const bottom = H - 200;
      const excerpt = fitText(ctx, `﴿${input.excerpt}﴾`, "'Amiri Quran', Amiri, serif", [58, 52, 46, 40, 34], W - PAD * 2, 8);
      const lineHeight = excerpt.size * 1.9;
      const room = Math.max(0, bottom - y);
      const lines = excerpt.lines.slice(0, Math.max(1, Math.floor(room / lineHeight)));
      let lineY = y + (room - lines.length * lineHeight) / 2 + lineHeight / 2;
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = "center";
      for (const line of lines) {
        ctx.fillText(line, W / 2, lineY);
        lineY += lineHeight;
      }
    }
  }

  footer(ctx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not render the card."))), "image/png"),
  );
}

/** Share through the OS sheet when files are shareable, else download. */
export async function shareOrDownload(blob: Blob, filename: string, text: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
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
