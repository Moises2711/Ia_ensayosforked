import { Link } from "@tanstack/react-router";
import { AppLogo } from "@/components/AppLogo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <div className="relative hidden lg:flex flex-col justify-between bg-stage border-r border-border/60 overflow-hidden p-10">
        <div className="absolute inset-0 bg-spotlight pointer-events-none" />
        <Link to="/" className="relative z-10 inline-flex">
          <AppLogo size={120} />
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="text-[11px] tracking-[0.3em] uppercase text-primary mb-3">Ensaya · Crea · Interpreta</p>
          <h2 className="font-display text-4xl leading-tight mb-4">
            Tu escenario, <span className="italic text-gradient-primary">cuando quieras.</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Practica escenas, interpreta personajes y deja que la IA complete los demás papeles.
          </p>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground">© 2026 Cine Estrella</p>
      </div>

      <div className="flex flex-col justify-center px-6 sm:px-12 py-10">
        <div className="lg:hidden mb-8 flex justify-center">
          <AppLogo size={100} />
        </div>
        <div className="max-w-sm w-full mx-auto">
          <h1 className="font-display text-3xl mb-2">{title}</h1>
          <p className="text-sm text-muted-foreground mb-8">{subtitle}</p>
          {children}
          <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  type = "text",
  placeholder,
  icon,
  value,
  onChange,
  required,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block mb-4">
      <span className="text-xs text-muted-foreground tracking-wider uppercase mb-1.5 block">{label}</span>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          className={`w-full bg-surface border border-border/60 rounded-lg ${icon ? "pl-10" : "pl-3"} pr-3 py-2.5 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition`}
        />
      </div>
    </label>
  );
}
