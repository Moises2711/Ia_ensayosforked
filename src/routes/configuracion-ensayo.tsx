import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Bookmark,
  Play,
  ArrowRight,
  Plus,
  Volume2,
  MoreVertical,
  User,
  Users,
  BookOpen,
  Info,
  Sparkles,
  Drama,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  createRehearsalSession,
  getPerfilUsuario,
  getScriptSetup,
  getScripts,
  updatePerfilUsuario,
  updateRehearsalSession,
} from "@/lib/rehearsal-data";

// IMPORTACIONES CORREGIDAS
import {
  createTeleprompterEnsayo,
  teleprompterApiUrl,
} from "@/lib/teleprompter-api";

export const Route = createFileRoute("/configuracion-ensayo")({
  component: ConfigEnsayo,
});

const MODES = [
  { icon: User, value: "individual", label: "Individual", desc: "Ensaya solo con IA." },
  { icon: Users, value: "grupo", label: "En grupo", desc: "Con otros actores." },
  { icon: BookOpen, value: "lectura", label: "Lectura", desc: "Lectura sin actuacion." },
] as const;

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-10 h-6 rounded-full transition ${on ? "bg-primary" : "bg-surface border border-border"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition ${on ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function ConfigEnsayo() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [mode, setMode] = useState("individual");
  const [diff, setDiff] = useState(50);
  const [emo, setEmo] = useState(true);
  const [improv, setImprov] = useState(true);
  const [feedback, setFeedback] = useState(false);

  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const { data: scripts = [], isLoading: scriptsLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: getScripts,
  });
  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", selectedScriptId, selectedSceneId],
    queryFn: () => getScriptSetup(selectedScriptId || undefined, selectedSceneId || undefined),
    enabled: selectedScriptId !== "",
  });

  useEffect(() => {
    const profile = profileData?.profile;
    if (!profile) return;
    setMode(profile.rehearsal_mode);
    setDiff(profile.ai_difficulty);
    setEmo(profile.suggest_emotions);
    setImprov(profile.allow_improv);
    setFeedback(profile.feedback_enabled);
  }, [profileData]);

  useEffect(() => {
    if (!selectedScriptId && scripts?.length > 0 && scripts[0]) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [selectedScriptId, scripts]);

  useEffect(() => {
    if (!setup?.scene) return;
    setSelectedSceneId((current) => current || setup.scene!.id);
  }, [setup?.scene]);

  useEffect(() => {
    if (!setup?.characters?.length) {
      setSelectedCharacterId(null);
      return;
    }
    setSelectedCharacterId(
      (current) =>
        current ??
        setup.characters.find((char) => char?.actor_type === "user")?.id ??
        setup.characters[0]?.id ?? 
        null,
    );
  }, [setup?.characters]);

  const saveTemplate = useMutation({
    mutationFn: () =>
      updatePerfilUsuario({
        rehearsal_mode: mode,
        ai_difficulty: diff,
        suggest_emotions: emo,
        allow_improv: improv,
        feedback_enabled: feedback,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      toast.success("Plantilla guardada en perfil_usuario");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  const startRehearsal = useMutation({
    mutationFn: async () => {
      if (!setup?.script || !setup.scene) {
        throw new Error("Selecciona un libreto y una escena.");
      }
      if (!setup.lines?.length) {
        throw new Error("La escena seleccionada no tiene lineas para sincronizar.");
      }
      if (!selectedCharacter) {
        throw new Error("Selecciona el personaje que vas a interpretar.");
      }

      // 1. Crear la sesión en Supabase (Frontend)
      const rehearsal = await createRehearsalSession({
        scriptId: setup.script.id,
        sceneId: setup.scene.id,
        selectedCharacterId: selectedCharacter.id,
        mode,
        aiDifficulty: diff,
        suggestEmotions: emo,
        allowImprov: improv,
        feedbackEnabled: feedback,
        totalLines: setup.lines.length,
      });

      // 2. LÓGICA CORREGIDA PARA FASTAPI
      try {
        const teleprompterSession = await createTeleprompterEnsayo({
          idObra: setup.script.id,
          modoEnsayo: mode,
        });

        return updateRehearsalSession(rehearsal.id, {
          teleprompter_session_id: teleprompterSession.id_ensayo,
          teleprompter_status: "ready",
          teleprompter_last_event: `Sesion FastAPI creada (Ensayo ID: ${teleprompterSession.id_ensayo})`,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "No se pudo conectar con el backend del teleprompter.";

        await updateRehearsalSession(rehearsal.id, {
          teleprompter_status: "error",
          teleprompter_last_event: message,
        }).catch(() => null);

        throw new Error(
          `El ensayo se guardo en Postgres, pero no se pudo iniciar el teleprompter: ${message}`,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-rehearsals"] });
      toast.success("Ensayo sincronizado");
      nav({ to: "/ensayo" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo iniciar"),
  });

  const selectedMode = MODES.find((item) => item.value === mode) ?? MODES[0];
  
  const selectedCharacter =
    setup?.characters?.find((character) => character?.id === selectedCharacterId) ??
    setup?.characters?.[0] ??
    null;

  return (
    <AppShell>
      <TopBar />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl">Configuracion de ensayo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define los detalles y crea una sesion sincronizada con Postgres.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => saveTemplate.mutate()}
            disabled={saveTemplate.isPending}
            className="inline-flex items-center gap-2 border border-border bg-surface rounded-lg px-4 py-2 text-sm hover:border-primary/40 disabled:opacity-60"
          >
            <Bookmark className="w-4 h-4" /> Guardar como plantilla
          </button>
          <button
            onClick={() => startRehearsal.mutate()}
            disabled={startRehearsal.isPending || setupLoading}
            className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-5 py-2 text-sm font-medium shadow-glow disabled:opacity-60"
          >
            <Play className="w-4 h-4 fill-current" />{" "}
            {startRehearsal.isPending ? "Sincronizando..." : "Iniciar ensayo"}{" "}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-5">
          <Section title="1. Libreto y escena">
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectField
                label="Libreto"
                value={selectedScriptId}
                loading={scriptsLoading}
                options={(scripts || []).filter(Boolean).map((script) => ({
                  value: script.id,
                  label: script.title,
                  sub: script.author ?? "Autor desconocido",
                }))}
                onChange={(value) => {
                  setSelectedScriptId(value);
                  setSelectedSceneId("");
                  setSelectedCharacterId(null);
                }}
              />
              <SelectField
                label="Escena"
                value={setup?.scene?.id ?? ""}
                loading={setupLoading}
                options={(setup?.scenes || []).filter(Boolean).map((scene) => ({
                  value: scene.id,
                  label: scene.title,
                  sub: scene.description ?? scene.location ?? "",
                }))}
                onChange={setSelectedSceneId}
              />
            </div>
          </Section>

          <Section
            title="2. Personajes"
            subtitle="Selecciona quien interpretas y revisa las voces de IA."
            action={
              <button className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> Agregar personaje
              </button>
            }
          >
            <div className="space-y-3">
              {(setup?.characters || []).filter(Boolean).map((character) => {
                const active = selectedCharacterId === character.id;
                const tag = character.actor_type === "user" ? "Tu" : "IA";

                return (
                  <button
                    key={character.id}
                    onClick={() => setSelectedCharacterId(character.id)}
                    className={`w-full grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 items-center border rounded-lg p-3 text-left transition ${
                      active
                        ? "bg-primary/10 border-primary/50"
                        : "bg-surface/60 border-border/40 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <div className="w-9 h-9 rounded-full bg-primary/15 grid place-items-center text-primary text-sm font-semibold">
                        {character.name?.[0] || "?"}
                      </div>
                      <div>
                        <div className="text-sm flex items-center gap-1.5">
                          {character.name}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${tag === "Tu" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                          >
                            {tag}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {character.role ?? "Sin rol"}
                        </div>
                      </div>
                    </div>
                    <MiniValue
                      label="Voz"
                      value={character.voice ?? "Sin voz"}
                      icon={tag === "IA" ? <Volume2 className="w-3.5 h-3.5" /> : null}
                    />
                    <MiniValue label="Emocion base" value={character.base_emotion ?? "Neutral"} />
                    <div />
                    <MoreVertical className="w-4 h-4 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3 inline-flex items-center gap-1.5 w-full justify-center">
              <Info className="w-3 h-3" /> Los personajes vienen de la tabla characters.
            </p>
          </Section>

          <div className="grid md:grid-cols-2 gap-5">
            <Section title="3. Dinamica del ensayo">
              <p className="text-xs text-muted-foreground mb-2">Modo de ensayo</p>
              <div className="grid grid-cols-3 gap-2 mb-5">
                {MODES.map((item) => {
                  const Icon = item.icon;
                  const active = mode === item.value;
                  return (
                    <button
                      key={item.value}
                      onClick={() => setMode(item.value)}
                      className={`p-3 rounded-lg border text-left transition ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-surface hover:border-primary/30"
                      }`}
                    >
                      <Icon className="w-4 h-4 mb-1.5" />
                      <div className="text-xs font-medium">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mb-2 inline-flex items-center gap-1">
                Dificultad de la IA <Info className="w-3 h-3" />
              </p>
              <input
                type="range"
                min={0}
                max={100}
                value={diff}
                onChange={(e) => setDiff(+e.target.value)}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Facil</span>
                <span>Media</span>
                <span>Avanzada</span>
              </div>
            </Section>

            <Section title="4. Opciones de IA">
              <ToggleRow
                label="Sugerir emociones"
                desc="La IA sugerira emociones durante la escena."
                on={emo}
                onChange={setEmo}
              />
              <ToggleRow
                label="Improvisacion"
                desc="La IA puede improvisar lineas ocasionales."
                on={improv}
                onChange={setImprov}
              />
              <ToggleRow
                label="Feedback al finalizar"
                desc="La IA dara retroalimentacion al final."
                on={feedback}
                onChange={setFeedback}
              />
            </Section>
          </div>
        </div>

        <aside className="bg-card border border-border/60 rounded-xl p-5 h-fit sticky top-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Resumen del ensayo
          </p>
          <p className="text-[10px] tracking-[0.25em] text-muted-foreground mb-2">LIBRETO</p>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/40">
            <div className="w-12 h-12 rounded-lg bg-stage border border-border grid place-items-center text-primary">
              <Drama className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display">{setup?.script?.title ?? "Sin libreto"}</div>
              <div className="text-xs text-muted-foreground">
                {setup?.script?.author ?? "Autor desconocido"}
              </div>
            </div>
          </div>
          <p className="text-[10px] tracking-[0.25em] text-muted-foreground mb-1">ESCENA</p>
          <p className="text-sm mb-4">{setup?.scene?.title ?? "Sin escena"}</p>

          <p className="text-[10px] tracking-[0.25em] text-muted-foreground mb-2">
            PERSONAJES ({setup?.characters?.length ?? 0})
          </p>
          <div className="space-y-2 mb-4">
            {(setup?.characters || []).filter(Boolean).slice(0, 4).map((character) => (
              <div key={character.id} className="flex items-center gap-2 text-sm">
                <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs grid place-items-center">
                  {character.name?.[0] || "?"}
                </div>
                <span className="flex-1">{character.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${character.id === selectedCharacter?.id ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                >
                  {character.id === selectedCharacter?.id ? "Tu" : "IA"}
                </span>
              </div>
            ))}
          </div>
          <button className="w-full text-xs text-primary border border-primary/30 rounded-md py-1.5 mb-5">
            {setup?.lines?.length ?? 0} lineas cargadas
          </button>

          <p className="text-[10px] tracking-[0.25em] text-muted-foreground mb-2">CONFIGURACION</p>
          <dl className="text-xs space-y-1.5 mb-5">
            {[
              ["Modo de ensayo", selectedMode.label],
              ["Dificultad de la IA", diff < 33 ? "Facil" : diff < 66 ? "Media" : "Avanzada"],
              ["Sugerir emociones", emo ? "Si" : "No"],
              ["Improvisacion", improv ? "Si" : "No"],
              ["Feedback al finalizar", feedback ? "Si" : "No"],
            ].map(([key, value]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs flex gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div>
              <div className="text-primary">Listo para sincronizar tu ensayo.</div>
              <div className="text-muted-foreground">
                Postgres + FastAPI en {teleprompterApiUrl("/health")}.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  loading,
  onChange,
}: {
  label: string;
  value: string;
  loading: boolean;
  options: { value: string; label: string; sub?: string }[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <div>
      <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50"
      >
        {loading && <option value="">Cargando...</option>}
        {!loading && options.length === 0 && <option value="">Sin opciones</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selected?.sub && <p className="text-xs text-muted-foreground mt-1">{selected.sub}</p>}
    </div>
  );
}

function MiniValue({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className="w-full flex items-center justify-between bg-background border border-border/60 rounded-md px-2.5 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          {value} {icon}
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}