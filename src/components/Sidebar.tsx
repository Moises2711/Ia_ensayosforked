import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, FileText, Drama, Settings, LogIn, LogOut, Users } from "lucide-react";
import { toast } from "sonner";
import { AppLogo } from "./AppLogo";
import { useAuth } from "@/hooks/useAuth";
import { getPerfilUsuario } from "@/lib/rehearsal-data";

const NAV = [
  { to: "/", label: "Inicio", icon: Home },
  { to: "/libretos", label: "Libretos", icon: FileText },
  { to: "/ensayos", label: "Ensayos", icon: Drama },
  { to: "/grupos", label: "Grupos", icon: Users },
  { to: "/configuracion", label: "Configuración", icon: Settings },
] as const;

export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, signOut } = useAuth();
  const { data: profileData } = useQuery({
    queryKey: ["perfil-usuario"],
    queryFn: getPerfilUsuario,
    enabled: Boolean(user),
  });
  const displayName =
    profileData?.profile.display_name || user?.user_metadata?.display_name || user?.email;

  const handleSignOut = async () => {
    await signOut();
    toast.success("Sesión cerrada");
  };

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-sidebar border-r border-border/60 px-5 py-7">
      <div className="flex justify-center -mt-2 mb-8">
        <AppLogo size={210} />
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? path === "/" : path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all
                ${
                  active
                    ? "bg-primary/10 text-primary border-l-2 border-primary"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-surface/60 border-l-2 border-transparent"
                }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {loading ? null : user ? (
        <>
          <div className="mt-4 px-3 py-2 rounded-lg bg-surface/60 border border-border/40 text-xs text-muted-foreground truncate">
            {displayName}
          </div>
          <button
            onClick={handleSignOut}
            className="mt-2 inline-flex items-center justify-center gap-2 border border-border/60 bg-surface text-foreground rounded-lg px-4 py-2.5 text-sm font-medium hover:border-primary/40 transition"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </>
      ) : (
        <>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium shadow-glow hover:scale-[1.02] transition"
          >
            <LogIn className="w-4 h-4" /> Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="mt-2 text-center text-xs text-muted-foreground hover:text-primary transition"
          >
            ¿Sin cuenta? Regístrate
          </Link>
        </>
      )}
    </aside>
  );
}
