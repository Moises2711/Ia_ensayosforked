import type { ScriptLineWithCharacter } from "@/lib/rehearsal-data";

export type TeleprompterLoadTextResponse = {
  characters: Record<string, number>;
  total_segments: number;
  text_length: number;
};

export type TeleprompterSessionResponse = {
  session_id: string;
  my_character: string;
  other_character: string;
  created_at: string;
};

export type TeleprompterCoverageResponse = {
  total_segments: number;
  covered_segments: number;
  coverage_pct: number;
};

export type TeleprompterSegment = {
  character: string | null;
  text: string;
  start: number;
  end: number;
};

export type TeleprompterWsEvent =
  | { event: "status"; message: string }
  | { event: "error"; message: string }
  | { event: "transcription"; text: string; confidence: number; position: number }
  | { event: "segment_change"; segment: TeleprompterSegment; is_my_turn: boolean }
  | { event: "playback_start"; character: string }
  | { event: "playback_finish"; character: string }
  | { event: "missing_audio"; segment: TeleprompterSegment };

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export function teleprompterApiUrl(path = "") {
  const configured = import.meta.env.VITE_TELEPROMPTER_API_URL ?? DEFAULT_BASE_URL;
  const base = String(configured).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function teleprompterWsUrl(path: string) {
  const url = new URL(teleprompterApiUrl(path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(teleprompterApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Teleprompter API respondio ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function loadTeleprompterScriptText(text: string, language = "es") {
  return request<TeleprompterLoadTextResponse>("/script/load/text", {
    method: "POST",
    body: JSON.stringify({ text, language }),
  });
}

export function createTeleprompterSession({
  scriptId,
  myCharacter,
  otherCharacter,
}: {
  scriptId: string;
  myCharacter: string;
  otherCharacter: string;
}) {
  return request<TeleprompterSessionResponse>("/session", {
    method: "POST",
    body: JSON.stringify({
      script_id: scriptId,
      my_character: myCharacter,
      other_character: otherCharacter,
    }),
  });
}

export function getTeleprompterCoverage(sessionId: string) {
  return request<TeleprompterCoverageResponse>(`/session/${sessionId}/coverage`);
}

export function buildTeleprompterScriptText({
  title,
  sceneTitle,
  lines,
}: {
  title: string;
  sceneTitle?: string | null;
  lines: ScriptLineWithCharacter[];
}) {
  const chunks = [title, sceneTitle].filter(Boolean) as string[];

  for (const line of lines) {
    const characterName = line.character?.name?.trim() || "Narrador";
    chunks.push(characterName.toUpperCase(), line.text.trim());
  }

  return chunks.join("\n").trim();
}
