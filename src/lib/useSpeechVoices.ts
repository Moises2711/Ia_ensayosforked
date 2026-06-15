import { useEffect, useState } from "react";

// ── Detección de género por nombre de voz ─────────────────────────────────────
const FEMALE_RE =
  /\b(sofia|sabina|elena|monica|conchita|paulina|valeria|raquel|penelope|silvia|laura|maria|carmen|fernanda|natalia|rosa|lucia|claudia|alicia|mujer|female|woman|femenin)\b/i;
const MALE_RE =
  /\b(diego|pablo|jorge|enrique|miguel|carlos|juan|jose|manuel|antonio|male|man|hombre|masculin)\b/i;

export type VoiceGender = "female" | "male" | "unknown";

export type SpanishVoice = {
  voice: SpeechSynthesisVoice;
  gender: VoiceGender;
  /** Nombre real del sistema para mostrar en UI */
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
  // Si el sistema no tiene voces en español, mostrar todas como fallback
  const pool = spanish.length > 0 ? spanish : all;
  return pool.map((v) => ({ voice: v, gender: guessGender(v), label: v.name }));
}

/**
 * Hook que devuelve las voces en español disponibles en el navegador.
 * Maneja la carga asíncrona de Chrome (evento voiceschanged).
 */
export function useSpeechVoices(): SpanishVoice[] {
  const [voices, setVoices] = useState<SpanishVoice[]>(() => loadSpanishVoices());

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(loadSpanishVoices());
    load(); // Firefox/Safari: sincrónico
    window.speechSynthesis.addEventListener("voiceschanged", load); // Chrome: asíncrono
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  return voices;
}

/**
 * Devuelve la primera voz de un género determinado.
 * Si no hay voces con género conocido, "female" → primera, "male" → segunda.
 */
export function getDefaultVoiceName(
  gender: "female" | "male",
  voices: SpanishVoice[],
): string {
  const match = voices.find((v) => v.gender === gender);
  if (match) return match.voice.name;
  const fallback = gender === "female" ? voices[0] : voices[1] ?? voices[0];
  return fallback?.voice.name ?? "";
}

/**
 * Resuelve una voz por nombre para usarla en SpeechSynthesisUtterance.
 * Se llama dentro de callbacks (fuera de React) por lo que usa getVoices() directamente.
 * Si el nombre no existe o es null, devuelve la primera voz en español disponible.
 */
export function resolveVoice(name: string | null | undefined): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const all = window.speechSynthesis.getVoices();
  if (name) {
    const found = all.find((v) => v.name === name);
    if (found) return found;
  }
  // Fallback: primera voz española, o cualquier voz disponible
  return (
    all.find((v) => v.lang.toLowerCase().startsWith("es")) ??
    all[0] ??
    null
  );
}
