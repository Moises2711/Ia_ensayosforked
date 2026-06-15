import { useRef, useCallback, useState } from "react";

// ── Web Speech API type declarations ─────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: ISpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface ISpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface ISpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface ISpeechRecognitionCtor {
  new (): ISpeechRecognition;
  prototype: ISpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionCtor;
    webkitSpeechRecognition?: ISpeechRecognitionCtor;
  }
}

// ── Constantes ────────────────────────────────────────────────────────────────
// Con continuous:true el navegador no corta por silencio; lo hacemos nosotros.
// 2 500 ms da margen para pausas dramáticas de 2-3 s en teatro.
const SILENCE_TIMEOUT_MS = 2500;

// ── Hook ─────────────────────────────────────────────────────────────────────
type Options = {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal?: (transcript: string, confidence: number) => void;
  onError?: (error: string) => void;
};

export function useSpeechRecognition({
  lang = "es-MX",
  onInterim,
  onFinal,
  onError,
}: Options = {}) {
  const recRef = useRef<ISpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const finalRef = useRef({ transcript: "", confidence: 0 });
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.("Web Speech API no soportada. Usa Chrome o Edge.");
      return;
    }
    clearSilenceTimer();
    try {
      recRef.current?.abort();
    } catch {}

    const SR = (window.SpeechRecognition ?? window.webkitSpeechRecognition)!;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;       // mantener activo durante pausas
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    finalRef.current = { transcript: "", confidence: 0 };

    const resetSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => {
        // Silencio de 2.5 s detectado → detener y entregar resultado
        try { recRef.current?.stop(); } catch {}
      }, SILENCE_TIMEOUT_MS);
    };

    rec.onresult = (e: ISpeechRecognitionEvent) => {
      resetSilenceTimer(); // reiniciar cuenta atrás con cada fragmento
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        if (e.results[i].isFinal) {
          // Acumular todos los segmentos finales (continuous puede emitir varios)
          finalRef.current = {
            transcript: (finalRef.current.transcript + " " + alt.transcript).trim(),
            confidence: alt.confidence ?? 0.8,
          };
        } else {
          interimText += alt.transcript;
        }
      }
      const display = interimText || finalRef.current.transcript;
      setInterim(display);
      onInterim?.(display);
    };

    rec.onend = () => {
      clearSilenceTimer();
      setIsListening(false);
      setInterim("");
      onFinal?.(finalRef.current.transcript, finalRef.current.confidence);
    };

    rec.onerror = (e: ISpeechRecognitionErrorEvent) => {
      clearSilenceTimer();
      setIsListening(false);
      setInterim("");
      if (e.error !== "no-speech" && e.error !== "aborted") {
        onError?.(e.error);
      }
      onFinal?.(finalRef.current.transcript, finalRef.current.confidence);
    };

    recRef.current = rec;
    // Arrancar el timer desde el inicio por si el usuario no dice nada
    resetSilenceTimer();
    try {
      rec.start();
      setIsListening(true);
    } catch (err) {
      clearSilenceTimer();
      onError?.(String(err));
    }
  }, [isSupported, lang, onInterim, onFinal, onError, clearSilenceTimer]);

  const stop = useCallback(() => {
    clearSilenceTimer();
    try {
      recRef.current?.stop();
    } catch {}
  }, [clearSilenceTimer]);

  const abort = useCallback(() => {
    clearSilenceTimer();
    try {
      recRef.current?.abort();
    } catch {}
    setIsListening(false);
    setInterim("");
  }, [clearSilenceTimer]);

  return { isListening, interim, start, stop, abort, isSupported };
}
