/**
 * The reader's medallion: the first letter of their name on a geometric
 * pattern, in one of the illuminator's colours (components/user-avatar.tsx).
 *
 * Nothing has to be chosen: without a saved choice the pattern and colour come
 * from the account id, so each reader has their own from the first sign-in and
 * keeps it on every device. A choice made in Settings is saved on the account
 * as `p<pattern>t<tone>` (`avatar`, at most 8 characters). Values saved by the
 * former medallions («باء», «نجمة ثُمانيّة»…) read as no choice.
 */

export const AVATAR_PATTERNS = ["khatam", "triangles", "lattice", "circles", "shamsa", "plain"] as const;
export const AVATAR_TONES = ["gold", "lapis", "malachite", "cinnabar", "ink", "vellum"] as const;

export type AvatarPattern = (typeof AVATAR_PATTERNS)[number];
export type AvatarTone = (typeof AVATAR_TONES)[number];
export type AvatarLook = { pattern: AvatarPattern; tone: AvatarTone };

const SAVED = /^p(\d)t(\d)$/;

/** The look saved on the account, or null when none was chosen. */
export function parseAvatar(value: string | null | undefined): AvatarLook | null {
  const match = SAVED.exec((value ?? "").trim());
  if (!match) return null;
  const pattern = AVATAR_PATTERNS[Number(match[1])];
  const tone = AVATAR_TONES[Number(match[2])];
  return pattern && tone ? { pattern, tone } : null;
}

export function formatAvatar(look: AvatarLook): string {
  return `p${AVATAR_PATTERNS.indexOf(look.pattern)}t${AVATAR_TONES.indexOf(look.tone)}`;
}

// FNV-1a: small, stable, the same on every device.
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** The look a reader has until they choose one: from their account id. */
export function automaticAvatar(seed: string | number): AvatarLook {
  const value = hash(String(seed));
  // "plain" is a choice, never given: everyone starts with a pattern.
  return {
    pattern: AVATAR_PATTERNS[value % (AVATAR_PATTERNS.length - 1)],
    tone: AVATAR_TONES[Math.floor(value / 7) % AVATAR_TONES.length],
  };
}

export function avatarLook(value: string | null | undefined, seed: string | number): AvatarLook {
  return parseAvatar(value) ?? automaticAvatar(seed);
}

const ARABIC_LETTER = /[ء-يٱ-ۓۺ-ۼ]/;
const MARKS = /[ً-ٰٟۖ-ۭـ]/g;

function firstGrapheme(text: string): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
    for (const { segment } of segments) {
      if (/[\p{L}\p{N}]/u.test(segment)) return segment;
    }
    return "";
  }
  return Array.from(text).find((char) => /[\p{L}\p{N}]/u.test(char)) ?? "";
}

/**
 * The letter on the medallion: the first of the display name — in Arabic the
 * first letter of the name itself, past «ال» (الحسن → ح) — else of the email,
 * else «ب».
 */
export function avatarInitial(name: string | null | undefined, email?: string | null): string {
  const cleaned = (name ?? "").replace(MARKS, "").trim();
  if (cleaned) {
    const word = cleaned.split(/\s+/)[0];
    if (ARABIC_LETTER.test(word[0] ?? "")) {
      const stem = word.startsWith("ال") && word.length > 3 ? word.slice(2) : word;
      const letter = Array.from(stem).find((char) => ARABIC_LETTER.test(char));
      if (letter) return letter;
    }
    const first = firstGrapheme(cleaned);
    if (first) return first.toLocaleUpperCase();
  }
  const fromEmail = firstGrapheme((email ?? "").split("@")[0] ?? "");
  return fromEmail ? fromEmail.toLocaleUpperCase() : "ب";
}

export function isArabicLetter(letter: string): boolean {
  return ARABIC_LETTER.test(letter);
}
