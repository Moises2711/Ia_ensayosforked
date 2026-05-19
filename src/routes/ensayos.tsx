import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { Drama, Crown, Play } from "lucide-react";
import { formatRelativeDate, formatScore, getRecentRehearsals } from "@/lib/rehearsal-data";

export const Route = createFileRoute("/ensayos")({
  component: Ensayos,
});

function getIcon(title: string) {
  return title.toLowerCase().includes("hamlet") ? Crown : Drama;
}

function Ensayos() {
  const {
    data: rehearsals = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["recent-rehearsals", "list"],
    queryFn: () => getRecentRehearsals(10),
  });

  return (
    <AppShell>
      <TopBar />
      <div className="mb-6">
        <h1 className="font-display text-4xl">Mis ensayos</h1>
        <p className="text-sm text-muted-foreground mt-1">Historial de tus sesiones de ensayo.</p>
      </div>
      <div className="space-y-3">
        {isLoading && (
          <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
            Cargando historial desde Postgres...
          </div>
        )}
        {isError && (
          <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
            No se pudo cargar el historial desde la base de datos.
          </div>
        )}
        {!isLoading && !isError && rehearsals.length === 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
            Aun no hay ensayos guardados.
          </div>
        )}
        {rehearsals.map((rehearsal) => {
          const title = rehearsal.script?.title ?? "Ensayo sin libreto";
          const Icon = getIcon(title);

          return (
            <div
              key={rehearsal.id}
              className="flex items-center gap-4 bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 transition"
            >
              <div className="w-12 h-12 rounded-lg bg-stage border border-border grid place-items-center text-primary">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">
                  {formatRelativeDate(rehearsal.updated_at)}
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary">
                {rehearsal.scene?.title ?? "Sin escena"}
              </span>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Puntuacion</div>
                <div className="font-display text-lg text-primary">
                  {formatScore(rehearsal.score)}
                </div>
              </div>
              <Link
                to="/finalizado"
                className="inline-flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-1.5 hover:border-primary/40 hover:text-primary"
              >
                Ver reporte <Play className="w-3 h-3" />
              </Link>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
