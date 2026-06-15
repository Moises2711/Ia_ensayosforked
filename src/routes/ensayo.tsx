import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Square,
  Crown,
  Drama,
  Mic,
  MicOff,
  Volume2,
  SkipBack,
  SkipForward,
  RotateCcw,
  Play,
  Bot,
  Zap,
  ZapOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  getCurrentUserId,
  getLatestRehearsal,
  getScriptSetup,
  getSessionRecordings,
  saveLineRecording,
  updateRehearsalSession,
  uploadAudioToStorage,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { calculateLineScore } from "@/lib/textSimilarity";
import { resolveVoice } from "@/lib/useSpeechVoices";
import { supabase } from "@/integrations/supabase/client";
import { getGrabacionesGrupo, getGrupoParaScript, getScriptDelGrupo, getScriptDetailsForGrupo } from "@/lib/grupos-api";

export const Route = createFileRoute("/ensayo")({
  component: Ensayo,
});

// ── Componente Wave ───────────────────────────────────────────────────────────
function Wave({ active }: { active?: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-full transition-all ${active ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`}
          style={{ height: `${30 + Math.sin(i) * 30 + (i % 3) * 20}%` }}
        />
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
function Ensayo() {
  const nav = useNavigate();

  // ── Navegación de líneas ──────────────────────────────────────────────────
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  // ── Flujo automático ──────────────────────────────────────────────────────
  const [autoFlow, setAutoFlow] = useState(false);
  const autoFlowRef = useRef(false); // ref para acceder dentro de callbacks
  useEffect(() => { autoFlowRef.current = autoFlow; }, [autoFlow]);

  // ── Grabación ────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [interimText, setInterimText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartRef = useRef<number>(0);
  const processingRef = useRef(false); // evita doble-procesamiento

  // ── Reproducción ─────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Datos por línea ───────────────────────────────────────────────────────
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [groupAudioUrls, setGroupAudioUrls] = useState<Record<string, string>>({});
  const [grupoActorNames, setGrupoActorNames] = useState<Record<string, string>>({});
  const [grupoPersonajeId, setGrupoPersonajeId] = useState<string | null>(null);
  const [lineScores, setLineScores] = useState<Record<string, number>>({});

  // ── Stats ─────────────────────────────────────────────────────────────────
  const [repeatedLines, setRepeatedLines] = useState(0);
  const [skippedLines, setSkippedLines] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  // ── Estado UI ─────────────────────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState("Cargando ensayo...");

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentUserId,
  });

  // La query key incluye currentUserId para evitar que el cache de otro usuario
  // se sirva como stale data al cambiar de sesión en el mismo navegador.
  const { data: latest, isLoading: rehearsalLoading } = useQuery({
    queryKey: ["latest-rehearsal", currentUserId],
    queryFn: getLatestRehearsal,
    enabled: Boolean(currentUserId),
  });
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", latest?.script_id, latest?.scene_id],
    queryFn: async () => {
      const scriptId = latest!.script_id!;
      const sceneId = latest?.scene_id ?? undefined;

      // Si el script pertenece a un grupo (otro usuario lo importó), RLS bloquea
      // los SELECT directos a scenes/characters/script_lines. Detectamos el caso
      // y usamos funciones SECURITY DEFINER para cargarlo correctamente.
      const grupoInfo = await getGrupoParaScript(scriptId);
      if (grupoInfo?.grupoId) {
        const [details, script] = await Promise.all([
          getScriptDetailsForGrupo(scriptId, grupoInfo.grupoId),
          getScriptDelGrupo(grupoInfo.grupoId),
        ]);
        const scene = details.scenes.find((s) => s.id === sceneId) ?? details.scenes[0] ?? null;
        return {
          script,
          scenes: details.scenes,
          scene,
          characters: details.characters,
          lines: scene ? details.lines.filter((l) => l.scene_id === scene.id) : [],
        };
      }

      return getScriptSetup(scriptId, sceneId);
    },
    enabled: Boolean(latest?.script_id),
  });

  const loading = rehearsalLoading || setupLoading;
  const lines = useMemo(() => setup?.lines ?? [], [setup?.lines]);

  const currentLine = lines[activeLineIndex] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;

  const selectedCharacter = useMemo(() => {
    // Modo grupo: usar el personaje asignado al usuario actual en grupo_miembros,
    // que es la fuente autoritativa — independiente de lo que tenga la sesión cacheada.
    if (latest?.mode === "grupo" && grupoPersonajeId) {
      return setup?.characters.find((c) => c.id === grupoPersonajeId) ?? null;
    }
    return (
      latest?.selectedCharacter ??
      setup?.characters.find((c) => c.actor_type === "user") ??
      null
    );
  }, [latest?.mode, latest?.selectedCharacter, grupoPersonajeId, setup?.characters]);

  // BUG 1: Usa teleprompter_session_id de Supabase (ya guardado por configuracion-ensayo.tsx)
  const localSessionId = useMemo(
    () => latest?.teleprompter_session_id || latest?.id || null,
    [latest?.teleprompter_session_id, latest?.id],
  );

  const total = latest?.total_lines || lines.length || 1;
  const progress = Math.min(100, Math.round((completedCount / total) * 100));
  const isMyTurn = currentLine?.character_id === selectedCharacter?.id;
  const isLectura = latest?.mode === "lectura";

  // ── Inicializar desde progreso guardado ───────────────────────────────────
  useEffect(() => {
    if (!latest) return;
    if (latest.completed_lines && latest.completed_lines > 0 && activeLineIndex === 0) {
      setActiveLineIndex(latest.completed_lines);
      setCompletedCount(latest.completed_lines);
    }
    if (latest.repeated_lines) setRepeatedLines(latest.repeated_lines);
    if (latest.skipped_lines) setSkippedLines(latest.skipped_lines);
    setConnectionStatus("Sesión lista para grabar.");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id]);

  // En modo lectura el flujo automático arranca solo (no hay grabación, solo TTS)
  useEffect(() => {
    if (!isLectura || loading || lines.length === 0) return;
    setAutoFlow(true);
  }, [isLectura, loading, lines.length]);

  // ── BUG 5: Cargar audioUrls existentes desde Supabase al montar ───────────
  useEffect(() => {
    if (!latest?.id) return;
    getSessionRecordings(latest.id)
      .then((recs) => {
        const urls: Record<string, string> = {};
        const scores: Record<string, number> = {};
        for (const r of recs) {
          if (r.recording_id && r.audio_url) urls[r.recording_id] = r.audio_url;
          if (r.recording_id && r.similarity_score != null) scores[r.recording_id] = r.similarity_score;
        }
        setAudioUrls(urls);
        setLineScores(scores);
      })
      .catch(() => {});
  }, [latest?.id]);

  // ── Grabaciones del grupo: audio de otros actores para este script ────────
  useEffect(() => {
    if (!latest?.script_id) return;
    getGrabacionesGrupo(latest.script_id)
      .then((urls) => setGroupAudioUrls(urls))
      .catch(() => {});
  }, [latest?.script_id]);

  // ── Asignaciones del grupo: { [characterId]: displayName } + personaje propio ─
  useEffect(() => {
    if (!latest?.script_id) return;
    getGrupoParaScript(latest.script_id)
      .then((gps) => {
        if (!gps) return;
        setGrupoPersonajeId(gps.personajeId ?? null);
        const names: Record<string, string> = {};
        for (const [charId, asig] of Object.entries(gps.asignaciones)) {
          names[charId] = asig.displayName;
        }
        setGrupoActorNames(names);
      })
      .catch(() => {});
  }, [latest?.script_id]);

  // Own recordings override group recordings (same key = same line id)
  const mergedAudioUrls = useMemo(
    () => ({ ...groupAudioUrls, ...audioUrls }),
    [groupAudioUrls, audioUrls],
  );

  // ── BUG 4: Web Speech API — callback cuando finaliza reconocimiento ────────
  const handleSpeechFinal = useCallback(
    async (transcript: string, confidence: number) => {
      if (processingRef.current) return;
      processingRef.current = true;

      setIsRecording(false);
      setInterimText("");

      // Detener MediaRecorder
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!currentLine || !latest?.id || !localSessionId) {
        processingRef.current = false;
        return;
      }

      const durationSec = (Date.now() - recordingStartRef.current) / 1000;

      // Calcular score
      const score = transcript
        ? calculateLineScore(transcript, currentLine.text, confidence)
        : 0;

      // BUG 5: Subir audio a Supabase Storage si se capturó
      let audioUrl: string | null = null;
      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const path = `${user.id}/${latest.id}/${currentLine.id}.webm`;
          audioUrl = await uploadAudioToStorage(blob, path);
        }
        audioChunksRef.current = [];
      }

      // Guardar en Supabase
      try {
        await saveLineRecording({
          rehearsalSessionId: latest.id,
          teleprompterSessionId: localSessionId,
          lineId: currentLine.id,
          characterName: currentLine.character?.name ?? "Usuario",
          segmentIndex: activeLineIndex,
          transcription: transcript,
          audioUrl,
          similarityScore: score,
          confidenceScore: confidence,
          durationSec,
        });

        if (audioUrl) setAudioUrls((prev) => ({ ...prev, [currentLine.id]: audioUrl! }));
        setLineScores((prev) => ({ ...prev, [currentLine.id]: score }));
        setConnectionStatus(`✓ Línea grabada — Score: ${score}%`);
        if (transcript) toast.success(`Score: ${score}% — "${transcript.slice(0, 40)}..."`);
      } catch (err) {
        console.warn("Error guardando grabación:", err);
        setConnectionStatus("Error al guardar grabación.");
      }

      // Limpiar el bloqueo ANTES de avanzar para que el effect de auto-flow
      // encuentre processingRef.current = false cuando se dispare
      processingRef.current = false;

      if (activeLineIndex < lines.length - 1) {
        const next = activeLineIndex + 1;
        setCompletedCount((c) => Math.max(c, next));
        setActiveLineIndex(next);
        try {
          await updateRehearsalSession(latest.id, { completed_lines: next });
        } catch {}
      } else {
        setConnectionStatus("¡Escena completa!");
        setAutoFlow(false);
      }
    },
    [currentLine, latest, localSessionId, activeLineIndex, lines.length],
  );

  const { isListening, interim, start: startSR, stop: stopSR, isSupported: srSupported } =
    useSpeechRecognition({
      lang: "es-MX",
      onInterim: setInterimText,
      onFinal: handleSpeechFinal,
      onError: (err) => {
        setIsRecording(false);
        processingRef.current = false;
        toast.error(`Error de micrófono: ${err}`);
        setConnectionStatus("Error en reconocimiento de voz.");
      },
    });

  // ── Funciones de reproducción ─────────────────────────────────────────────
  const playAudioUrl = useCallback(
    (url: string, lineId: string, onEnd?: () => void): Promise<void> =>
      new Promise((resolve) => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsPlaying(true);
        setPlayingLineId(lineId);
        setConnectionStatus("Reproduciendo audio grabado...");

        const finish = () => {
          setIsPlaying(false);
          setPlayingLineId(null);
          setConnectionStatus("Listo.");
          onEnd?.();
          resolve();
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      }),
    [],
  );

  const speakLine = useCallback(
    (text: string, lineId: string, onEnd?: () => void, voiceName?: string) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "es-MX";
      utt.rate = 0.9;
      utt.pitch = 1.0;
      const voice = resolveVoice(voiceName);
      if (voice) utt.voice = voice;
      utt.onend = () => {
        setIsPlaying(false);
        setPlayingLineId(null);
        setConnectionStatus("Listo.");
        onEnd?.();
      };
      setIsPlaying(true);
      setPlayingLineId(lineId);
      setConnectionStatus("IA leyendo línea...");
      window.speechSynthesis.speak(utt);
    },
    [],
  );

  // ── BUG 6: Polling para detectar fin de reproducción (fallback) ───────────
  // HTMLAudioElement.onended ya lo maneja; este polling cierra edge cases
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      if (audioRef.current && audioRef.current.ended) {
        setIsPlaying(false);
        setPlayingLineId(null);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ── Iniciar grabación ─────────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    if (isRecording || processingRef.current) return;

    if (!srSupported) {
      toast.error("Web Speech API no disponible. Usa Chrome o Edge.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
    } catch {
      toast.error("No se pudo acceder al micrófono.");
      return;
    }

    recordingStartRef.current = Date.now();
    setIsRecording(true);
    setInterimText("");
    setConnectionStatus("Grabando... Habla tu línea.");
    startSR();
  }, [isRecording, srSupported, startSR]);

  const handleStopRecording = useCallback(() => {
    stopSR(); // dispara onFinal → handleSpeechFinal
    setConnectionStatus("Procesando voz...");
  }, [stopSR]);

  const handleToggleRecording = useCallback(async () => {
    if (!localSessionId || !selectedCharacter || !currentLine) {
      toast.error("Carga el ensayo antes de grabar.");
      return;
    }
    if (isRecording) {
      handleStopRecording();
    } else {
      await handleStartRecording();
    }
  }, [localSessionId, selectedCharacter, currentLine, isRecording, handleStartRecording, handleStopRecording]);

  // ── Flujo automático ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoFlow || !currentLine || isRecording || isPlaying || loading || processingRef.current) return;

    // Acotación escénica: mostrar brevemente y avanzar sin grabar ni reproducir
    if (currentLine.cue === "stage_direction") {
      const timer = setTimeout(() => {
        if (!autoFlowRef.current) return;
        if (activeLineIndex < lines.length - 1) {
          const next = activeLineIndex + 1;
          setCompletedCount((c) => Math.max(c, next));
          setActiveLineIndex(next);
        } else {
          setAutoFlow(false);
          setConnectionStatus("¡Escena completa!");
        }
      }, 1500);
      return () => clearTimeout(timer);
    }

    const onAiEnd = () => {
      if (!autoFlowRef.current) return;
      if (activeLineIndex < lines.length - 1) {
        const next = activeLineIndex + 1;
        setCompletedCount((c) => Math.max(c, next));
        setActiveLineIndex(next);
      } else {
        setAutoFlow(false);
        setConnectionStatus("¡Escena completa!");
      }
    };

    // En modo Lectura: TTS lee todas las líneas (incluidas las del usuario), sin grabación
    if (isMyTurn && !isLectura) {
      handleStartRecording();
    } else {
      // En Lectura no usamos audioUrls propias (solo TTS); en otros modos sí
      const savedUrl = isLectura ? undefined : mergedAudioUrls[currentLine.id];
      if (savedUrl) {
        playAudioUrl(savedUrl, currentLine.id, onAiEnd);
      } else {
        speakLine(currentLine.text, currentLine.id, onAiEnd, currentLine.character?.voice ?? undefined);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLineIndex, autoFlow, isMyTurn, isLectura, loading]);

  // ── Controles manuales ────────────────────────────────────────────────────
  const handleTogglePlayback = useCallback(
    async (lineId: string, audioUrl?: string, text?: string) => {
      if (isPlaying && playingLineId === lineId) {
        audioRef.current?.pause();
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setPlayingLineId(null);
        setConnectionStatus("Reproducción detenida.");
      } else if (audioUrl) {
        await playAudioUrl(audioUrl, lineId);
      } else if (text) {
        const line = lines.find((l) => l.id === lineId);
        speakLine(text, lineId, undefined, line?.character?.voice ?? undefined);
      }
    },
    [isPlaying, playingLineId, playAudioUrl, speakLine, lines],
  );

  const handleSkipForward = useCallback(() => {
    if (lines.length === 0 || isRecording) return;
    setSkippedLines((s) => s + 1);
    setActiveLineIndex((i) => Math.min(lines.length - 1, i + 1));
  }, [lines.length, isRecording]);

  const handleSkipBackward = useCallback(() => {
    if (lines.length === 0 || isRecording) return;
    setRepeatedLines((r) => r + 1);
    setActiveLineIndex((i) => Math.max(0, i - 1));
  }, [lines.length, isRecording]);

  const handleReset = useCallback(() => {
    setActiveLineIndex(0);
    setAutoFlow(false);
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setIsPlaying(false);
    setConnectionStatus("Escena reiniciada.");
  }, []);

  // ── BUG 3: Finalizar ensayo — escribe ended_at y status antes de navegar ──
  const handleFinalize = useCallback(async () => {
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setAutoFlow(false);

    if (latest?.id) {
      const scores = Object.values(lineScores);
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

      const feedback =
        avgScore == null
          ? null
          : avgScore >= 80
          ? "¡Excelente desempeño! Tu pronunciación y memorización fueron muy buenas."
          : avgScore >= 60
          ? "Buen avance. Sigue practicando para mejorar la fluidez."
          : "Necesitas más práctica. Repite las líneas con score bajo.";

      try {
        await updateRehearsalSession(latest.id, {
          ended_at: new Date().toISOString(),
          status: "completed",
          completed_lines: completedCount,
          repeated_lines: repeatedLines,
          skipped_lines: skippedLines,
          score: avgScore,
          feedback_summary: feedback,
        });
      } catch (err) {
        console.warn("Error finalizando sesión:", err);
      }
    }

    nav({ to: "/finalizado" });
  }, [latest?.id, lineScores, completedCount, repeatedLines, skippedLines, nav]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <TopBar back={{ to: "/", label: "Modo ensayo" }} />

      {loading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando sesión desde Postgres...
        </div>
      )}

      {/* Barra de info */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex flex-wrap items-center gap-6 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">{setup?.script?.title ?? "Sin libreto"}</span>
            <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary">
              {setup?.scene?.title ?? "Sin escena"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {setup?.scene?.location ?? setup?.scene?.description ?? "Escena sincronizada"}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto sm:ml-0">
          <Crown className="w-5 h-5 text-primary" />
          <div>
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Interpretas</div>
            <div className="text-sm">
              {selectedCharacter ? `${selectedCharacter.name} (Tú)` : "Sin personaje"}
            </div>
          </div>
        </div>
        <div className="text-xs leading-relaxed">
          <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-0.5">Modo</div>
          <div>
            Realismo: <span className="text-primary">{difficultyLabel(latest?.ai_difficulty ?? 50)}</span>
          </div>
          <div>
            Ritmo: <span className="text-primary">{modeLabel(latest?.mode ?? "individual")}</span>
          </div>
        </div>
        {/* BUG 3 corregido: botón llama handleFinalize */}
        <button
          onClick={handleFinalize}
          className="ml-auto inline-flex items-center gap-2 border border-destructive/50 text-destructive rounded-lg px-3 py-2 text-sm hover:bg-destructive/10 transition"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Finalizar ensayo
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        {/* Columna izquierda */}
        <div className="space-y-4">
          <LineCard
            title="Línea actual"
            line={currentLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            active
            audioUrl={currentLine ? mergedAudioUrls[currentLine.id] : undefined}
            isGroupAudio={currentLine ? Boolean(groupAudioUrls[currentLine.id] && !audioUrls[currentLine.id]) : false}
            actorName={currentLine?.character_id ? grupoActorNames[currentLine.character_id] : undefined}
            score={currentLine ? lineScores[currentLine.id] : undefined}
            isPlaying={isPlaying && playingLineId === currentLine?.id}
            onTogglePlayback={handleTogglePlayback}
            interimText={isRecording && currentLine ? interimText : undefined}
          />
          <LineCard
            title="Siguiente línea"
            line={nextLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            audioUrl={nextLine ? mergedAudioUrls[nextLine.id] : undefined}
            isGroupAudio={nextLine ? Boolean(groupAudioUrls[nextLine.id] && !audioUrls[nextLine.id]) : false}
            actorName={nextLine?.character_id ? grupoActorNames[nextLine.character_id] : undefined}
            score={nextLine ? lineScores[nextLine.id] : undefined}
            isPlaying={isPlaying && playingLineId === nextLine?.id}
            onTogglePlayback={handleTogglePlayback}
          />
          <LineCard
            title="Después"
            line={afterLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            faded
            audioUrl={afterLine ? mergedAudioUrls[afterLine.id] : undefined}
            isGroupAudio={afterLine ? Boolean(groupAudioUrls[afterLine.id] && !audioUrls[afterLine.id]) : false}
            actorName={afterLine?.character_id ? grupoActorNames[afterLine.character_id] : undefined}
            score={afterLine ? lineScores[afterLine.id] : undefined}
            isPlaying={isPlaying && playingLineId === afterLine?.id}
            onTogglePlayback={handleTogglePlayback}
          />

          {/* Controles */}
          <div className="bg-card border border-border/60 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <div className="flex items-center gap-1.5 text-success">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-destructive animate-pulse" : isPlaying ? "bg-primary animate-pulse" : "bg-success"}`}
                />{" "}
                {isRecording ? "Grabando" : isPlaying ? "Reproduciendo" : "Listo"}
              </div>
              <div className="font-mono text-foreground mt-0.5 max-w-[220px] truncate">{connectionStatus}</div>
              {isRecording && interimText && (
                <div className="text-primary/80 italic mt-1 max-w-[220px] truncate text-[11px]">
                  "{interimText}"
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <ControlBtn
                icon={SkipBack}
                label="Retroceder"
                onClick={handleSkipBackward}
                disabled={activeLineIndex === 0 || isRecording}
              />

              {/* Botón mic principal */}
              <button
                onClick={handleToggleRecording}
                disabled={!localSessionId || isPlaying || currentLine?.cue === "stage_direction" || isLectura}
                title={isLectura ? "Modo Lectura: micrófono desactivado" : currentLine?.cue === "stage_direction" ? "Acotación escénica" : isMyTurn ? undefined : "No es tu turno"}
                className={`w-14 h-14 rounded-full grid place-items-center shadow-glow ring-4 disabled:opacity-50 disabled:shadow-none transition-all ${
                  isRecording
                    ? "bg-destructive text-destructive-foreground ring-destructive/20"
                    : isMyTurn
                    ? "bg-primary-gradient text-primary-foreground ring-primary/20"
                    : "bg-surface text-muted-foreground ring-border/20 border border-border"
                }`}
              >
                {isRecording ? (
                  <Square className="w-5 h-5 fill-current" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>

              <ControlBtn
                icon={SkipForward}
                label="Siguiente"
                onClick={handleSkipForward}
                disabled={activeLineIndex >= lines.length - 1 || isRecording}
              />
              <ControlBtn
                icon={RotateCcw}
                label="Reiniciar"
                onClick={handleReset}
                disabled={isRecording}
              />
            </div>

            {/* BUG 7: Botón flujo automático — bloqueado en lectura (siempre activo) */}
            <button
              onClick={() => !isLectura && setAutoFlow((v) => !v)}
              disabled={isRecording || loading || lines.length === 0 || isLectura}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs transition disabled:opacity-50 ${
                autoFlow
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/60 bg-surface text-muted-foreground hover:border-primary/40 hover:text-primary"
              }`}
            >
              {autoFlow ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              {isLectura ? "Lectura" : autoFlow ? "Auto ON" : "Auto OFF"}
            </button>
          </div>
        </div>

        {/* Sidebar derecha */}
        <aside className="space-y-4">
          <Card title="Personajes en escena">
            <div className="space-y-3">
              {(setup?.characters ?? []).slice(0, 5).map((character) => (
                <CharRow
                  key={character.id}
                  isUser={character.id === selectedCharacter?.id}
                  name={`${character.name}${character.id === selectedCharacter?.id ? " (Tú)" : " (IA)"}`}
                  status={character.id === currentLine?.character_id ? "Activo" : "En espera"}
                  playing={
                    (isRecording && character.id === selectedCharacter?.id) ||
                    (isPlaying && character.id === currentLine?.character_id)
                  }
                />
              ))}
            </div>
          </Card>

          <Card title="Teleprompter en vivo">
            <Quick label="Sesión" value={localSessionId ? "Conectado" : "Sin sesión"} />
            <Quick label="Turno actual" value={isMyTurn ? "Tú hablas" : "IA / escucha"} />
            <Quick label="Flujo auto" value={autoFlow ? "Activado" : "Manual"} />
            {Object.keys(groupAudioUrls).length > 0 && (
              <Quick
                label="Ensayo grupal"
                value={`${Object.keys(groupAudioUrls).length} líneas grabadas`}
              />
            )}
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">Estado</div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {isLectura
                  ? "Modo Lectura — SpeechSynthesis lee todas las líneas. Solo sigue el guion visualmente."
                  : isRecording
                  ? "Grabando... Cuando termines tu línea, presiona Stop o habla hasta el silencio."
                  : isPlaying
                  ? "Reproduciendo audio del personaje..."
                  : autoFlow
                  ? "Flujo automático activo — el ensayo avanza solo."
                  : "Presiona el micrófono para grabar tu línea, o activa el flujo automático."}
              </p>
            </div>
          </Card>

          <Card title="Progreso de la escena">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Líneas</span>
              <span>
                {completedCount} / {total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-3">
              <div className="h-full bg-primary-gradient transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Omitidas: {skippedLines}</span>
              <span>Repetidas: {repeatedLines}</span>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

// ── LineCard ──────────────────────────────────────────────────────────────────
function LineCard({
  title,
  line,
  selectedCharacterId,
  active,
  faded,
  audioUrl,
  isGroupAudio,
  actorName,
  score,
  isPlaying,
  onTogglePlayback,
  interimText,
}: {
  title: string;
  line: ScriptLineWithCharacter | null;
  selectedCharacterId: string | null;
  active?: boolean;
  faded?: boolean;
  audioUrl?: string;
  isGroupAudio?: boolean;
  actorName?: string;
  score?: number;
  isPlaying?: boolean;
  onTogglePlayback?: (lineId: string, audioUrl?: string, text?: string) => void;
  interimText?: string;
}) {
  const isStageDir = line?.cue === "stage_direction";
  const isUserLine = !isStageDir && line?.character_id === selectedCharacterId;
  const tone = isUserLine ? "text-primary" : "text-success";

  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">{title}</p>

      {/* ── Acotación escénica ── */}
      {isStageDir && line ? (
        <div
          className={`border border-amber-500/30 bg-amber-500/5 ${faded ? "opacity-60" : ""} rounded-xl p-4`}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Drama className="w-3.5 h-3.5 text-amber-500/70" />
            <span className="text-[10px] tracking-widest text-amber-500/70 uppercase">Acotación</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground italic">{line.text}</p>
        </div>
      ) : (
        /* ── Línea de diálogo ── */
        <div
          className={`${active ? "border-2 border-primary/60 bg-primary/5 shadow-glow" : "border border-border/60 bg-card"} ${faded ? "opacity-70" : ""} rounded-xl p-5 relative`}
        >
          {line ? (
            <>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`text-sm font-semibold ${tone}`}>
                  {line.character?.name.toUpperCase() ?? "NARRADOR"}{" "}
                  {isUserLine ? "(Tú)" : actorName ? `(${actorName})` : isGroupAudio ? "(Actor)" : "(IA)"}
                </span>
                <Wave active={active} />
                <span className="text-xs text-muted-foreground">
                  {String(line.duration_seconds ?? 0).padStart(2, "0")}s
                </span>
                {score != null && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${score >= 80 ? "border-success/40 text-success" : score >= 60 ? "border-primary/40 text-primary" : "border-destructive/40 text-destructive"}`}
                  >
                    {score}%
                  </span>
                )}
                {/* Botón play: para líneas IA siempre (TTS), para líneas usuario solo si hay audio */}
                {onTogglePlayback && (!isUserLine || audioUrl) && (
                  <button
                    onClick={() => onTogglePlayback(line.id, audioUrl, line.text)}
                    className="w-7 h-7 rounded-full bg-primary/10 text-primary grid place-items-center hover:bg-primary/20 transition"
                  >
                    {isPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                  </button>
                )}
              </div>
              <p className="text-lg leading-relaxed font-display italic">"{line.text}"</p>
              {interimText && (
                <p className="text-sm text-primary/70 italic mt-2 border-t border-primary/20 pt-2">
                  Escuchando: "{interimText}"
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No hay línea para esta posición.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function ControlBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-inherit cursor-pointer"
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4">
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-3">{title}</p>
      {children}
    </div>
  );
}

function CharRow({
  isUser,
  name,
  status,
  playing,
}: {
  isUser: boolean;
  name: string;
  status: string;
  playing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
        {isUser ? <Crown className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{name}</div>
        <div className="text-[10px] flex items-center gap-1.5 text-muted-foreground">
          {status} <Wave active={playing} />
        </div>
      </div>
      {isUser ? (
        <MicOff className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Volume2 className="w-4 h-4 text-primary" />
      )}
    </div>
  );
}

function Quick({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function difficultyLabel(value: number) {
  if (value < 33) return "Fácil";
  if (value < 66) return "Media";
  return "Alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
