import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell, Field } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesion - Cine Estrella" },
      {
        name: "description",
        content: "Accede a tu cuenta de Cine Estrella para gestionar libretos y ensayar con IA.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      toast.error(
        error.message === "Invalid login credentials" ? "Credenciales incorrectas" : error.message,
      );
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
    toast.success("Bienvenido de nuevo");
    nav({ to: "/" });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No se pudo iniciar sesion con Google");
      return;
    }
    if (result.redirected) return;
    queryClient.invalidateQueries({ queryKey: ["perfil-usuario"] });
    nav({ to: "/" });
  };

  return (
    <AuthShell
      title="Bienvenido de nuevo"
      subtitle="Inicia sesion para continuar tus ensayos."
      footer={
        <>
          Aun no tienes cuenta?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Registrate
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field
          label="Correo electronico"
          type="email"
          placeholder="tu@correo.com"
          icon={<Mail className="w-4 h-4" />}
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
        <Field
          label="Contrasena"
          type="password"
          placeholder="********"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg py-3 text-sm font-medium shadow-glow hover:scale-[1.01] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Entrar al escenario <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
            o continua con
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={google}
          className="w-full border border-border bg-surface rounded-lg py-2.5 text-sm hover:border-primary/40 transition"
        >
          Continuar con Google
        </button>
      </form>
    </AuthShell>
  );
}
