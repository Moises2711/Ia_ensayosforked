/**
 * Equivalente en TypeScript de SequenceMatcher.ratio() de Python.
 * Usa LCS (Longest Common Subsequence) igual que difflib.
 */
export function sequenceMatcherRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const sa = normalize(a);
  const sb = normalize(b);

  if (sa === sb) return 1.0;
  if (!sa || !sb) return 0.0;

  const m = sa.length;
  const n = sb.length;

  // DP con optimización de memoria O(n)
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (sa[i - 1] === sb[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  const lcs = prev[n];
  return (2 * lcs) / (m + n);
}

/**
 * Score de 0–100 para una línea grabada.
 * Pondera similitud textual (70%) + confianza del STT (30%).
 */
export function calculateLineScore(
  transcript: string,
  expected: string,
  confidence: number,
): number {
  if (!transcript || !expected) return 0;
  const similarity = sequenceMatcherRatio(transcript, expected);
  const raw = similarity * 0.7 + Math.max(0, Math.min(1, confidence)) * 0.3;
  return Math.round(Math.max(0, Math.min(100, raw * 100)));
}
