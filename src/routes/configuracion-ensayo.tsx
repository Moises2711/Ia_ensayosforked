import { useEffect, useRef, useState } from "react";
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
  Crown,
  Bot,
  X,
  Lock,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  addCharacterToScript,
  createRehearsalSession,
  getCurrentUserId,
  getPerfilUsuario,
  getScriptSetup,
  getScripts,
  updateCharacter,
  updatePerfilUsuario,
  updateRehearsalSession,
} from "@/lib/rehearsal-data";
import {
  createTeleprompterEnsayo,
  teleprompterApiUrl,
} from "@/lib/teleprompter-api";
import { getGrupoParaScript, getScriptDetailsForGrupo } from "@/lib/grupos-api";

export const Route = createFileRoute("/configuracion-ensayo")({
  component: ConfigEnsayo,
});

const MODES = [
  {
    icon: User,
    value: "individual",
    label: "Individual",
    desc: "Ensaya solo con IA.",
  },
  {
    icon: Users,
    value: "grupo",
    label: "En grupo",
    desc: "Con otros actores.",
  },
  {
    icon: BookOpen,
    value: "lectura",
    label: "Lectura",
    desc: "Lectura sin actuacion.",
  },
] as const;

function ConfigEnsayo() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [selectedScriptId, setSelectedScriptId] = useState("");

  const hidratado = useRef(false);
  useEffect(() => {
    if (hidratado.current) return;
    hidratado.current = true;
    const saved = localStorage.getItem("configuracionEnsayoScriptId");
    if (saved) {
      setSelectedScriptId(saved);
      localStorage.removeItem("configuracionEnsayoScriptId");
    }
  }, []);
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [mode, setMode] = useState<"individual" | "grupo" | "lectura">("individual");
  const [diff, setDiff] = useState(50);
  const [showAddChar, setShowAddChar] = useState(false);
  const [newCharName, setNewCharName] = useState("");
  const [newCharType, setNewCharType] = useState<"user" | "ai">("ai");
  const [openCharMenuId, setOpenCharMenuId] = useState<string | null>(null);
  const [actorTypeMap, setActorTypeMap] = useState<Record<string, "user" | "ai">>({});

  useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentUserId,
  });
  const { data: scripts = [], isLoading: scriptsLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => getScripts(),
  });

  const { data: grupoParaScript, isLoading: grupoLoading } = useQuery({
    queryKey: ["grupo-para-script", selectedScriptId],
    queryFn: () => getGrupoParaScript(selectedScriptId!),
    enabled: !!selectedScriptId,
  });
  const grupoActivo = !grupoLoading && !!grupoParaScript;
  const personajeGrupoId = grupoParaScript?.personajeId ?? null;
  const isAdminGrupo = grupoParaScript?.rol === "admin";

  const effectiveScriptId = selectedScriptId;

  const allScripts = scripts;

  const { data: setup, isLoading: setupLoading } = useQuery({
    queryKey: ["script-setup", effectiveScriptId, selectedSceneId, grupoParaScript?.grupoId],
    queryFn: async () => {
      if (grupoParaScript?.grupoId && effectiveScriptId) {
        const details = await getScriptDetailsForGrupo(effectiveScriptId, grupoParaScript.grupoId);
        const scene =
          details.scenes.find((s) => s.id === selectedSceneId) ?? details.scenes[0] ?? null;
        return {
          script: scripts.find((s) => s.id === effectiveScriptId) ?? null,
          scenes: details.scenes,
          scene,
          characters: details.characters,
          lines: scene ? details.lines.filter((l) => l.scene_id === scene.id) : [],
        };
      }
      return getScriptSetup(effectiveScriptId || undefined, selectedSceneId || undefined);
    },
    enabled: Boolean(effectiveScriptId),
  });

  // Auto-seleccionar primera escena
  useEffect(() => {
    if (!setup?.scene) return;
    setSelectedSceneId((current) => current || setup.scene!.id);
  }, [setup?.scene]);

  // Auto-seleccionar personaje (individual, lectura, y admin en modo grupo)
  useEffect(() => {
    // Miembro no-admin en modo grupo: su personaje lo gestiona el otro effect
    if (mode === "grupo" && !isAdminGrupo) return;
    if (!setup?.characters?.length) {
      setSelectedCharacterId(null);
      return;
    }
    setSelectedCharacterId(
      (current) =>
        current ??
        setup.characters.find((c) => (actorTypeMap[c.id] ?? c?.actor_type) === "user")?.id ??
        setup.characters[0]?.id ??
        null,
    );
  }, [setup?.characters, mode, isAdminGrupo]);

  // En modo grupo (miembro no-admin): asignar personaje desde la asignación del admin
  useEffect(() => {
    if (mode !== "grupo" || isAdminGrupo || !personajeGrupoId) return;
    setSelectedCharacterId(personajeGrupoId);
  }, [mode, isAdminGrupo, personajeGrupoId]);

  // Si no hay grupo activo y el usuario está en modo grupo, volver a individual
  useEffect(() => {
    if (grupoLoading) return;
    if (mode === "grupo" && !grupoActivo) {
      setMode("individual");
      toast.info("No hay ningún grupo activo. Modo cambiado a Individual.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoActivo, grupoLoading]);

  const saveTemplate = useMutation({
    mutationFn: () => updatePerfilUsuario({}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
      toast.success("Configuración guardada");
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
      if (!selectedCharacter && !isAdminGrupo) {
        throw new Error("Selecciona el personaje que vas a interpretar.");
      }
      if (mode === "grupo" && !isAdminGrupo && !personajeGrupoId) {
        throw new Error("El administrador del grupo aún no te ha asignado un personaje.");
      }

      const rehearsal = await createRehearsalSession({
        scriptId: setup.script.id,
        sceneId: setup.scene.id,
        selectedCharacterId: selectedCharacter?.id ?? null,
        mode,
        aiDifficulty: diff,
        suggestEmotions: false,
        allowImprov: false,
        feedbackEnabled: mode !== "lectura",
        totalLines: setup.lines.length,
      });

      let teleprompterSessionId = rehearsal.id;
      try {
        const tp = await createTeleprompterEnsayo({
          idObra: setup.script.id,
          modoEnsayo: mode,
        });
        teleprompterSessionId = tp.id_ensayo;
      } catch {
        // FastAPI no disponible — el ensayo funciona igual con Web Speech API
      }

      await updateRehearsalSession(rehearsal.id, {
        teleprompter_session_id: teleprompterSessionId,
        teleprompter_status: "ready",
      }).catch(() => null);

      localStorage.setItem("activeRehearsalId", rehearsal.id);
      localStorage.setItem("activeTeleprompterSessionId", teleprompterSessionId);

      return rehearsal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-rehearsals"] });
      queryClient.invalidateQueries({ queryKey: ["latest-rehearsal"] });
      toast.success("Ensayo iniciado");
      nav({ to: "/ensayo" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo iniciar"),
  });

  const addCharMutation = useMutation({
    mutationFn: async () => {
      if (!setup?.script) throw new Error("Selecciona un libreto primero.");
      if (!newCharName.trim()) throw new Error("Escribe el nombre del personaje.");
      return addCharacterToScript(
        setup.script.id,
        newCharName,
        newCharType,
        setup.characters.length,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["script-setup"] });
      setShowAddChar(false);
      setNewCharName("");
      toast.success("Personaje agregado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo agregar"),
  });

  const assignCharacterMutation = useMutation({
    mutationFn: async (char: { id: string }) => {
      const newMap: Record<string, "user" | "ai"> = { [char.id]: "user" };
      for (const c of setup?.characters ?? []) {
        if (c.id !== char.id) newMap[c.id] = "ai";
      }
      setActorTypeMap(newMap);
      setSelectedCharacterId(char.id);
      if (mode !== "grupo") {
        await Promise.allSettled(
          Object.entries(newMap).map(([id, type]) =>
            updateCharacter(id, { actor_type: type }),
          ),
        );
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al asignar personaje"),
  });

  const selectedMode = MODES.find((item) => item.value === mode) ?? MODES[0];

  const selectedCharacter =
    setup?.characters?.find((c) => c?.id === selectedCharacterId) ??
    setup?.characters?.[0] ??
    null;

  const isGrupoMode = mode === "grupo";
  const isLecturaMode = mode === "lectura";

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
            disabled={
              startRehearsal.isPending ||
              setupLoading ||
              (isGrupoMode && !isAdminGrupo && !personajeGrupoId)
            }
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
              {isGrupoMode && grupoActivo ? (
                <div>
                  <label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                    Libreto
                  </label>
                  <div className="mt-1 bg-surface/60 border border-border/60 rounded-lg px-3 py-2.5 text-sm flex items-center gap-2 opacity-80">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {setup?.script?.title ?? "Libreto del grupo"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Asignado por el grupo — cámbialo desde la vista de grupo.
                  </p>
                </div>
              ) : (
                <SelectField
                  label="Libreto"
                  value={selectedScriptId}
                  loading={scriptsLoading}
                  placeholder="Selecciona un libreto"
                  options={(allScripts || []).filter(Boolean).map((s) => ({
                    value: s.id,
                    label: s.title,
                    sub: s.author ?? "Autor desconocido",
                  }))}
                  onChange={(value) => {
                    setSelectedScriptId(value);
                    setSelectedSceneId("");
                    setSelectedCharacterId(null);
                  }}
                />
              )}
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

          {/* ── Personajes ── */}
          <Section
            title="2. Personajes"
            subtitle={
              isGrupoMode && !isAdminGrupo
                ? "Tu personaje fue asignado por el administrador del grupo."
                : "Selecciona quien interpretas y revisa las voces de IA."
            }
            action={
              !isGrupoMode || isAdminGrupo ? (
                <button
                  onClick={() => setShowAddChar(true)}
                  className="inline-flex items-center gap-1.5 text-xs bg-primary/10 text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/20 transition"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar personaje
                </button>
              ) : undefined
            }
          >
            {/* Modal agregar personaje */}
            {showAddChar && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">Agregar personaje</h3>
                    <button onClick={() => setShowAddChar(false)}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Nombre</label>
                      <input
                        value={newCharName}
                        onChange={(e) => setNewCharName(e.target.value)}
                        placeholder="Ej: Hamlet, María..."
                        className="w-full mt-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Tipo</label>
                      <div className="flex gap-2 mt-1">
                        {(["user", "ai"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setNewCharType(t)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm transition ${newCharType === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}
                          >
                            {t === "user" ? <Crown className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                            {t === "user" ? "Mi personaje" : "Personaje IA"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => addCharMutation.mutate()}
                      disabled={addCharMutation.isPending || !newCharName.trim()}
                      className="w-full bg-primary-gradient text-primary-foreground rounded-lg py-2 text-sm disabled:opacity-60"
                    >
                      {addCharMutation.isPending ? "Agregando..." : "Agregar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Aviso: miembro sin personaje asignado (no aplica al admin) */}
            {isGrupoMode && grupoActivo && !isAdminGrupo && !personajeGrupoId && (
              <div className="mb-3 flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  El administrador del grupo aún no te ha asignado un personaje. No podrás
                  iniciar el ensayo hasta que te asignen uno.
                </span>
              </div>
            )}
            {/* Aviso: admin puede elegir personaje o ensayar sin uno */}
            {isGrupoMode && grupoActivo && isAdminGrupo && (
              <div className="mb-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>
                  Como administrador, puedes elegir cualquier personaje o iniciar el ensayo sin
                  interpretar ninguno.
                </span>
              </div>
            )}

            <div className="space-y-3">
              {(setup?.characters || []).filter(Boolean).map((character) => {
                // Asignación de este personaje en el grupo (si modo grupo está activo)
                const asignacion = isGrupoMode
                  ? grupoParaScript?.asignaciones?.[character.id]
                  : undefined;
                // ¿Este personaje me pertenece? (asignado al usuario actual)
                const isMyCharacter = isGrupoMode
                  ? character.id === personajeGrupoId || (isAdminGrupo && character.id === selectedCharacterId)
                  : selectedCharacterId === character.id;
                // ¿Está asignado a otro actor del grupo?
                const isOtherActorChar = Boolean(
                  isGrupoMode && asignacion && asignacion.userId !== currentUserId,
                );
                // Resaltado/seleccionado (para el borde de la tarjeta)
                const isAssigned = selectedCharacterId === character.id;
                // Tipo efectivo: user si hay humano asignado, ai si lo leerá TTS
                const effectiveType: "user" | "ai" = isGrupoMode
                  ? isMyCharacter || isOtherActorChar
                    ? "user"
                    : "ai"
                  : ((actorTypeMap[character.id] ?? character.actor_type ?? "ai") as "user" | "ai");
                const menuOpen = openCharMenuId === character.id;
                // Atenuar: personajes no-propios para el miembro; de otros actores para el admin
                const dimmed =
                  (isGrupoMode && !isAdminGrupo && !isMyCharacter) ||
                  (isGrupoMode && isAdminGrupo && isOtherActorChar);
                // Bloquear click: miembro no puede seleccionar; admin no puede tomar personaje ajeno
                const clickDisabled =
                  (isGrupoMode && !isAdminGrupo) ||
                  (isGrupoMode && isAdminGrupo && isOtherActorChar);

                return (
                  <div key={character.id} className={`relative transition-opacity ${dimmed ? "opacity-40" : ""}`}>
                    <button
                      onClick={() => !clickDisabled && setSelectedCharacterId(character.id)}
                      disabled={clickDisabled}
                      className={`w-full grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 items-center border rounded-lg p-3 text-left transition ${
                        isAssigned
                          ? "bg-primary/10 border-primary/50"
                          : "bg-surface/60 border-border/40 hover:border-primary/30"
                      } ${clickDisabled ? "cursor-default" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <div className="w-9 h-9 rounded-full bg-primary/15 grid place-items-center text-primary text-sm font-semibold">
                          {character.name?.[0] || "?"}
                        </div>
                        <div>
                          <div className="text-sm flex items-center gap-1.5">
                            {character.name}
                            {isGrupoMode ? (
                              isMyCharacter ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 bg-primary text-primary-foreground">
                                  <Lock className="w-2.5 h-2.5" /> Tu
                                </span>
                              ) : isOtherActorChar ? (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/25 max-w-[90px] truncate block"
                                  title={asignacion?.displayName}
                                >
                                  {asignacion?.displayName}
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                  {isAdminGrupo ? "Libre" : "IA"}
                                </span>
                              )
                            ) : (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${effectiveType === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                              >
                                {effectiveType === "user" ? "Tu" : "IA"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{character.role ?? "Sin rol"}</div>
                        </div>
                      </div>
                      <MiniValue
                        label="Voz"
                        value={character.voice ?? "Sin voz"}
                        icon={effectiveType === "ai" ? <Volume2 className="w-3.5 h-3.5" /> : null}
                      />
                      <MiniValue label="Emocion base" value={character.base_emotion ?? "Neutral"} />
                      <div />
                      {/* Menú 3 puntos: individual, lectura, y admin en modo grupo */}
                      {(!isGrupoMode || isAdminGrupo) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenCharMenuId(menuOpen ? null : character.id);
                          }}
                          className="p-1 hover:text-primary transition"
                        >
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </button>

                    {(!isGrupoMode || isAdminGrupo) && menuOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 py-1 min-w-[180px]">
                        <button
                          onClick={() => {
                            assignCharacterMutation.mutate(character);
                            setOpenCharMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-sm text-left hover:bg-surface flex items-center gap-2"
                        >
                          <Crown className="w-3.5 h-3.5" /> Interpretar este personaje
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(!isGrupoMode || isAdminGrupo) && (
              <p className="text-xs text-muted-foreground text-center mt-3 inline-flex items-center gap-1.5 w-full justify-center">
                <Info className="w-3 h-3" /> Los personajes vienen de la tabla characters.
              </p>
            )}
          </Section>

          {/* ── Dinámica ── */}
          <Section title="3. Dinamica del ensayo">
            <p className="text-xs text-muted-foreground mb-2">Modo de ensayo</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.value;
                const disabled = item.value === "grupo" && !grupoActivo;

                return (
                  <button
                    key={item.value}
                    onClick={() => !disabled && setMode(item.value)}
                    disabled={disabled}
                    title={
                      disabled
                        ? "El libreto seleccionado no pertenece a ningún grupo"
                        : undefined
                    }
                    className={`p-3 rounded-lg border text-left transition ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : disabled
                        ? "border-border/30 bg-surface/40 opacity-40 cursor-not-allowed"
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

            {/* Descripción contextual del modo seleccionado */}
            {isLecturaMode && (
              <div className="mb-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg p-3">
                <BookOpen className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>
                  <span className="text-foreground font-medium">Modo Lectura:</span> el micrófono
                  estará desactivado. SpeechSynthesis leerá todas las líneas automáticamente,
                  incluyendo las tuyas. No se graba ni se puntúa.
                </span>
              </div>
            )}
            {isGrupoMode && grupoActivo && (
              <div className="mb-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border/40 rounded-lg p-3">
                <Users className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                <span>
                  <span className="text-foreground font-medium">Modo En grupo:</span> cuando
                  sea el turno de otro actor, se reproducirá su grabación más reciente en lugar
                  de la IA.
                  {!isAdminGrupo && " Tu personaje fue asignado por el administrador del grupo."}
                  {isAdminGrupo && " Como administrador, elige el personaje que quieres interpretar."}
                </span>
              </div>
            )}
            {isGrupoMode && !grupoActivo && !grupoLoading && selectedScriptId && (
              <div className="mb-4 flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  El libreto seleccionado no pertenece a ningún grupo del que seas miembro.
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-2 inline-flex items-center gap-1">
              Dificultad de la IA <Info className="w-3 h-3" />
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={diff}
              onChange={(e) => setDiff(+e.target.value)}
              disabled={isLecturaMode}
              className="w-full accent-primary disabled:opacity-40"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              {isLecturaMode ? (
                <span className="w-full text-center">No aplica en modo Lectura</span>
              ) : (
                <>
                  <span>Facil</span>
                  <span>Media</span>
                  <span>Avanzada</span>
                </>
              )}
            </div>
          </Section>
        </div>

        {/* ── Sidebar resumen ── */}
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
            {(setup?.characters || []).filter(Boolean).slice(0, 4).map((character) => {
              const isMe = character.id === selectedCharacter?.id;
              const sidebarAsig = isGrupoMode
                ? grupoParaScript?.asignaciones?.[character.id]
                : undefined;
              const label = isMe
                ? "Tu"
                : isGrupoMode && sidebarAsig
                  ? (sidebarAsig.displayName.split(" ")[0] || "Actor")
                  : "IA";
              return (
                <div key={character.id} className="flex items-center gap-2 text-sm">
                  <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs grid place-items-center">
                    {character.name?.[0] || "?"}
                  </div>
                  <span className="flex-1">{character.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${isMe ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="w-full text-xs text-primary border border-primary/30 rounded-md py-1.5 mb-5">
            {setup?.lines?.length ?? 0} lineas cargadas
          </button>

          <p className="text-[10px] tracking-[0.25em] text-muted-foreground mb-2">CONFIGURACION</p>
          <dl className="text-xs space-y-1.5 mb-5">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Modo de ensayo</dt>
              <dd>{selectedMode.label}</dd>
            </div>
            {isLecturaMode ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Grabación / Puntaje</dt>
                <dd>Desactivado</dd>
              </div>
            ) : (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Dificultad de la IA</dt>
                <dd>{diff < 33 ? "Facil" : diff < 66 ? "Media" : "Avanzada"}</dd>
              </div>
            )}
            {isGrupoMode && grupoActivo && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Personaje</dt>
                <dd>{selectedCharacter?.name ?? (isAdminGrupo ? "Sin rol" : "Sin asignar")}</dd>
              </div>
            )}
          </dl>
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs flex gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <div>
              {isLecturaMode ? (
                <>
                  <div className="text-primary">Modo lectura activado.</div>
                  <div className="text-muted-foreground">
                    Solo lectura visual. No se graba ni puntúa.
                  </div>
                </>
              ) : isGrupoMode ? (
                <>
                  <div className="text-primary">Ensayo colaborativo.</div>
                  <div className="text-muted-foreground">
                    {grupoActivo
                      ? isAdminGrupo
                        ? "Admin: elige tu personaje o ensaya sin rol."
                        : "Las grabaciones del grupo se reproducirán automáticamente."
                      : "Selecciona un libreto de grupo para activar este modo."}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-primary">Listo para sincronizar tu ensayo.</div>
                  <div className="text-muted-foreground">
                    Postgres + FastAPI en {teleprompterApiUrl("/health")}.
                  </div>
                </>
              )}
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
  placeholder,
}: {
  label: string;
  value: string;
  loading: boolean;
  options: { value: string; label: string; sub?: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
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
        {!loading && placeholder && <option value="" disabled>{placeholder}</option>}
        {!loading && !placeholder && options.length === 0 && <option value="">Sin opciones</option>}
        {!loading && options.map((option) => (
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
