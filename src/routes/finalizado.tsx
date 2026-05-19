import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Calendar,
  Clock,
  Crown,
  Drama,
  Sparkles,
  BarChart3,
  Download,
  Check,
  RotateCcw,
  X,
  ChevronRight,
  FileEdit,
  Repeat,
  FileMusic,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { formatDuration, getLatestRehearsal, getPerfilUsuario } from "@/lib/rehearsal-data";

export const Route = createFileRoute("/finalizado")({
  component: Finalizado,
});

function Finalizado() {
  const { data: report, isLoading } = useQuery({
    queryKey: ["latest-rehearsal-report"],
    queryFn: getLatestRehearsal,
  });
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const profile = profileData?.profile;
  const scores = [
    { label: "Claridad", value: report?.clarity_score ?? 0 },
    { label: "Expresion", value: report?.expression_score ?? 0 },
    { label: "Ritmo", value: report?.rhythm_score ?? 0 },
    { label: "Proyeccion", value: report?.projection_score ?? 0 },
    { label: "Memorizacion", value: report?.memorization_score ?? 0 },
  ];
  const measuredScores = scores.filter((item) => item.value > 0);
  const overall =
    report?.score ??
    (measuredScores.length
      ? Math.round(
          measuredScores.reduce((sum, item) => sum + item.value, 0) / measuredScores.length,
        )
      : 0);
  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (overall / 100) * c;
  const completed = report?.completed_lines ?? 0;
  const total = report?.total_lines || completed || 1;
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));

  return (
    <AppShell>
      <TopBar back={{ to: "/ensayo", label: "Modo ensayo" }} />

      {isLoading && (
        <div className="bg-card border border-border/60 rounded-xl p-4 mb-5 text-sm text-muted-foreground">
          Cargando reporte desde Postgres...
        </div>
      )}

      <section className="relative rounded-2xl bg-stage border border-border/60 overflow-hidden p-8 lg:p-10 mb-6">
        <div className="absolute inset-0 bg-spotlight pointer-events-none" />
        <div className="relative grid lg:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase mb-3">
              Ensayo finalizado
            </p>
            <h1 className="font-display text-4xl lg:text-5xl mb-2">
              Buen trabajo, {profile?.display_name ?? "actor"}{" "}
              <Sparkles className="inline w-7 h-7 text-primary" />
            </h1>
            <p className="text-muted-foreground">
              {report
                ? "Reporte sincronizado con rehearsal_sessions."
                : "No hay una sesion registrada todavia."}
            </p>
          </div>
          <Drama className="w-32 h-32 text-primary/70" strokeWidth={0.8} />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Resumen de la sesion</h3>
          <dl className="space-y-3 text-sm">
            <Row icon={BookOpen} k="Obra" v={report?.script?.title ?? "Sin libreto"} />
            <Row
              icon={Drama}
              k="Escena"
              v={
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-primary/40 text-primary mr-2">
                    {report?.scene?.title ?? "Sin escena"}
                  </span>
                  {report?.scene?.location ?? report?.scene?.description ?? ""}
                </>
              }
            />
            <Row
              icon={Crown}
              k="Personaje"
              v={
                report?.selectedCharacter
                  ? `${report.selectedCharacter.name} (Tu)`
                  : "Sin personaje"
              }
            />
            <Row
              icon={Sparkles}
              k="Modo"
              v={`${modeLabel(report?.mode ?? "individual")} - IA ${difficultyLabel(report?.ai_difficulty ?? 50)}`}
            />
            <Row icon={Calendar} k="Fecha" v={formatDate(report?.started_at)} />
            <Row
              icon={Clock}
              k="Duracion"
              v={report ? formatDuration(report.started_at, report.ended_at) : "Sin duracion"}
            />
          </dl>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Tu desempeno</h3>
          <div className="grid grid-cols-[auto_1fr] gap-6 items-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                <circle cx="64" cy="64" r={r} stroke="var(--border)" strokeWidth="8" fill="none" />
                <circle
                  cx="64"
                  cy="64"
                  r={r}
                  stroke="url(#g)"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={c}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.16 60)" />
                    <stop offset="100%" stopColor="oklch(0.85 0.18 70)" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-3xl font-display text-primary">{overall}%</div>
                  <div className="text-[10px] text-muted-foreground tracking-widest uppercase">
                    {overall >= 85 ? "Muy bien" : overall >= 70 ? "Buen avance" : "En practica"}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {scores.map((score) => (
                <div key={score.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{score.label}</span>
                    <span>{score.value}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full bg-primary-gradient"
                      style={{ width: `${score.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>
              {report?.feedback_summary ?? "Completa un ensayo para generar retroalimentacion."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Progreso de la escena</h3>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground">Completado</span>
            <span>
              {completed} / {total} lineas
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface mb-5 overflow-hidden">
            <div className="h-full bg-primary-gradient" style={{ width: `${completedPercent}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Check} value={`${completed}`} label="Lineas acertadas" tone="success" />
            <Stat
              icon={RotateCcw}
              value={`${report?.repeated_lines ?? 0}`}
              label="Lineas repetidas"
              tone="primary"
            />
            <Stat
              icon={X}
              value={`${report?.skipped_lines ?? 0}`}
              label="Lineas omitidas"
              tone="destructive"
            />
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Momentos destacados</h3>
          <div className="space-y-3">
            {(report?.highlights.length ? report.highlights : []).map((highlight) => (
              <div key={highlight.id} className="flex items-start gap-3 text-sm">
                <span className="text-success font-mono text-xs mt-0.5">
                  {highlight.event_time}
                </span>
                <span className="text-foreground/90">{highlight.note}</span>
              </div>
            ))}
            {(!report || report.highlights.length === 0) && (
              <p className="text-sm text-muted-foreground">Sin momentos destacados guardados.</p>
            )}
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Siguientes pasos</h3>
          <div className="space-y-2">
            <Next
              icon={FileEdit}
              title="Revisar mis errores"
              sub="Ve las lineas que puedes mejorar"
            />
            <Next icon={Repeat} title="Repetir esta escena" sub="Practica nuevamente desde aqui" />
            <Next
              icon={FileMusic}
              title="Continuar con la siguiente escena"
              sub="Sigue con otra escena del libreto"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/60 rounded-xl p-4">
        <button className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40">
          <BarChart3 className="w-4 h-4" /> Ver reporte detallado
        </button>
        <div className="flex items-center gap-3">
          <button className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40">
            <Download className="w-4 h-4" /> Exportar reporte
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg px-5 py-2 font-medium shadow-glow"
          >
            <Check className="w-4 h-4" /> Finalizar sesion
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ icon: Icon, k, v }: { icon: typeof BookOpen; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <dt className="text-muted-foreground w-24 text-xs">{k}</dt>
      <dd className="flex-1 text-sm flex items-center flex-wrap">{v}</dd>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Check;
  value: string;
  label: string;
  tone: "success" | "primary" | "destructive";
}) {
  const colors = {
    success: "text-success border-success/30",
    primary: "text-primary border-primary/30",
    destructive: "text-destructive border-destructive/30",
  }[tone];
  return (
    <div className="text-center">
      <div className={`w-9 h-9 mx-auto mb-1 rounded-full border grid place-items-center ${colors}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-display">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Next({ icon: Icon, title, sub }: { icon: typeof FileEdit; title: string; sub: string }) {
  return (
    <button className="w-full flex items-start gap-3 p-2.5 rounded-lg bg-surface border border-border/40 hover:border-primary/40 transition text-left">
      <Icon className="w-4 h-4 text-primary mt-0.5" />
      <div className="flex-1">
        <div className="text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function difficultyLabel(value: number) {
  if (value < 33) return "facil";
  if (value < 66) return "media";
  return "alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
