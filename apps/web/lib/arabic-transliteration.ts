"use client";

type BeamState = {
  penalty: number;
  value: string;
};

const MAX_TOKEN_CANDIDATES = 12;

const DIGRAPH_MAPPINGS: Array<{ latin: string; outputs: Array<{ value: string; penalty: number }> }> = [
  { latin: "allah", outputs: [{ value: "الله", penalty: 0 }] },
  { latin: "llah", outputs: [{ value: "لله", penalty: 0.05 }] },
  { latin: "sh", outputs: [{ value: "ش", penalty: 0 }] },
  { latin: "kh", outputs: [{ value: "خ", penalty: 0 }] },
  { latin: "gh", outputs: [{ value: "غ", penalty: 0 }] },
  { latin: "th", outputs: [{ value: "ث", penalty: 0.04 }, { value: "ت", penalty: 0.35 }] },
  { latin: "dh", outputs: [{ value: "ذ", penalty: 0.04 }, { value: "د", penalty: 0.35 }] },
  { latin: "ch", outputs: [{ value: "ش", penalty: 0.2 }, { value: "تش", penalty: 0.3 }] },
  { latin: "ph", outputs: [{ value: "ف", penalty: 0.08 }] },
  { latin: "aa", outputs: [{ value: "ا", penalty: 0.05 }] },
  { latin: "ee", outputs: [{ value: "ي", penalty: 0.08 }] },
  { latin: "ii", outputs: [{ value: "ي", penalty: 0.08 }] },
  { latin: "oo", outputs: [{ value: "و", penalty: 0.08 }] },
  { latin: "ou", outputs: [{ value: "و", penalty: 0.12 }] },
  { latin: "uu", outputs: [{ value: "و", penalty: 0.08 }] },
  { latin: "ay", outputs: [{ value: "ي", penalty: 0.22 }, { value: "اي", penalty: 0.3 }] },
  { latin: "aw", outputs: [{ value: "و", penalty: 0.24 }, { value: "او", penalty: 0.32 }] },
];

const SINGLE_CHAR_MAPPINGS: Record<string, Array<{ value: string; penalty: number }>> = {
  "2": [{ value: "أ", penalty: 0.1 }, { value: "ا", penalty: 0.15 }, { value: "ء", penalty: 0.2 }],
  "3": [{ value: "ع", penalty: 0 }],
  "4": [{ value: "غ", penalty: 0.16 }],
  "5": [{ value: "خ", penalty: 0 }],
  "6": [{ value: "ط", penalty: 0 }],
  "7": [{ value: "ح", penalty: 0 }],
  "8": [{ value: "ق", penalty: 0.08 }],
  "9": [{ value: "ص", penalty: 0 }],
  a: [{ value: "ا", penalty: 0.22 }, { value: "", penalty: 0.08 }],
  b: [{ value: "ب", penalty: 0 }],
  c: [{ value: "ك", penalty: 0.16 }, { value: "س", penalty: 0.24 }],
  d: [{ value: "د", penalty: 0 }, { value: "ض", penalty: 0.22 }],
  e: [{ value: "", penalty: 0.06 }, { value: "ي", penalty: 0.22 }],
  f: [{ value: "ف", penalty: 0 }],
  g: [{ value: "ج", penalty: 0.08 }, { value: "غ", penalty: 0.16 }],
  h: [{ value: "ه", penalty: 0.05 }, { value: "ح", penalty: 0.16 }],
  i: [{ value: "", penalty: 0.06 }, { value: "ي", penalty: 0.18 }],
  j: [{ value: "ج", penalty: 0 }],
  k: [{ value: "ك", penalty: 0 }],
  l: [{ value: "ل", penalty: 0 }],
  m: [{ value: "م", penalty: 0 }],
  n: [{ value: "ن", penalty: 0 }],
  o: [{ value: "", penalty: 0.06 }, { value: "و", penalty: 0.22 }],
  p: [{ value: "ب", penalty: 0.12 }],
  q: [{ value: "ق", penalty: 0 }],
  r: [{ value: "ر", penalty: 0 }],
  s: [{ value: "س", penalty: 0 }, { value: "ص", penalty: 0.18 }],
  t: [{ value: "ت", penalty: 0 }, { value: "ط", penalty: 0.16 }],
  u: [{ value: "", penalty: 0.06 }, { value: "و", penalty: 0.2 }],
  v: [{ value: "ف", penalty: 0.08 }],
  w: [{ value: "و", penalty: 0 }],
  x: [{ value: "كس", penalty: 0.2 }, { value: "خ", penalty: 0.38 }],
  y: [{ value: "ي", penalty: 0.06 }],
  z: [{ value: "ز", penalty: 0 }, { value: "ظ", penalty: 0.2 }, { value: "ذ", penalty: 0.25 }],
  "'": [{ value: "", penalty: 0.02 }],
};

