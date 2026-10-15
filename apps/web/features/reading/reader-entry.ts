/**
 * Where the reader opens when it is entered.
 *
 * The reader always opens on Al-Fatiha — after a launch, and every time it
 * is entered from another screen — except when:
 *  - the way in named a place: a saved page, a verse from search, the
 *    library, a board… (those load their page *before* switching to the
 *    reader, which this module counts as an explicit load);
 *  - Home's «تابع» asked to resume the last reading (requestReaderResume);
 *  - a recitation is under way: the reader opens on the recited verse.
 *
 * Module state, not React state: it has to outlive the reader screen, which
 * unmounts on phones as soon as another screen opens.
 */
export type ReaderEntry = "resume" | "explicit" | "fresh";

let loads = 0;
let loadsAtLastEntry = 0;
let resumeRequested = false;

/** A page was loaded on purpose (every MushafController load counts). */
export function noteReaderLoad(): void {
  loads += 1;
}

/** Home's «تابع القراءة» / «تابع التلاوة»: the next entry resumes the last position. */
export function requestReaderResume(): void {
  resumeRequested = true;
}

/** The reader is (re)entered: how it should open. Consumes the request. */
export function takeReaderEntry(): ReaderEntry {
  const entry: ReaderEntry = resumeRequested ? "resume" : loads !== loadsAtLastEntry ? "explicit" : "fresh";
  resumeRequested = false;
  loadsAtLastEntry = loads;
  return entry;
}

/** While the reader is on screen its own loads (page turns) are not "the way in". */
export function settleReaderLoads(): void {
  loadsAtLastEntry = loads;
}

/** Tests only. */
export function resetReaderEntryForTests(): void {
  loads = 0;
  loadsAtLastEntry = 0;
  resumeRequested = false;
}
