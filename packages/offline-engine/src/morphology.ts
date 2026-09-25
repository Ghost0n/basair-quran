/**
 * Per-word morphology, ported from src/app/services/morphology_service.py.
 * The server parses data/quran-morphology.txt; the phone reads the same lines
 * from core.db's `morphology_segments` table, one surah at a time (every
 * lookup — by number, by verse skeleton, by word run — stays inside a surah).
 */
import type { SqlDriver } from "./db";
import { chars, split } from "./py";

const SIG_FOLD: Record<string, string> = { "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه" };

export function normalizeSignature(text: string): string {
  const kept = chars(text).filter((char) => {
    const code = char.codePointAt(0)!;
    return (code >= 0x0621 && code <= 0x063a) || (code >= 0x0641 && code <= 0x064a) || code === 0x0671;
  });
  return kept.map((char) => SIG_FOLD[char] ?? char).join("").replaceAll("ء", "");
}

export const POS_LABELS: Record<string, string> = {
  N: "اسم", PN: "اسم علَم", V: "فعل", P: "حرف جرّ", DET: "أداة تعريف", PRON: "ضمير", ADJ: "صفة", CONJ: "حرف عطف",
  REL: "اسم موصول", ACC: "ظرف", T: "ظرف زمان", LOC: "ظرف مكان", INTG: "أداة استفهام", NEG: "أداة نفي", EMPH: "حرف توكيد",
  SUB: "حرف مصدري", RES: "أداة حصر", COND: "أداة شرط", PRP: "لام التعليل", DEM: "اسم إشارة", VOC: "أداة نداء", ADV: "حال",
};

export const CASE_LABELS: Record<string, string> = { NOM: "مرفوع", ACC: "منصوب", GEN: "مجرور" };

export const FEATURE_LABELS: Record<string, string> = {
  PERF: "ماضٍ", IMPF: "مضارع", IMPV: "أمر", PASS: "مبنيّ للمجهول", ACT_PCPL: "اسم فاعل", PASS_PCPL: "اسم مفعول",
  "MOOD:IND": "مرفوع", "MOOD:SUBJ": "منصوب", "MOOD:JUS": "مجزوم",
  "1S": "المتكلّم", "1P": "المتكلّمون",
  "2MS": "المخاطَب", "2FS": "المخاطَبة", "2MP": "المخاطَبون", "2FP": "المخاطَبات", "2MD": "المخاطَبان", "2FD": "المخاطَبتان",
  "3MS": "الغائب", "3FS": "الغائبة", "3MP": "الغائبون", "3FP": "الغائبات", "3MD": "الغائبان", "3FD": "الغائبتان",
  M: "مذكّر", F: "مؤنّث", MS: "مفرد مذكّر", FS: "مفرد مؤنّث", MD: "مثنّى مذكّر", FD: "مثنّى مؤنّث", MP: "جمع مذكّر", FP: "جمع مؤنّث",
  INDEF: "نكرة", DEF: "معرفة",
};

type Features = { root: string | null; lemma: string | null; case: string | null; flags: string[] };
type Segment = { form: string; tag: string; segment: number; word: number; features: Features };
export type MorphologyWord = {
  position: number;
  text: string;
  root: string | null;
  lemma: string | null;
  pos: string;
  pos_label: string;
  case: string | null;
  case_label: string | null;
  features: string[];
};

function parseFeatures(raw: string): Features {
  const result: Features = { root: null, lemma: null, case: null, flags: [] };
  for (const part of raw.split("|")) {
    if (part.startsWith("ROOT:")) result.root = part.slice(5);
    else if (part.startsWith("LEM:")) result.lemma = part.slice(4);
    else if (part in CASE_LABELS) result.case = part;
    else if (part) result.flags.push(part);
  }
  return result;
}

