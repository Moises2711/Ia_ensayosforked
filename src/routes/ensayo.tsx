import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Square,
  Crown,
  Drama,
  Mic,
  MicOff,
  Volume2,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Play,
  ChevronDown,
  History,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  getLatestRehearsal,
  getScriptSetup,
  updateRehearsalSession,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";
import {
  teleprompterWsUrl,
  type TeleprompterSegment,
  type TeleprompterWsEvent,
} from "@/lib/teleprompter-api";

export const Route = createFileRoute("/ensayo")({
  component: Ensayo,
});

function Wave({ active }: { active?: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`}
          style={{ height: `${30 + Math.sin(i) * 30 + (i % 3) * 20}%` }}
        />
      ))}
    </div>
  );
}

function Ensayo() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("Esperando sesion");
  const [isConnected, setIsConnected] = useState(false);
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [activeSegment, setActiveSegment] = useState<TeleprompterSegment | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [playingCharacter, setPlayingCharacter] = useState<string | null>(null);

  const { data: latest, isLoading: rehearsalLoading } = useQuery({
    queryKey: ["latest-rehearsal"],
    queryFn: getLatestRehearsal,
  });
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", latest?.script_id, latest?.scene_id],
    queryFn: () => getScriptSetup(latest?.script_id ?? undefined, latest?.scene_id ?? undefined),
  });

  const loading = rehearsalLoading || setupLoading;
  const lines = useMemo(() => setup?.lines ?? [], [setup?.lines]);
  const matchedLine = useMemo(
    () => (activeSegment ? findLineForSegment(lines, activeSegment) : null),
    [activeSegment, lines],
  );
  const activeLineIndex = matchedLine ? lines.findIndex((line) => line.id === matchedLine.id) : 0;
  const currentLine = matchedLine ?? lines[0] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;
  const selectedCharacter =
    latest?.selectedCharacter ??
    setup?.characters.find((item) => item.actor_type === "user") ??
    null;
  const completed = Math.max(
    latest?.completed_lines ?? 0,
    activeLineIndex > 0 ? activeLineIndex : Math.min(1, lines.length),
  );
  const total = latest?.total_lines || lines.length || 1;
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const teleprompterSessionId = latest?.teleprompter_session_id ?? null;
  const canUseTeleprompter = Boolean(teleprompterSessionId && isConnected);

  useEffect(() => {
    if (!teleprompterSessionId) {
      setConnectionStatus(
        latest?.teleprompter_status === "error"
          ? "Teleprompter con error"
          : "Sin sesion de teleprompter",
      );
      setIsConnected(false);
      return;
    }

    const ws = new WebSocket(teleprompterWsUrl(`/ws/rehearsal/${teleprompterSessionId}`));
    wsRef.current = ws;
    setConnectionStatus("Conectando teleprompter...");
    setIsConnected(false);

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("Teleprompter conectado");
    };

    ws.onmessage = (event) => {
      let message: TeleprompterWsEvent;
      try {
        message = JSON.parse(event.data) as TeleprompterWsEvent;
      } catch {
        setConnectionStatus("Respuesta invalida del teleprompter");
        return;
      }

      if (message.event === "status") {
        if (message.message !== "keepalive") setConnectionStatus(message.message);
        if (message.message.toLowerCase().includes("iniciado")) setIsRehearsing(true);
        if (message.message.toLowerCase().includes("detenido")) setIsRehearsing(false);
        return;
      }

      if (message.event === "error") {
        setConnectionStatus(message.message);
        toast.error(message.message);
        return;
      }

      if (message.event === "transcription") {
        setLiveTranscript(message.text);
        return;
      }

      if (message.event === "segment_change") {
        setActiveSegment(message.segment);
        setIsMyTurn(message.is_my_turn);
        return;
      }

      if (message.event === "playback_start") {
        setPlayingCharacter(message.character);
        return;
      }

      if (message.event === "playback_finish") {
        setPlayingCharacter(null);
        return;
      }

      if (message.event === "missing_audio") {
        setConnectionStatus(`Falta audio para ${message.segment.character ?? "este segmento"}`);
      }
    };

    ws.onerror = () => {
      setConnectionStatus("No se pudo conectar con FastAPI");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsRehearsing(false);
      setPlayingCharacter(null);
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      ws.close();
    };
  }, [latest?.teleprompter_status, teleprompterSessionId]);

  const sendTeleprompterAction = (action: "start" | "stop" | "reset") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("El teleprompter no esta conectado. Revisa que FastAPI este encendido.");
      return;
    }

    wsRef.current.send(JSON.stringify({ action }));

    if (latest?.id) {
      const status = action === "start" ? "running" : action === "stop" ? "stopped" : "ready";
      updateRehearsalSession(latest.id, {
        teleprompter_status: status,
        teleprompter_last_event: `Accion enviada: ${action}`,
      }).catch(() => null);
    }

    if (action === "start") setIsRehearsing(true);
    if (action === "stop" || action === "reset") setIsRehearsing(false);
  };

  return (
    <AppShell>
      <TopBar back={{ to: "/", label: "Modo ensayo" }} />

      {loading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando sesion desde Postgres...
        </div>
      )}

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
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              Interpretas
            </div>
            <div className="text-sm">
              {selectedCharacter ? `${selectedCharacter.name} (Tu)` : "Sin personaje"}
            </div>
          </div>
        </div>
        <div className="text-xs leading-relaxed">
          <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-0.5">
            Modo
          </div>
          <div>
            Realismo:{" "}
            <span className="text-primary">{difficultyLabel(latest?.ai_difficulty ?? 50)}</span>
          </div>
          <div>
            Ritmo: <span className="text-primary">{modeLabel(latest?.mode ?? "individual")}</span>
          </div>
        </div>
        <Link
          to="/finalizado"
          className="ml-auto inline-flex items-center gap-2 border border-destructive/50 text-destructive rounded-lg px-3 py-2 text-sm hover:bg-destructive/10"
        >
          <Square className="w-3.5 h-3.5 fill-current" /> Finalizar ensayo
        </Link>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-4">
          <LineCard
            title="Linea actual"
            line={currentLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            active
          />
          <LineCard
            title="Siguiente linea"
            line={nextLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
          />
          <LineCard
            title="Despues"
            line={afterLine}
            selectedCharacterId={selectedCharacter?.id ?? null}
            faded
          />

          <div className="bg-card border border-border/60 rounded-xl p-4 mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs">
              <div
                className={`flex items-center gap-1.5 ${isConnected ? "text-success" : "text-muted-foreground"}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
                />{" "}
                Teleprompter
              </div>
              <div className="font-mono text-foreground mt-0.5">{connectionStatus}</div>
            </div>
            <div className="flex items-center gap-2">
              <ControlBtn icon={SkipBack} label="Retroceder linea" />
              <ControlBtn
                icon={Pause}
                label="Pausar"
                onClick={() => sendTeleprompterAction("stop")}
                disabled={!canUseTeleprompter || !isRehearsing}
              />
              <button
                onClick={() => sendTeleprompterAction(isRehearsing ? "stop" : "start")}
                disabled={!canUseTeleprompter}
                className="w-14 h-14 rounded-full bg-primary-gradient text-primary-foreground grid place-items-center shadow-glow ring-4 ring-primary/20 disabled:opacity-50 disabled:shadow-none"
              >
                {isRehearsing ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <ControlBtn icon={SkipForward} label="Siguiente linea" />
              <ControlBtn
                icon={RotateCcw}
                label="Reiniciar escena"
                onClick={() => sendTeleprompterAction("reset")}
                disabled={!canUseTeleprompter}
              />
            </div>
            <div />
          </div>
        </div>

        <aside className="space-y-4">
          <Card title="Personajes en escena">
            <div className="space-y-3">
              {(setup?.characters ?? []).slice(0, 4).map((character) => (
                <CharRow
                  key={character.id}
                  icon={character.id === selectedCharacter?.id ? Crown : Drama}
                  name={`${character.name}${character.id === selectedCharacter?.id ? " (Tu)" : " (IA)"}`}
                  status={character.id === currentLine?.character_id ? "Activo" : "En espera"}
                  muted={character.id === selectedCharacter?.id}
                  playing={
                    playingCharacter === character.name.toUpperCase() ||
                    (character.id === currentLine?.character_id &&
                      character.id !== selectedCharacter?.id &&
                      !isMyTurn)
                  }
                />
              ))}
            </div>
          </Card>

          <Card title="Teleprompter en vivo">
            <Quick label="Sesion FastAPI" value={teleprompterSessionId ? "Lista" : "Sin enlace"} />
            <Quick label="Turno actual" value={isMyTurn ? "Tu turno" : "IA / escucha"} />
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">
                Transcripcion
              </div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {liveTranscript || "Aun no hay transcripcion del microfono."}
              </p>
            </div>
          </Card>

          <Card title="Progreso de la escena">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">Lineas</span>
              <span>
                {completed} / {total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface overflow-hidden">
              <div className="h-full bg-primary-gradient" style={{ width: `${progress}%` }} />
            </div>
          </Card>

          <Card title="Configuracion rapida">
            <Quick label="Nivel de realismo" value={difficultyLabel(latest?.ai_difficulty ?? 50)} />
            <Quick label="Ritmo de ensayo" value={modeLabel(latest?.mode ?? "individual")} />
            <Quick label="Pausa entre lineas" value={`${currentLine?.duration_seconds ?? 4} seg`} />
            <button className="mt-2 w-full text-xs text-primary border border-primary/30 rounded-md py-2 inline-flex items-center justify-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Ir al inicio de la escena
            </button>
          </Card>
        </aside>
      </div>

      <div className="mt-8 text-center">
        <Link to="/finalizado" className="text-xs text-muted-foreground hover:text-primary">
          Ver pantalla de finalizacion sincronizada
        </Link>
      </div>
    </AppShell>
  );
}

function LineCard({
  title,
  line,
  selectedCharacterId,
  active,
  faded,
}: {
  title: string;
  line: ScriptLineWithCharacter | null;
  selectedCharacterId: string | null;
  active?: boolean;
  faded?: boolean;
}) {
  const isUserLine = line?.character_id === selectedCharacterId;
  const tone = isUserLine ? "text-primary" : "text-success";

  return (
    <div>
      <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">{title}</p>
      <div
        className={`${active ? "border-2 border-primary/60 bg-primary/5 shadow-glow" : "border border-border/60 bg-card"} ${
          faded ? "opacity-70" : ""
        } rounded-xl p-5 relative`}
      >
        {active && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center">
            <Play className="w-3 h-3 fill-current" />
          </div>
        )}
        {line ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-semibold ${tone}`}>
                {line.character?.name.toUpperCase() ?? "NARRADOR"} {isUserLine ? "(Tu)" : "(IA)"}
              </span>
              <Wave active={active} />
              {!active && (
                <span className="ml-auto text-xs text-muted-foreground">
                  00:{String(line.duration_seconds).padStart(2, "0")}
                </span>
              )}
            </div>
            <p className="text-lg leading-relaxed font-display italic">"{line.text}"</p>
            {line.cue && <div className="text-xs text-primary/80 text-right mt-2">{line.cue}</div>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay linea registrada para esta posicion.
          </p>
        )}
      </div>
    </div>
  );
}

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
      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border/60 bg-surface hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-inherit"
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
  icon: Icon,
  name,
  status,
  muted,
  playing,
}: {
  icon: typeof Crown;
  name: string;
  status: string;
  muted?: boolean;
  playing?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{name}</div>
        <div className="text-[10px] flex items-center gap-1.5 text-muted-foreground">
          {status} <Wave active={playing} />
        </div>
      </div>
      {muted ? (
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
      <button className="inline-flex items-center gap-1 hover:text-primary">
        {value} <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
}

function difficultyLabel(value: number) {
  if (value < 33) return "Facil";
  if (value < 66) return "Media";
  return "Alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}

function findLineForSegment(lines: ScriptLineWithCharacter[], segment: TeleprompterSegment) {
  const segmentText = normalizeText(segment.text);
  return (
    lines.find((line) => segmentText.includes(normalizeText(line.text))) ??
    lines.find(
      (line) =>
        normalizeText(line.character?.name ?? "") === normalizeText(segment.character ?? ""),
    ) ??
    null
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
