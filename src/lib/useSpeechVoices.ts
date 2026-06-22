import { useEffect, useState } from "react";

const FEMALE_RE =
  /\b(sofia|sabina|elena|monica|conchita|paulina|valeria|raquel|penelope|silvia|laura|maria|carmen|fernanda|natalia|rosa|lucia|claudia|alicia|mujer|female|woman|femenin)\b/i;
const MALE_RE =
  /\b(diego|pablo|jorge|enrique|miguel|carlos|juan|jose|manuel|antonio|raul|male|man|hombre|masculin)\b/i;

export const PREFS_VOICE_KEY = "prefs_voice";

export type VoiceGender = "female" | "male" | "unknown";

export type SpanishVoice = {
  voice: SpeechSynthesisVoice;
  gender: VoiceGender;
  label: string;
};

function guessGender(v: SpeechSynthesisVoice): VoiceGender {
  if (FEMALE_RE.test(v.name)) return "female";
  if (MALE_RE.test(v.name)) return "male";
  return "unknown";
}

function loadSpanishVoices(): SpanishVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const all = window.speechSynthesis.getVoices();
  const spanish = all.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const pool = spanish.length > 0 ? spanish : all;
  return pool.map((v) => ({ voice: v, gender: guessGender(v), label: v.name }));
}

export function useSpeechVoices(): SpanishVoice[] {
  const [voices, setVoices] = useState<SpanishVoice[]>(() => loadSpanishVoices());

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(loadSpanishVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  return voices;
}

export function getDefaultVoiceName(
  gender: "female" | "male",
  voices: SpanishVoice[],
): string {
  const match = voices.find((v) => v.gender === gender);
  if (match) return match.voice.name;
  const fallback = gender === "female" ? voices[0] : voices[1] ?? voices[0];
  return fallback?.voice.name ?? "";
}

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function resolveVoice(
  name: string | null | undefined,
  fallbackKey?: string | null,
): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const all = window.speechSynthesis.getVoices();
  const spanish = all.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const pool = spanish.length > 0 ? spanish : all;

  if (name) {
    const found = all.find((v) => v.name === name);
    if (found) return found;
  }

  if (fallbackKey && pool.length > 0) {
    return pool[hashText(fallbackKey) % pool.length] ?? null;
  }

  const preferred = window.localStorage.getItem(PREFS_VOICE_KEY);
  if (preferred) {
    const found = all.find((v) => v.name === preferred);
    if (found) return found;
  }

  return pool[0] ?? null;
}
