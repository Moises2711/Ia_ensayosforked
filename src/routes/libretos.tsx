import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search,
  Plus,
  ChevronDown,
  Star,
  MoreVertical,
  LayoutGrid,
  List,
  Edit,
  Users,
  Copy,
  Trash2,
  ChevronRight,
  Drama,
  Crown,
  Feather,
  BookOpen,
  Theater,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  formatActCount,
  formatRelativeDate,
  getScriptDetails,
  getScripts,
  type ScriptRecord,
} from "@/lib/rehearsal-data";

export const Route = createFileRoute("/libretos")({
  component: Libretos,
});

const TABS = ["Todos", "Mis libretos", "Favoritos", "Papelera"];

function getScriptIcon(script: Pick<ScriptRecord, "title" | "genre"> | null) {
  const text = `${script?.title ?? ""} ${script?.genre ?? ""}`.toLowerCase();
  if (text.includes("hamlet")) return Crown;
  if (text.includes("bernarda")) return Theater;
  if (text.includes("godot")) return BookOpen;
  if (text.includes("ernesto")) return Feather;
  return Drama;
}

function Libretos() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    data: scripts = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["scripts"],
    queryFn: getScripts,
  });

  const filteredScripts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return scripts;

    return scripts.filter((script) =>
      [script.title, script.author, script.genre]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(value)),
    );
  }, [query, scripts]);

  const selectedScript =
    scripts.find((script) => script.id === selectedId) ??
    filteredScripts.find((script) => script.is_active) ??
    filteredScripts[0] ??
    scripts[0] ??
    null;

  const { data: details } = useQuery({
    queryKey: ["script-details", selectedScript?.id],
    queryFn: () => getScriptDetails(selectedScript!.id),
    enabled: Boolean(selectedScript),
  });

  const DetailIcon = getScriptIcon(selectedScript);

  return (
    <AppShell>
      <TopBar />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl">Gestion de libretos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organiza, importa y administra tus guiones teatrales.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar libretos..."
              className="bg-surface border border-border/60 rounded-lg pl-9 pr-3 py-2 text-sm w-64 focus:outline-none focus:border-primary/50"
            />
          </div>
          <button className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow">
            <Plus className="w-4 h-4" /> Importar libreto
            <span className="border-l border-primary-foreground/30 pl-2 ml-1">
              <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border/60">
              {TABS.map((tab, index) => (
                <button
                  key={tab}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${index === 0 ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button className="text-sm text-muted-foreground inline-flex items-center gap-1 border border-border/60 rounded-md px-2.5 py-1.5 bg-surface">
                Mas recientes <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <div className="flex border border-border/60 rounded-md overflow-hidden bg-surface">
                <button className="p-1.5 text-muted-foreground">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button className="p-1.5 text-primary bg-primary/10">
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading && (
              <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
                Cargando libretos desde Postgres...
              </div>
            )}
            {isError && (
              <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
                No se pudieron cargar los libretos desde la base de datos.
              </div>
            )}
            {!isLoading && !isError && filteredScripts.length === 0 && (
              <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
                No hay libretos para mostrar.
              </div>
            )}
            {filteredScripts.map((script) => {
              const Icon = getScriptIcon(script);
              const active = script.id === selectedScript?.id;

              return (
                <div
                  key={script.id}
                  onClick={() => setSelectedId(script.id)}
                  className={`flex items-center gap-4 bg-card border rounded-xl p-4 transition cursor-pointer ${
                    active
                      ? "border-primary/60 shadow-glow"
                      : "border-border/60 hover:border-primary/30"
                  }`}
                >
                  <div className="w-14 h-14 rounded-lg bg-stage border border-border grid place-items-center text-primary">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-lg truncate">{script.title}</h3>
                      {script.is_favorite && (
                        <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {script.author ?? "Autor desconocido"}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                        {script.genre ?? "Sin genero"}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                        {formatActCount(script.act_count)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground hidden md:block">
                    Actualizado {formatRelativeDate(script.updated_at)}
                  </span>
                  <button className="text-muted-foreground hover:text-foreground">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-4">
            {filteredScripts.length} libretos
          </p>
        </div>

        <aside className="bg-card border border-border/60 rounded-xl p-5 h-fit sticky top-6">
          {selectedScript ? (
            <>
              <div className="aspect-[4/3] rounded-lg bg-stage border border-border mb-4 grid place-items-center">
                <DetailIcon className="w-16 h-16 text-primary/60" strokeWidth={0.8} />
              </div>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-display text-xl">{selectedScript.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedScript.author ?? "Autor desconocido"}
                  </p>
                </div>
                {selectedScript.is_favorite && (
                  <Star className="w-4 h-4 fill-primary text-primary" />
                )}
              </div>
              <dl className="space-y-2 text-sm mb-5">
                {[
                  ["Genero", selectedScript.genre ?? "Sin genero"],
                  ["Estructura", formatActCount(selectedScript.act_count)],
                  ["Personajes", `${details?.characters.length ?? 0}`],
                  ["Ultima actualizacion", formatRelativeDate(selectedScript.updated_at)],
                ].map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2 text-xs">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mb-5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                  Descripcion
                </p>
                <p className="text-xs leading-relaxed text-foreground/80">
                  {selectedScript.description ?? "Este libreto aun no tiene descripcion."}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Acciones
                </p>
                {[
                  [Edit, "Editar libreto"],
                  [Users, "Ver personajes"],
                  [Copy, "Duplicar"],
                ].map(([Icon, label]) => {
                  const ActionIcon = Icon as typeof Edit;
                  return (
                    <button
                      key={label as string}
                      className="w-full flex items-center justify-between gap-2 text-sm p-2.5 rounded-lg bg-surface border border-border/40 hover:border-primary/40 hover:text-primary transition"
                    >
                      <span className="flex items-center gap-2">
                        <ActionIcon className="w-4 h-4" /> {label as string}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  );
                })}
                <button className="w-full flex items-center gap-2 text-sm p-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition">
                  <Trash2 className="w-4 h-4" /> Eliminar libreto
                </button>
              </div>
              <Link
                to="/configuracion-ensayo"
                className="mt-5 block text-center bg-primary-gradient text-primary-foreground rounded-lg py-2 text-sm font-medium"
              >
                Configurar ensayo
              </Link>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              Selecciona un libreto para ver detalles.
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
