import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Plus, LogIn, MoreVertical, Crown, Trash2, LogOut, Copy, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  crearGrupo,
  unirseAGrupo,
  getMisGrupos,
  eliminarGrupo,
  salirDeGrupo,
  type GrupoConRol,
} from "@/lib/grupos-api";

export const Route = createFileRoute("/grupos/")({
  component: GruposList,
});

// ── Helpers ────────────────────────────────────────────────────────────────

function generarCodigoLocal() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function copiaCodigo(codigo: string) {
  navigator.clipboard.writeText(codigo).then(() => toast.success("Código copiado"));
}

// ── Modal Crear ─────────────────────────────────────────────────────────────

function ModalCrear({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [maxMiembros, setMaxMiembros] = useState(10);
  const [codigoCustom, setCodigoCustom] = useState("");
  const [usarCodigoPropio, setUsarCodigoPropio] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      crearGrupo(nombre, maxMiembros, usarCodigoPropio ? codigoCustom : undefined),
    onSuccess: (grupo) => {
      queryClient.invalidateQueries({ queryKey: ["mis-grupos"] });
      toast.success(`Grupo "${grupo.nombre}" creado. Código: ${grupo.codigo_invitacion}`);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const puedeGuardar =
    nombre.trim().length >= 2 &&
    (!usarCodigoPropio || codigoCustom.trim().length === 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-card border border-border/60 rounded-2xl w-full max-w-md p-6 shadow-elevated">
        <h2 className="font-display text-2xl mb-5">Crear grupo</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nombre del grupo *</label>
            <input
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
              placeholder="Ej. Compañía Estrella"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={60}
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Límite de miembros</label>
            <input
              type="number"
              min={2}
              max={30}
              className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/60"
              value={maxMiembros}
              onChange={(e) => setMaxMiembros(Math.max(2, Math.min(30, Number(e.target.value))))}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={usarCodigoPropio}
                onChange={(e) => setUsarCodigoPropio(e.target.checked)}
                className="accent-primary"
              />
              Código de invitación personalizado
            </label>

            {usarCodigoPropio ? (
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-foreground focus:outline-none focus:border-primary/60"
                  placeholder="10 caracteres"
                  value={codigoCustom}
                  onChange={(e) => setCodigoCustom(e.target.value.toUpperCase().slice(0, 10))}
                  maxLength={10}
                />
                <button
                  type="button"
                  onClick={() => setCodigoCustom(generarCodigoLocal())}
                  className="p-2 rounded-lg bg-surface border border-border/60 text-muted-foreground hover:text-foreground transition"
                  title="Generar aleatorio"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/70">Se generará automáticamente.</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-border/60 bg-surface text-foreground rounded-lg py-2.5 text-sm font-medium hover:border-primary/40 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutate()}
            disabled={!puedeGuardar || isPending}
            className="flex-1 bg-primary-gradient text-primary-foreground rounded-lg py-2.5 text-sm font-medium shadow-glow hover:scale-[1.02] transition disabled:opacity-50 disabled:scale-100"
          >
            {isPending ? "Creando..." : "Crear grupo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Unirse ────────────────────────────────────────────────────────────

function ModalUnirse({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: () => unirseAGrupo(codigo),
    onSuccess: (grupo) => {
      queryClient.invalidateQueries({ queryKey: ["mis-grupos"] });
      toast.success(`Te uniste a "${grupo.nombre}"`);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-card border border-border/60 rounded-2xl w-full max-w-sm p-6 shadow-elevated">
        <h2 className="font-display text-2xl mb-5">Unirse a grupo</h2>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Código de invitación</label>
          <input
            className="w-full bg-surface border border-border/60 rounded-lg px-3 py-3 text-sm font-mono tracking-widest text-foreground text-center focus:outline-none focus:border-primary/60"
            placeholder="XXXXXXXXXX"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 10))}
            maxLength={10}
            autoFocus
          />
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 border border-border/60 bg-surface text-foreground rounded-lg py-2.5 text-sm font-medium hover:border-primary/40 transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutate()}
            disabled={codigo.length !== 10 || isPending}
            className="flex-1 bg-primary-gradient text-primary-foreground rounded-lg py-2.5 text-sm font-medium shadow-glow hover:scale-[1.02] transition disabled:opacity-50 disabled:scale-100"
          >
            {isPending ? "Uniéndome..." : "Unirme"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GrupoCard ───────────────────────────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: GrupoConRol }) {
  const queryClient = useQueryClient();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const isAdmin = grupo.miRol === "admin";

  const { mutate: eliminar, isPending: eliminando } = useMutation({
    mutationFn: () => eliminarGrupo(grupo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mis-grupos"] });
      toast.success(`Grupo "${grupo.nombre}" eliminado.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: salir, isPending: saliendo } = useMutation({
    mutationFn: () => salirDeGrupo(grupo.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mis-grupos"] });
      toast.success(`Saliste de "${grupo.nombre}".`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="relative flex items-center gap-4 bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 transition group">
      <div className="w-12 h-12 rounded-lg bg-stage border border-border grid place-items-center text-primary shrink-0">
        <Users className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground truncate">{grupo.nombre}</span>
          {isAdmin && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium border border-primary/20 shrink-0">
              Admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground font-mono tracking-wider">
            {grupo.codigo_invitacion}
          </span>
          <button
            onClick={() => copiaCodigo(grupo.codigo_invitacion)}
            className="text-muted-foreground/50 hover:text-primary transition"
            title="Copiar código"
          >
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/grupos/$grupoId"
          params={{ grupoId: grupo.id }}
          className="text-xs px-3 py-1.5 rounded-lg border border-border/60 bg-surface text-foreground hover:border-primary/40 transition"
        >
          Ver grupo
        </Link>

        <div className="relative">
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface/60 transition"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 top-8 z-20 w-44 bg-card border border-border/60 rounded-xl shadow-elevated py-1 text-sm">
                <button
                  onClick={() => { copiaCodigo(grupo.codigo_invitacion); setMenuAbierto(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-surface/60 transition"
                >
                  <Copy className="w-4 h-4" /> Copiar código
                </button>
                {isAdmin ? (
                  <button
                    onClick={() => { if (!eliminando) eliminar(); setMenuAbierto(false); }}
                    disabled={eliminando}
                    className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> {eliminando ? "Eliminando..." : "Eliminar grupo"}
                  </button>
                ) : (
                  <button
                    onClick={() => { if (!saliendo) salir(); setMenuAbierto(false); }}
                    disabled={saliendo}
                    className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
                  >
                    <LogOut className="w-4 h-4" /> {saliendo ? "Saliendo..." : "Salir del grupo"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

function GruposList() {
  const [showCrear, setShowCrear] = useState(false);
  const [showUnirse, setShowUnirse] = useState(false);

  const { data: grupos = [], isLoading, isError } = useQuery({
    queryKey: ["mis-grupos"],
    queryFn: getMisGrupos,
  });

  return (
    <AppShell>
      <TopBar />

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl">Mis Grupos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ensaya con otros actores en tiempo real.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowUnirse(true)}
            className="flex items-center gap-2 border border-border/60 bg-surface text-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:border-primary/40 transition"
          >
            <LogIn className="w-4 h-4" /> Unirme con código
          </button>
          <button
            onClick={() => setShowCrear(true)}
            className="flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium shadow-glow hover:scale-[1.02] transition"
          >
            <Plus className="w-4 h-4" /> Crear grupo
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
          Cargando grupos...
        </div>
      )}

      {isError && (
        <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
          No se pudieron cargar los grupos.
        </div>
      )}

      {!isLoading && !isError && grupos.length === 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Aún no perteneces a ningún grupo</p>
          <p className="text-xs text-muted-foreground">
            Crea uno nuevo o únete con un código de invitación.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {grupos.map((grupo) => (
          <GrupoCard key={grupo.id} grupo={grupo} />
        ))}
      </div>

      {showCrear && <ModalCrear onClose={() => setShowCrear(false)} />}
      {showUnirse && <ModalUnirse onClose={() => setShowUnirse(false)} />}
    </AppShell>
  );
}
