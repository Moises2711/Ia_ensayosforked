import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, FileText, Settings, Drama, ArrowRight, Crown, MoreVertical } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { formatRelativeDate, getRecentRehearsals } from "@/lib/rehearsal-data";

export const Route = createFileRoute("/")({
  component: Index,
});

const QUICK = [
  {
    icon: FileText,
    title: "Gestionar libretos",
    desc: "Importa, edita y organiza tus guiones teatrales.",
    cta: "Abrir libretos",
    to: "/libretos",
  },
  {
    icon: Settings,
    title: "Configurar ensayo",
    desc: "Define personajes, voces, emociones y dinamica.",
    cta: "Configurar",
    to: "/configuracion-ensayo",
  },
  {
    icon: Drama,
    title: "Modo ensayo",
    desc: "La IA interpreta personajes en tiempo real contigo.",
    cta: "Comenzar",
    to: "/ensayo",
  },
] as const;

function Index() {
  const {
    data: recentRehearsals = [],
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["recent-rehearsals", "home"],
    queryFn: () => getRecentRehearsals(2),
  });

  return (
    <AppShell>
      <TopBar />
      <section className="relative rounded-2xl bg-stage border border-border/60 overflow-hidden p-8 lg:p-12 mb-8 shadow-elevated">
        <div className="absolute inset-0 bg-spotlight pointer-events-none" />
        <div className="relative grid lg:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase mb-4">
              Bienvenido de nuevo
            </p>
            <h1 className="font-display text-5xl lg:text-6xl leading-[1.05] mb-4">
              Ensaya teatro
              <br />
              con <span className="text-gradient-primary italic">IA</span>
            </h1>
            <p className="text-muted-foreground max-w-md mb-8">
              Practica escenas, interpreta personajes y deja que la IA complete los demas papeles.
            </p>
            <Link
              to="/ensayo"
              className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground font-medium px-6 py-3 rounded-xl shadow-glow hover:scale-[1.02] transition"
            >
              <Play className="w-4 h-4 fill-current" />
              Iniciar nuevo ensayo
            </Link>
          </div>
          <div className="hidden lg:flex justify-center">
            <Drama className="w-56 h-56 text-primary/70" strokeWidth={0.8} />
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {QUICK.map(({ icon: Icon, title, desc, cta, to }) => (
          <Link
            key={title}
            to={to}
            className="group rounded-xl bg-card border border-border/60 p-5 hover:border-primary/40 hover:shadow-glow transition"
          >
            <div className="w-11 h-11 rounded-full border border-primary/30 bg-primary/5 grid place-items-center mb-4 text-primary">
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-medium text-foreground mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground mb-4">{desc}</p>
            <span className="inline-flex items-center gap-1 text-sm text-primary group-hover:gap-2 transition-all">
              {cta} <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display">Ultimos ensayos</h2>
        <Link
          to="/ensayos"
          className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          Ver todos <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="space-y-2">
        {isLoading && (
          <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
            Cargando ultimos ensayos...
          </div>
        )}
        {isError && (
          <div className="bg-card border border-destructive/40 rounded-xl p-4 text-sm text-destructive">
            No se pudieron cargar los ensayos desde la base de datos.
          </div>
        )}
        {!isLoading && !isError && recentRehearsals.length === 0 && (
          <div className="bg-card border border-border/60 rounded-xl p-4 text-sm text-muted-foreground">
            Aun no hay ensayos registrados.
          </div>
        )}
        {recentRehearsals.map((rehearsal) => {
          const title = rehearsal.script?.title ?? "Ensayo sin libreto";
          const scene = rehearsal.scene?.title ?? "Sin escena";
          const Icon = title.toLowerCase().includes("hamlet") ? Crown : Drama;
          const mode = rehearsal.mode === "individual" ? "Individual" : rehearsal.mode;

          return (
            <div
              key={rehearsal.id}
              className="flex items-center gap-4 bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 transition"
            >
              <div className="w-11 h-11 rounded-lg border border-border bg-surface grid place-items-center text-primary">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{title}</div>
                <div className="text-xs text-muted-foreground">
                  Ultima sesion: {formatRelativeDate(rehearsal.updated_at)}
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary">
                {scene}
              </span>
              <span className="hidden sm:inline text-xs text-muted-foreground capitalize">
                {mode}
              </span>
              <Link
                to="/ensayo"
                className="inline-flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-1.5 hover:border-primary/40 hover:text-primary transition"
              >
                Continuar <Play className="w-3 h-3 fill-current" />
              </Link>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
