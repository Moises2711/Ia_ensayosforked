import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  AlertCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import {
  formatDuration,
  getLatestRehearsal,
  getPerfilUsuario,
  getSessionRecordings,
  getScenesForScript,
  updateRehearsalSession,
  type TeleprompterRecordingWithScore,
} from "@/lib/rehearsal-data";

export const Route = createFileRoute("/finalizado")({
  component: Finalizado,
});

function Finalizado() {
  const nav = useNavigate();
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [filterErrors, setFilterErrors] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: report, isLoading } = useQuery({
    queryKey: ["latest-rehearsal-report"],
    queryFn: getLatestRehearsal,
  });
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
  });
  const { data: recordings = [] } = useQuery<TeleprompterRecordingWithScore[]>({
    queryKey: ["session-recordings", report?.id],
    queryFn: () => getSessionRecordings(report!.id),
    enabled: Boolean(report?.id),
  });
  const { data: allScenes = [] } = useQuery({
    queryKey: ["scenes-for-script", report?.script_id],
    queryFn: () => getScenesForScript(report!.script_id!),
    enabled: Boolean(report?.script_id),
  });

  const profile = profileData?.profile;

  // ── BUG 12: Calcular scores reales a partir de grabaciones ────────────────
  const computedScores = useMemo(() => {
    const recs = recordings.filter((r) => r.similarity_score != null);
    if (recs.length === 0) return null;

    const avgSim = recs.reduce((s, r) => s + (r.similarity_score ?? 0), 0) / recs.length;
    const avgConf = recs.reduce((s, r) => s + (r.confidence_score ?? 0.8) * 100, 0) / recs.length;
    const totalLines = report?.total_lines || recs.length || 1;
    const completedLines = report?.completed_lines ?? recs.length;
    const skipped = report?.skipped_lines ?? 0;
    const repeated = report?.repeated_lines ?? 0;

    const claridad = Math.round(avgConf);
    const expresion = Math.round(avgSim);
    const ritmo = Math.round(Math.max(0, 100 - (skipped / totalLines) * 100));
    const proyeccion = Math.round((avgSim * 0.5 + avgConf * 0.5));
    const memorizacion = Math.round(Math.min(100, (completedLines / totalLines) * 100));
    const overall = Math.round((claridad + expresion + ritmo + proyeccion + memorizacion) / 5);

    const feedback =
      overall >= 80
        ? "¡Excelente desempeño! Tu pronunciación, fluidez y memorización estuvieron muy por encima del promedio. Sigue así."
        : overall >= 60
        ? "Buen avance. Presta atención a las líneas con score bajo y repite la escena para mejorar la fluidez."
        : "Necesitas más práctica. Revisa tus errores, memoriza las líneas difíciles y repite el ensayo.";

    return { claridad, expresion, ritmo, proyeccion, memorizacion, overall, feedback };
  }, [recordings, report]);

  const overall =
    report?.score ??
    computedScores?.overall ??
    (report?.clarity_score
      ? Math.round(
          [
            report.clarity_score,
            report.expression_score ?? 0,
            report.rhythm_score ?? 0,
            report.projection_score ?? 0,
            report.memorization_score ?? 0,
          ].reduce((a, b) => a + b, 0) / 5,
        )
      : 0);

  const scores = [
    { label: "Claridad", value: computedScores?.claridad ?? report?.clarity_score ?? 0 },
    { label: "Expresión", value: computedScores?.expresion ?? report?.expression_score ?? 0 },
    { label: "Ritmo", value: computedScores?.ritmo ?? report?.rhythm_score ?? 0 },
    { label: "Proyección", value: computedScores?.proyeccion ?? report?.projection_score ?? 0 },
    { label: "Memorización", value: computedScores?.memorizacion ?? report?.memorization_score ?? 0 },
  ];

  const feedback =
    computedScores?.feedback ??
    report?.feedback_summary ??
    "Completa un ensayo para generar retroalimentación.";

  const r = 56;
  const c = 2 * Math.PI * r;
  const offset = c - (overall / 100) * c;

  const completed = report?.completed_lines ?? 0;
  const total = report?.total_lines || completed || 1;
  const completedPercent = Math.min(100, Math.round((completed / total) * 100));

  // ── BUG 11: Acciones funcionales ──────────────────────────────────────────
  const handleExport = () => {
    const lines: string[] = [
      `REPORTE DE ENSAYO — ${report?.script?.title ?? "Sin libreto"}`,
      `Escena: ${report?.scene?.title ?? "Sin escena"}`,
      `Personaje: ${report?.selectedCharacter?.name ?? "Sin personaje"}`,
      `Fecha: ${formatDate(report?.started_at)}`,
      `Duración: ${report ? formatDuration(report.started_at, report.ended_at) : "-"}`,
      `Score general: ${overall}%`,
      "",
      "PUNTUACIONES:",
      ...scores.map((s) => `  ${s.label}: ${s.value}%`),
      "",
      "FEEDBACK:",
      feedback,
      "",
      "DETALLE POR LÍNEA:",
    ];

    for (const rec of recordings) {
      const score = rec.similarity_score != null ? `${rec.similarity_score}%` : "sin score";
      lines.push(`  [${score}] ${rec.character_name ?? ""}: ${rec.segment_text ?? "sin transcripción"}`);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-ensayo-${report?.id?.slice(0, 8) ?? "ensayo"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRepeat = async () => {
    if (report?.id) {
      try {
        await updateRehearsalSession(report.id, {
          status: "active",
          completed_lines: 0,
          skipped_lines: 0,
          repeated_lines: 0,
          ended_at: null,
        });
      } catch {}
    }
    nav({ to: "/ensayo" });
  };

  const handleNextScene = () => {
    if (!report?.scene_id || !report?.script_id) return;
    const currentIdx = allScenes.findIndex((s) => s.id === report.scene_id);
    const nextScene = allScenes[currentIdx + 1];
    if (nextScene) {
      localStorage.setItem("nextSceneId", nextScene.id);
    }
    nav({ to: "/configuracion-ensayo" });
  };

  // Líneas con errores (score < 60)
  const errorLines = recordings.filter((r) => (r.similarity_score ?? 100) < 60);
  const displayedLines = filterErrors ? errorLines : recordings;

  // ── Render ─────────────────────────────────────────────────────────────────
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
                ? "Reporte sincronizado con Supabase."
                : "No hay una sesión registrada todavía."}
            </p>
          </div>
          <Drama className="w-32 h-32 text-primary/70" strokeWidth={0.8} />
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Resumen de la sesión</h3>
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
                  ? `${report.selectedCharacter.name} (Tú)`
                  : "Sin personaje"
              }
            />
            <Row
              icon={Sparkles}
              k="Modo"
              v={`${modeLabel(report?.mode ?? "individual")} — IA ${difficultyLabel(report?.ai_difficulty ?? 50)}`}
            />
            <Row icon={Calendar} k="Fecha" v={formatDate(report?.started_at)} />
            <Row
              icon={Clock}
              k="Duración"
              v={report ? formatDuration(report.started_at, report.ended_at) : "Sin duración"}
            />
          </dl>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-4">Tu desempeño</h3>
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
                    {overall >= 85 ? "Muy bien" : overall >= 70 ? "Buen avance" : "En práctica"}
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
                    <div className="h-full bg-primary-gradient" style={{ width: `${score.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p>{feedback}</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Progreso de la escena</h3>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-muted-foreground">Completado</span>
            <span>
              {completed} / {total} líneas
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface mb-5 overflow-hidden">
            <div className="h-full bg-primary-gradient" style={{ width: `${completedPercent}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Check} value={`${completed}`} label="Acertadas" tone="success" />
            <Stat
              icon={RotateCcw}
              value={`${report?.repeated_lines ?? 0}`}
              label="Repetidas"
              tone="primary"
            />
            <Stat
              icon={X}
              value={`${report?.skipped_lines ?? 0}`}
              label="Omitidas"
              tone="destructive"
            />
          </div>
        </div>

        <div className="bg-card border border-border/60 rounded-xl p-5">
          <h3 className="font-medium mb-3">Momentos destacados</h3>
          <div className="space-y-3">
            {(report?.highlights.length ? report.highlights : []).map((highlight) => (
              <div key={highlight.id} className="flex items-start gap-3 text-sm">
                <span className="text-success font-mono text-xs mt-0.5">{highlight.event_time}</span>
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
            {/* BUG 11: Botones funcionales */}
            <Next
              icon={FileEdit}
              title="Revisar mis errores"
              sub={`${errorLines.length} línea(s) con score bajo`}
              onClick={() => {
                setFilterErrors(true);
                setShowDetailModal(true);
              }}
            />
            <Next
              icon={Repeat}
              title="Repetir esta escena"
              sub="Practica nuevamente desde aquí"
              onClick={handleRepeat}
            />
            <Next
              icon={FileMusic}
              title="Continuar con la siguiente escena"
              sub={allScenes.length > 0 ? "Ir a la siguiente escena del libreto" : "Sin más escenas"}
              onClick={handleNextScene}
              disabled={allScenes.length === 0}
            />
          </div>
        </div>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border/60 rounded-xl p-4">
        {/* BUG 11: Ver reporte detallado */}
        <button
          onClick={() => {
            setFilterErrors(false);
            setShowDetailModal(true);
          }}
          className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40 transition"
        >
          <BarChart3 className="w-4 h-4" /> Ver reporte detallado
        </button>
        <div className="flex items-center gap-3">
          {/* BUG 11: Exportar reporte */}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40 transition"
          >
            <Download className="w-4 h-4" /> Exportar reporte
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg px-5 py-2 font-medium shadow-glow"
          >
            <Check className="w-4 h-4" /> Finalizar sesión
          </Link>
        </div>
      </div>

      {/* BUG 11: Modal reporte detallado / errores */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="relative bg-card border border-border/60 rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <div>
                <h2 className="font-display text-xl">
                  {filterErrors ? "Líneas con errores" : "Reporte detallado por línea"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filterErrors
                    ? `${errorLines.length} línea(s) con score < 60%`
                    : `${recordings.length} línea(s) grabadas`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilterErrors((v) => !v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${filterErrors ? "border-destructive/40 text-destructive bg-destructive/10" : "border-border/60 text-muted-foreground hover:border-primary/40"}`}
                >
                  {filterErrors ? "Ver todas" : "Solo errores"}
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-8 h-8 rounded-lg border border-border/60 grid place-items-center hover:border-primary/40 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {displayedLines.length === 0 && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
                  <AlertCircle className="w-4 h-4" />
                  {filterErrors
                    ? "¡Sin errores! Todas las líneas tienen score ≥ 60%."
                    : "No hay grabaciones para esta sesión."}
                </div>
              )}
              {displayedLines.map((rec, idx) => {
                const score = rec.similarity_score ?? null;
                const scoreTone =
                  score == null
                    ? "border-border/40 text-muted-foreground"
                    : score >= 80
                    ? "border-success/40 text-success bg-success/5"
                    : score >= 60
                    ? "border-primary/40 text-primary bg-primary/5"
                    : "border-destructive/40 text-destructive bg-destructive/5";
                return (
                  <div
                    key={rec.id ?? idx}
                    className="border border-border/40 rounded-xl p-4 space-y-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-primary">
                        {rec.character_name?.toUpperCase() ?? "PERSONAJE"}
                      </span>
                      {score != null && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${scoreTone}`}
                        >
                          {score}%
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        Confianza: {Math.round((rec.confidence_score ?? 0) * 100)}%
                      </span>
                    </div>
                    {rec.segment_text && (
                      <p className="text-xs text-muted-foreground italic">
                        Transcripción: "{rec.segment_text}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-border/60 flex justify-end gap-3">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 text-sm border border-border bg-surface rounded-lg px-4 py-2 hover:border-primary/40 transition"
              >
                <Download className="w-4 h-4" /> Exportar TXT
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                className="inline-flex items-center gap-2 text-sm bg-primary-gradient text-primary-foreground rounded-lg px-5 py-2 font-medium"
              >
                <Check className="w-4 h-4" /> Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Componentes auxiliares ─────────────────────────────────────────────────────
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

function Next({
  icon: Icon,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: typeof FileEdit;
  title: string;
  sub: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-3 p-2.5 rounded-lg bg-surface border border-border/40 hover:border-primary/40 transition text-left disabled:opacity-50 disabled:pointer-events-none"
    >
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
  if (value < 33) return "fácil";
  if (value < 66) return "media";
  return "alta";
}

function modeLabel(value: string) {
  if (value === "grupo") return "En grupo";
  if (value === "lectura") return "Lectura";
  return "Individual";
}
