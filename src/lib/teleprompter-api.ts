const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export function teleprompterApiUrl(path = "") {
  const configured = import.meta.env.VITE_TELEPROMPTER_API_URL ?? DEFAULT_BASE_URL;
  const base = String(configured).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(teleprompterApiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Teleprompter API respondió ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function createTeleprompterEnsayo({
  idObra,
  modoEnsayo,
}: {
  idObra: string;
  modoEnsayo: string;
}) {
  return request<{ id_ensayo: string; id_obra: string; modo_ensayo: string; fecha_hora: string }>(
    "/ensayo",
    { method: "POST", body: JSON.stringify({ id_obra: idObra, modo_ensayo: modoEnsayo }) },
  );
}

/**
 * Calcula score usando SequenceMatcher de Python en el backend.
 * Si el backend no está disponible, usa el cálculo local de textSimilarity.ts.
 */
export async function calculateScoreFromBackend({
  transcription,
  expectedText,
  confidence,
}: {
  transcription: string;
  expectedText: string;
  confidence: number;
}): Promise<{ score: number; similarity: number; confidence: number }> {
  try {
    return await request<{ score: number; similarity: number; confidence: number }>("/score", {
      method: "POST",
      body: JSON.stringify({ transcription, expected_text: expectedText, confidence }),
    });
  } catch {
    const { calculateLineScore } = await import("./textSimilarity");
    const score = calculateLineScore(transcription, expectedText, confidence);
    return { score, similarity: score / 100, confidence };
  }
}
