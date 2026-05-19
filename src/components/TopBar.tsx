import { Bell, ArrowLeft, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getPerfilUsuario } from "@/lib/rehearsal-data";

export function TopBar({ back }: { back?: { to: string; label: string } }) {
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
    <div className="flex items-center justify-between mb-6">
      <div>
        {back ? (
          <Link
            to={back.to}
            className="inline-flex items-center gap-2 text-xs tracking-[0.25em] text-muted-foreground hover:text-primary transition uppercase"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {back.label}
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-full bg-surface border border-border/60 flex items-center justify-center text-muted-foreground hover:text-primary transition">
          <Bell className="w-4 h-4" />
        </button>
        {loading ? null : user ? (
          <>
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border/60 text-sm">
              <UserIcon className="w-4 h-4 text-primary" />
              <span className="text-foreground/80 max-w-[160px] truncate">{displayName}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 border border-border/60 bg-surface text-foreground rounded-lg px-4 py-2 text-sm font-medium hover:border-primary/40 transition"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium shadow-glow hover:scale-[1.02] transition"
          >
            <LogIn className="w-4 h-4" /> Iniciar sesión
          </Link>
        )}
      </div>
    </div>
  );
}
