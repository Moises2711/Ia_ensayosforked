import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Users,
  BookOpen,
  Megaphone,
  Trash2,
  UserMinus,
  UserCheck,
  Plus,
  Send,
  Crown,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  getGrupoDetalle,
  eliminarMiembro,
  asignarPersonaje,
  addLibretoAlGrupo,
  removeLibretoDelGrupo,
  reemplazarLibreto,
  publicarAnuncio,
  eliminarAnuncio,
  nombreMiembro,
  formatGrupoDate,
  type GrupoDetalle,
  type MiembroConPerfil,
} from "@/lib/grupos-api";
import { getScripts } from "@/lib/rehearsal-data";

export const Route = createFileRoute("/grupos/$grupoId")({
  component: GrupoDetallePage,
});

type Tab = "MATERIALES" | "MIEMBROS" | "ANUNCIOS";

// ── Helpers ─────────────────────────────────────────────────────────────────

function copiaCodigo(codigo: string) {
  navigator.clipboard.writeText(codigo).then(() => toast.success("Código copiado"));
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ── Tab MATERIALES ───────────────────────────────────────────────────────────

function TabMateriales({ detalle }: { detalle: GrupoDetalle }) {
  const queryClient = useQueryClient();
  const { grupo, libretos, characters, miembros, miRol } = detalle;
  const isAdmin = miRol === "admin";
  const tieneLibreto = libretos.length > 0;

  const [showSelector, setShowSelector] = useState(false);
  const [scriptAConfirmar, setScriptAConfirmar] = useState<{ id: string; title: string } | null>(null);

  const { data: misScripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: getScripts,
    enabled: isAdmin && showSelector,
  });

  const { mutate: addLibreto, isPending: operando } = useMutation({
    mutationFn: (scriptId: string) => addLibretoAlGrupo(grupo.id, scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      toast.success("Libreto añadido al grupo.");
      setShowSelector(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: reemplazar, isPending: reemplazando } = useMutation({
    mutationFn: (scriptId: string) => reemplazarLibreto(grupo.id, scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      toast.success("Libreto reemplazado.");
      setShowSelector(false);
      setScriptAConfirmar(null);
    },
    onError: (err: Error) => { toast.error(err.message); setScriptAConfirmar(null); },
  });

  const { mutate: removeLibreto } = useMutation({
    mutationFn: (scriptId: string) => removeLibretoDelGrupo(grupo.id, scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      toast.success("Libreto quitado del grupo.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const scriptIdsEnGrupo = new Set(libretos.map((l) => l.script_id));
  const scriptsDisponibles = misScripts.filter((s) => !scriptIdsEnGrupo.has(s.id));
  const isPending = operando || reemplazando;

  function handleSeleccionarScript(id: string, title: string) {
    if (tieneLibreto) {
      setScriptAConfirmar({ id, title });
    } else {
      addLibreto(id);
    }
  }

  return (
    <div className="space-y-4">
      {/* Modal de confirmación de reemplazo */}
      {scriptAConfirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card border border-border/60 rounded-2xl w-full max-w-sm p-6 shadow-elevated">
            <h3 className="font-medium text-foreground mb-2">¿Reemplazar el libreto actual?</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Se asignará <span className="text-foreground font-medium">{scriptAConfirmar.title}</span>.
            </p>
            <p className="text-sm text-destructive/80 mb-6">
              Se perderán las asignaciones de personajes actuales.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setScriptAConfirmar(null)}
                className="flex-1 border border-border/60 bg-surface text-foreground rounded-lg py-2.5 text-sm font-medium hover:border-primary/40 transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => reemplazar(scriptAConfirmar.id)}
                disabled={reemplazando}
                className="flex-1 bg-destructive text-destructive-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {reemplazando ? "Reemplazando..." : "Reemplazar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowSelector((v) => !v)}
            className="flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow hover:scale-[1.02] transition"
          >
            <Plus className="w-4 h-4" />
            {tieneLibreto ? "Cambiar libreto" : "Añadir libreto"}
          </button>
        </div>
      )}

      {showSelector && isAdmin && (
        <div className="bg-card border border-border/60 rounded-xl p-4">
          {tieneLibreto && (
            <p className="text-xs text-amber-500/80 mb-3">
              Solo puede haber un libreto por grupo. Seleccionar uno nuevo reemplazará el actual.
            </p>
          )}
          <p className="text-xs text-muted-foreground mb-3">Selecciona un libreto de tu biblioteca:</p>
          {scriptsDisponibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay otros libretos disponibles.</p>
          ) : (
            <div className="space-y-2">
              {scriptsDisponibles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSeleccionarScript(s.id, s.title)}
                  disabled={isPending}
                  className="flex items-center justify-between w-full px-3 py-2.5 bg-surface border border-border/60 rounded-lg text-sm text-left hover:border-primary/40 transition disabled:opacity-50"
                >
                  <span className="font-medium">{s.title}</span>
                  {s.author && <span className="text-xs text-muted-foreground">{s.author}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {libretos.length === 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay libretos en este grupo aún.</p>
        </div>
      )}

      {libretos.map((lib) => {
        const scriptCharacters = characters
          .filter((c) => c.script_id === lib.script_id)
          .sort((a, b) => a.sort_order - b.sort_order);

        return (
          <div key={lib.id} className="bg-card border border-border/60 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-medium text-foreground">{lib.script?.title ?? "Libreto"}</h3>
                {lib.script?.author && (
                  <p className="text-xs text-muted-foreground mt-0.5">{lib.script.author}</p>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeLibreto(lib.script_id)}
                  className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  title="Quitar libreto del grupo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {scriptCharacters.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin personajes detectados.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {scriptCharacters.map((char) => {
                  const miembroAsignado = miembros.find((m) => m.personaje_id === char.id);
                  return (
                    <div key={char.id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Crown className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">{char.name}</span>
                      </div>
                      {miembroAsignado ? (
                        <span className="text-xs text-primary bg-primary/10 border border-primary/20 rounded px-2 py-0.5 shrink-0">
                          {nombreMiembro(miembroAsignado.perfil)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 shrink-0">Sin asignar</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab MIEMBROS ─────────────────────────────────────────────────────────────

function TabMiembros({ detalle }: { detalle: GrupoDetalle }) {
  const queryClient = useQueryClient();
  const { grupo, miembros, characters, miRol } = detalle;
  const isAdmin = miRol === "admin";
  const [asignandoA, setAsignandoA] = useState<string | null>(null);

  const { mutate: expulsar } = useMutation({
    mutationFn: (userId: string) => eliminarMiembro(grupo.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      toast.success("Miembro eliminado del grupo.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: asignar } = useMutation({
    mutationFn: ({ userId, personajeId }: { userId: string; personajeId: string | null }) =>
      asignarPersonaje(grupo.id, userId, personajeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      setAsignandoA(null);
      toast.success("Personaje asignado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      {miembros.map((m) => {
        const name = nombreMiembro(m.perfil);
        const charAsignado = characters.find((c) => c.id === m.personaje_id);
        const esMiAdmin = m.rol === "admin";

        return (
          <div key={m.id} className="bg-card border border-border/60 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 grid place-items-center text-primary font-medium text-sm shrink-0">
                {initials(name)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground text-sm truncate">{name}</span>
                  {esMiAdmin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {charAsignado ? (
                    <span className="text-primary/80">{charAsignado.name}</span>
                  ) : (
                    "Sin personaje asignado"
                  )}
                </p>
              </div>

              {isAdmin && !esMiAdmin && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setAsignandoA((v) => (v === m.user_id ? null : m.user_id))}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
                    title="Asignar personaje"
                  >
                    <UserCheck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => expulsar(m.user_id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    title="Expulsar del grupo"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {asignandoA === m.user_id && isAdmin && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <p className="text-xs text-muted-foreground mb-2">Asignar personaje a {name}:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => asignar({ userId: m.user_id, personajeId: null })}
                    className="text-xs px-2.5 py-1 rounded border border-border/60 bg-surface text-muted-foreground hover:border-primary/40 transition"
                  >
                    Sin personaje
                  </button>
                  {characters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => asignar({ userId: m.user_id, personajeId: c.id })}
                      className={`text-xs px-2.5 py-1 rounded border transition ${
                        m.personaje_id === c.id
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "border-border/60 bg-surface text-foreground hover:border-primary/40"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {miembros.length === 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay miembros registrados.</p>
        </div>
      )}
    </div>
  );
}

// ── Tab ANUNCIOS ─────────────────────────────────────────────────────────────

function TabAnuncios({ detalle }: { detalle: GrupoDetalle }) {
  const queryClient = useQueryClient();
  const { grupo, anuncios, miRol } = detalle;
  const isAdmin = miRol === "admin";
  const [texto, setTexto] = useState("");

  const { mutate: publicar, isPending: publicando } = useMutation({
    mutationFn: () => publicarAnuncio(grupo.id, texto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
      setTexto("");
      toast.success("Anuncio publicado.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: borrarAnuncio } = useMutation({
    mutationFn: (anuncioId: string) => eliminarAnuncio(anuncioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grupo-detalle", grupo.id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="bg-card border border-border/60 rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-2">Publicar anuncio para el grupo</p>
          <textarea
            className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/60 resize-none min-h-[80px]"
            placeholder="Escribe un mensaje para todos los miembros..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={500}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground/60">{texto.length}/500</span>
            <button
              onClick={() => publicar()}
              disabled={texto.trim().length < 3 || publicando}
              className="flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow hover:scale-[1.02] transition disabled:opacity-50 disabled:scale-100"
            >
              <Send className="w-3.5 h-3.5" /> {publicando ? "Publicando..." : "Publicar"}
            </button>
          </div>
        </div>
      )}

      {anuncios.length === 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-8 text-center">
          <Megaphone className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No hay anuncios aún.</p>
        </div>
      )}

      {anuncios.map((a) => (
        <div key={a.id} className="bg-card border border-border/60 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-xs font-medium text-primary">
                  {nombreMiembro(a.perfil)}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatGrupoDate(a.created_at)}
                </span>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">{a.contenido}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => borrarAnuncio(a.id)}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

function GrupoDetallePage() {
  const { grupoId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("MATERIALES");

  const { data: detalle, isLoading, isError } = useQuery({
    queryKey: ["grupo-detalle", grupoId],
    queryFn: () => getGrupoDetalle(grupoId),
  });

  const TABS: { key: Tab; label: string; icon: typeof BookOpen }[] = [
    { key: "MATERIALES", label: "Materiales", icon: BookOpen },
    { key: "MIEMBROS", label: "Miembros", icon: Users },
    { key: "ANUNCIOS", label: "Anuncios", icon: Megaphone },
  ];

  return (
    <AppShell>
      <TopBar />

      <div className="mb-6">
        <Link
          to="/grupos"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Mis Grupos
        </Link>

        {isLoading && (
          <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
            Cargando grupo...
          </div>
        )}

        {isError && (
          <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
            No se pudo cargar el grupo.
          </div>
        )}

        {detalle && (
          <>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-4xl">{detalle.grupo.nombre}</h1>
                  {detalle.miRol === "admin" && (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 self-center">
                      Admin
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Código de invitación:</span>
                  <span className="text-xs font-mono tracking-widest text-foreground bg-surface border border-border/60 rounded px-2 py-0.5">
                    {detalle.grupo.codigo_invitacion}
                  </span>
                  <button
                    onClick={() => copiaCodigo(detalle.grupo.codigo_invitacion)}
                    className="text-muted-foreground/60 hover:text-primary transition"
                    title="Copiar código"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                {detalle.miembros.length}/{detalle.grupo.max_miembros} miembros
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-surface/60 border border-border/40 rounded-xl p-1 mb-6 w-fit">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tab === key
                      ? "bg-card text-foreground shadow-sm border border-border/40"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Contenido de la tab */}
            {tab === "MATERIALES" && <TabMateriales detalle={detalle} />}
            {tab === "MIEMBROS" && <TabMiembros detalle={detalle} />}
            {tab === "ANUNCIOS" && <TabAnuncios detalle={detalle} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