function labelFeatures(flags: string[]): string[] {
  const labels: string[] = [];
  for (const flag of flags) {
    const label = FEATURE_LABELS[flag];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function aggregateWord(segments: Segment[]): MorphologyWord {
  const ordered = [...segments].sort((a, b) => a.segment - b.segment);
  const text = ordered.map((segment) => segment.form).join("");
  let main = ordered.find((segment) => segment.features.root) ?? null;
  if (main === null) {
    const nonPrefix = ordered.filter((segment) => !segment.features.flags.includes("PREF"));
    const pool = nonPrefix.length ? nonPrefix : ordered;
    main = pool.reduce((best, segment) => (chars(segment.form).length > chars(best.form).length ? segment : best));
  }
  const root = ordered.find((segment) => segment.features.root)?.features.root ?? null;
  const { features, tag: pos } = main;
  return {
    position: ordered[0].word,
    text,
    root,
    lemma: features.lemma,
    pos,
    pos_label: POS_LABELS[pos] ?? pos,
    case: features.case,
    case_label: features.case ? (CASE_LABELS[features.case] ?? null) : null,
    features: labelFeatures(features.flags),
  };
}

type SurahIndex = {
  byAyah: Map<number, MorphologyWord[]>;
  bySignature: Map<string, MorphologyWord[]>;
  stream: [string, MorphologyWord][];
};

export class MorphologyEngine {
  private readonly surahs = new Map<number, SurahIndex>();

  constructor(private readonly db: SqlDriver) {}

  private async surahIndex(surah: number): Promise<SurahIndex> {
    const cached = this.surahs.get(surah);
    if (cached) return cached;
    let rows: Awaited<ReturnType<SqlDriver["all"]>> = [];
    try {
      rows = await this.db.all("SELECT ayah, word, segment, form, tag, features FROM morphology_segments WHERE surah = ? ORDER BY ayah, word, segment", [surah]);
    } catch {
      rows = []; // a core.db without morphology: no word analysis, like a server without the file
    }
    const raw = new Map<number, Map<number, Segment[]>>();
    for (const row of rows) {
      let words = raw.get(row.ayah);
      if (!words) raw.set(row.ayah, (words = new Map()));
      let segments = words.get(row.word);
      if (!segments) words.set(row.word, (segments = []));
      segments.push({ form: row.form, tag: row.tag, segment: row.segment, word: row.word, features: parseFeatures(row.features) });
    }
    const index: SurahIndex = { byAyah: new Map(), bySignature: new Map(), stream: [] };
    for (const [ayah, words] of raw) {
      const entries = [...words.keys()].sort((a, b) => a - b).map((word) => aggregateWord(words.get(word)!));
      index.byAyah.set(ayah, entries);
      const signature = normalizeSignature(entries.map((entry) => entry.text).join(""));
      if (signature) index.bySignature.set(signature, entries);
    }
    for (const ayah of [...index.byAyah.keys()].sort((a, b) => a - b)) {
      for (const entry of index.byAyah.get(ayah)!) index.stream.push([normalizeSignature(entry.text), entry]);
    }
    this.surahs.set(surah, index);
    return index;
  }

  async getAyahMorphology(surah: number, ayah: number, text: string | null = null) {
    const index = await this.surahIndex(surah);
    let words: MorphologyWord[] | null | undefined = null;
    if (text) {
      words = index.bySignature.get(normalizeSignature(text));
      if (words === undefined) words = matchWordRun(split(text).map(normalizeSignature), index.stream);
    }
    if (words === null || words === undefined) words = index.byAyah.get(ayah);
    if (!words || !words.length) return { found: false, surah, ayah, words: [] };
    return { found: true, surah, ayah, words };
  }
}

function matchWordRun(verseSigs: string[], stream: [string, MorphologyWord][]): MorphologyWord[] | null {
  if (!stream.length || !verseSigs.length || verseSigs.some((sig) => !sig)) return null;
  const size = verseSigs.length;
  for (let start = 0; start <= stream.length - size; start += 1) {
    if (verseSigs.every((sig, offset) => stream[start + offset][0] === sig)) {
      return verseSigs.map((_, offset) => ({ ...stream[start + offset][1], position: offset + 1 }));
    }
  }
  return null;
}
