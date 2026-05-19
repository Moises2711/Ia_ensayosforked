import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Lock, User, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell, Field } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Crear cuenta - Cine Estrella" },
      {
        name: "description",
        content: "Registrate en Cine Estrella y empieza a ensayar teatro con IA.",
      },
    ],
  }),
  component: Register,
});

function Register() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) {
      toast.error("Debes aceptar los terminos para continuar");
      return;
    }
    if (password.length < 8) {
      toast.error("La contrasena debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          display_name: name,
          full_name: name,
          name,
        },
      },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    if (data.session && data.user) {
      const { error: profileError } = await supabase.from("perfil_usuario").upsert(
        {
          user_id: data.user.id,
          display_name: name,
          email,
          avatar_url: data.user.user_metadata?.avatar_url ?? null,
        },
        { onConflict: "user_id" },
      );

      if (profileError) {
        setLoading(false);
        toast.error("La cuenta se creo, pero no se pudo sincronizar el perfil.");
        return;
      }
    }

    setLoading(false);
    toast.success("Cuenta creada. Bienvenido al escenario");
    nav({ to: "/" });
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No se pudo continuar con Google");
      return;
    }
    if (result.redirected) return;
    nav({ to: "/" });
  };

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Unete y empieza a ensayar con la IA."
      footer={
        <>
          Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Inicia sesion
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field
          label="Nombre"
          placeholder="Tu nombre artistico"
          icon={<User className="w-4 h-4" />}
          value={name}
          onChange={setName}
          required
          autoComplete="name"
        />
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
          placeholder="Minimo 8 caracteres"
          icon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
        />

        <label className="flex items-start gap-2 text-xs text-muted-foreground mb-5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary mt-0.5"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            Acepto los{" "}
            <a href="#" className="text-primary hover:underline">
              terminos
            </a>{" "}
            y la{" "}
            <a href="#" className="text-primary hover:underline">
              politica de privacidad
            </a>
            .
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary-gradient text-primary-foreground rounded-lg py-3 text-sm font-medium shadow-glow hover:scale-[1.01] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Crear mi cuenta <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
            o registrate con
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
