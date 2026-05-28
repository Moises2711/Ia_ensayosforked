import { useMemo, useState } from "react";
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

// NUEVAS IMPORTACIONES: API REST en lugar de WebSockets
import { startRecording, stopRecording } from "@/lib/teleprompter-api";

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
  const [connectionStatus, setConnectionStatus] = useState("Esperando para iniciar...");
  const [isRehearsing, setIsRehearsing] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState(0);

  const { data: latest, isLoading: rehearsalLoading } = useQuery({
    queryKey: ["latest-rehearsal"],
    queryFn: getLatestRehearsal,
  });
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", latest?.script_id, latest?.scene_id],
    queryFn: () => getScriptSetup(latest?.script_id ?? undefined, latest?.scene_id ?? undefined),
    enabled: Boolean(latest?.script_id),
  });

  const loading = rehearsalLoading || setupLoading;
  const lines = useMemo(() => setup?.lines ?? [], [setup?.lines]);
  
  // Líneas actual, siguiente y posterior
  const currentLine = lines[activeLineIndex] ?? null;
  const nextLine = lines[activeLineIndex + 1] ?? null;
  const afterLine = lines[activeLineIndex + 2] ?? null;

  const selectedCharacter =
    latest?.selectedCharacter ??
    setup?.characters.find((item) => item.actor_type === "user") ??
    null;

  const completed = Math.max(latest?.completed_lines ?? 0, activeLineIndex);
  const total = latest?.total_lines || lines.length || 1;
  const progress = Math.min(100, Math.round((completed / total) * 100));
  const teleprompterSessionId = latest?.teleprompter_session_id ?? null;

  const isMyTurn = currentLine?.character_id === selectedCharacter?.id;

  // ─── NUEVA LÓGICA DE GRABACIÓN REST ─────────────────────────────
  const handleToggleRecording = async () => {
    if (!teleprompterSessionId || !selectedCharacter || !currentLine) {
      toast.error("Faltan datos (Ensayo, Personaje o Línea) para grabar.");
      return;
    }

    if (isRehearsing) {
      try {
        setConnectionStatus("Procesando y guardando audio...");
        setIsRehearsing(false);
        await stopRecording();
        setConnectionStatus(`Toma guardada para línea ${activeLineIndex + 1}`);
        toast.success("Audio guardado exitosamente");

        // Auto-avanzar a la siguiente línea si existe
        if (activeLineIndex < lines.length - 1) {
          setActiveLineIndex((prev) => prev + 1);
        }
      } catch (error) {
        toast.error("Error al detener grabación. ¿Está corriendo FastAPI?");
        setConnectionStatus("Error de conexión");
      }
    } else {
      try {
        setConnectionStatus("Grabando micrófono... (Habla ahora)");
        setIsRehearsing(true);
        await startRecording({
          idEnsayo: teleprompterSessionId,
          idActor: selectedCharacter.id,
          idLinea: currentLine.id,
        });
      } catch (error) {
        setIsRehearsing(false);
        toast.error("Error al iniciar grabación. Revisa tu backend en Python.");
        setConnectionStatus("Error al conectar con Python");
      }
    }
  };

  const handleSkipForward = () => {
    setActiveLineIndex((prev) => Math.min(lines.length - 1, prev + 1));
  };

  const handleSkipBackward = () => {
    setActiveLineIndex((prev) => Math.max(0, prev - 1));
  };

  const handleReset = () => {
    setActiveLineIndex(0);
    setConnectionStatus("Escena reiniciada.");
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
              <div className="flex items-center gap-1.5 text-success">
                <span className={`w-1.5 h-1.5 rounded-full ${isRehearsing ? "bg-destructive animate-pulse" : "bg-success"}`} />{" "}
                Teleprompter {isRehearsing ? "(Grabando)" : "(Listo)"}
              </div>
              <div className="font-mono text-foreground mt-0.5">{connectionStatus}</div>
            </div>
            <div className="flex items-center gap-2">
              <ControlBtn icon={SkipBack} label="Retroceder linea" onClick={handleSkipBackward} />
              <button
                onClick={handleToggleRecording}
                disabled={!teleprompterSessionId}
                className={`w-14 h-14 rounded-full grid place-items-center shadow-glow ring-4 disabled:opacity-50 disabled:shadow-none transition-all ${
                  isRehearsing 
                    ? "bg-destructive text-destructive-foreground ring-destructive/20" 
                    : "bg-primary-gradient text-primary-foreground ring-primary/20"
                }`}
              >
                {isRehearsing ? <Square className="w-5 h-5 fill-current" /> : <Mic className="w-6 h-6" />}
              </button>
              <ControlBtn icon={SkipForward} label="Siguiente linea" onClick={handleSkipForward} />
              <ControlBtn icon={RotateCcw} label="Reiniciar" onClick={handleReset} />
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
                  playing={isRehearsing && character.id === currentLine?.character_id}
                />
              ))}
            </div>
          </Card>

          <Card title="Teleprompter en vivo">
            <Quick label="Sesion FastAPI" value={teleprompterSessionId ? "Conectado" : "Desconectado"} />
            <Quick label="Turno actual" value={isMyTurn ? "Tu turno" : "IA / escucha"} />
            <div className="mt-3 rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-1">
                Estado
              </div>
              <p className="text-xs leading-relaxed text-foreground min-h-10">
                {isRehearsing 
                  ? "Grabando... Cuando termines tu línea, presiona Stop para avanzar." 
                  : "Presiona el micrófono para iniciar la grabación de la línea actual."}
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
              <div className="h-full bg-primary-gradient transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </Card>
        </aside>
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
      <span className="font-medium text-right">{value}</span>
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