function normalizeLatinToken(token: string) {
  return token
    .toLowerCase()
    .replace(/[^\da-z']/g, "")
    .replace(/aa+/g, "aa")
    .replace(/ee+/g, "ee")
    .replace(/ii+/g, "ii")
    .replace(/oo+/g, "oo")
    .replace(/uu+/g, "uu");
}

function pushBeam(
  nextStates: Map<string, number>,
  candidate: string,
  penalty: number,
) {
  const currentPenalty = nextStates.get(candidate);
  if (currentPenalty === undefined || penalty < currentPenalty) {
    nextStates.set(candidate, penalty);
  }
}

function generateBeamCandidates(token: string) {
  let beam: BeamState[] = [{ value: "", penalty: 0 }];
  let index = 0;

  while (index < token.length) {
    const digraph = DIGRAPH_MAPPINGS.find((entry) => token.startsWith(entry.latin, index));
    const nextStates = new Map<string, number>();

    if (digraph) {
      for (const state of beam) {
        for (const output of digraph.outputs) {
          pushBeam(nextStates, `${state.value}${output.value}`, state.penalty + output.penalty);
        }
      }
      index += digraph.latin.length;
    } else {
      const char = token[index];
      const outputs = SINGLE_CHAR_MAPPINGS[char] ?? [{ value: char, penalty: 0.8 }];
      for (const state of beam) {
        for (const output of outputs) {
          pushBeam(nextStates, `${state.value}${output.value}`, state.penalty + output.penalty);
        }
      }
      index += 1;
    }

    beam = Array.from(nextStates.entries())
      .map(([value, penalty]) => ({ value, penalty }))
      .sort((left, right) => left.penalty - right.penalty || left.value.length - right.value.length)
      .slice(0, MAX_TOKEN_CANDIDATES);
  }

  return beam;
}

function expandTokenStart(token: string, candidates: BeamState[]) {
  const expansions = new Map<string, number>();

  for (const candidate of candidates) {
    pushBeam(expansions, candidate.value, candidate.penalty);

    if (token.startsWith("al") && candidate.value) {
      const articleless = candidate.value.replace(/^ا?ل?/, "");
      if (articleless) {
        pushBeam(expansions, `ال${articleless}`, candidate.penalty - 0.08);
      }
    }

    if (token.startsWith("l") && candidate.value.startsWith("ل")) {
      const articleless = candidate.value.replace(/^ل/, "");
      if (articleless) {
        pushBeam(expansions, `لل${articleless}`, candidate.penalty + 0.06);
      }
    }
  }

  return Array.from(expansions.entries())
    .map(([value, penalty]) => ({ value, penalty }))
    .sort((left, right) => left.penalty - right.penalty || left.value.length - right.value.length)
    .slice(0, MAX_TOKEN_CANDIDATES);
}

export function generateArabicTokenCandidates(token: string, limit = MAX_TOKEN_CANDIDATES) {
  const normalized = normalizeLatinToken(token);
  if (!normalized) {
    return [];
  }

  if (/[\u0600-\u06FF]/.test(token)) {
    return [token.trim()];
  }

  const beam = expandTokenStart(normalized, generateBeamCandidates(normalized));
  return Array.from(
    new Set(
      beam
        .map((candidate) => candidate.value.trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

export function generateArabicQueryCandidates(query: string, limit = 10) {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  let beam: BeamState[] = [{ value: "", penalty: 0 }];

  for (const token of tokens) {
    const tokenCandidates = generateArabicTokenCandidates(token, 8);
    if (tokenCandidates.length === 0) {
      return [];
    }

    const nextStates = new Map<string, number>();
    for (const state of beam) {
      for (const candidate of tokenCandidates) {
        const nextValue = state.value ? `${state.value} ${candidate}` : candidate;
        pushBeam(nextStates, nextValue, state.penalty + tokenCandidates.indexOf(candidate) * 0.08);
      }
    }

    beam = Array.from(nextStates.entries())
      .map(([value, penalty]) => ({ value, penalty }))
      .sort((left, right) => left.penalty - right.penalty || left.value.length - right.value.length)
      .slice(0, limit);
  }

  return beam.map((candidate) => candidate.value);
}
