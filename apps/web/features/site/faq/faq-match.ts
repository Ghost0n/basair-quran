import { foldText } from "../site-search";

/**
 * "Ask a question" on /faq (docs/public-site.md → "The FAQ"): before a
 * question is sent to the team, it is matched against the answers already
 * written, in the reader's language. A match points to the answer instead of
 * sending; the reader can still send when theirs is a different question.
 */
export type FaqCandidate = { id: string; question: string; keywords: string; answer: string };
export type FaqMatch = { id: string; score: number };

/** Words that say nothing about the subject (folded), in the languages whose words are spaced. */
const STOP = new Set(
  foldText(
    [
      "هل ما ماذا كيف لماذا متى اين أين من في على عن الى إلى او أو و ثم هو هي انا أنا لي لك هذا هذه ذلك التي الذي كان يمكن يمكنني استطيع أستطيع اريد أريد",
      "the a an is are was be do does did how what why when where which who can could i me my you your it its to of in on for with and or not there this that please",
      "le la les un une des est sont comment quoi pourquoi je mon ma mes de du en et ou pour avec que qui ce",
      "der die das ein eine ist sind wie was warum ich mein und oder zu von mit für",
      "el la los las un una es son como cómo que qué por yo mi de en y o con para",
      "kak chto pochemu",
      "bagaimana apa mengapa saya di ke dan atau yang untuk",
      "nasıl ne neden ben bir ve veya için",
    ].join(" "),
  ).split(" "),
);

/** A word without the Arabic article and its common clitics (و، ب، ل، ف + ال), so «الخط» meets «خط». */
function stem(word: string): string {
  const bare = word.replace(/^(?:[وفبل]?ال|لل)(?=..)/, "");
  return bare.length > 2 ? bare : word;
}

function words(text: string): string[] {
  return foldText(text)
    .split(" ")
    .filter((word) => word.length > 1 && !STOP.has(word))
    .map(stem);
}

/** Two words meet when they are equal or one begins the other (3 letters at least, 2 Korean or Chinese syllables): «حساب» ~ «حسابي», «font» ~ «fonts». */
function meet(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A Korean or Chinese syllable carries more than a letter: two are a word (계정 ~ 계정을).
  const least = /[\p{Script=Hangul}\p{Script=Han}]/u.test(short) ? 2 : 3;
  return short.length >= least && long.startsWith(short);
}

/** Letter pairs, for the languages written without spaces (Chinese, Japanese). */
function pairs(text: string): Set<string> {
  const folded = foldText(text).replace(/\s+/g, "");
  const out = new Set<string>();
  for (let index = 0; index < folded.length - 1; index += 1) out.add(folded.slice(index, index + 2));
  return out;
}

/** How well a question matches each entry (0–1), best first; entries with nothing in common are left out. */
export function rankFaq(question: string, entries: readonly FaqCandidate[]): FaqMatch[] {
  const asked = words(question);
  const unspaced = asked.length <= 1 && foldText(question).replace(/\s+/g, "").length >= 4 && !/\s/.test(question.trim());
  const ranked: FaqMatch[] = [];
  for (const entry of entries) {
    let score = 0;
    if (unspaced) {
      // Share of the question's letter pairs found in the entry's question and keywords.
      const mine = pairs(question);
      const theirs = pairs(`${entry.question} ${entry.keywords}`);
      let shared = 0;
      for (const pair of mine) if (theirs.has(pair)) shared += 1;
      score = mine.size ? shared / mine.size : 0;
    } else if (asked.length) {
      // Each word of the question counts fully when the entry's question or keywords
      // have it, half when only the answer does.
      const strong = words(`${entry.question} ${entry.keywords}`);
      const weak = words(entry.answer);
      let total = 0;
      for (const word of asked) {
        if (strong.some((other) => meet(word, other))) total += 1;
        else if (weak.some((other) => meet(word, other))) total += 0.5;
      }
      score = total / asked.length;
    }
    if (score > 0) ranked.push({ id: entry.id, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** A question is already answered when its best match covers most of it. */
export const ANSWERED = 0.6;
