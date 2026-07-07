"use client";
import * as React from "react";
import { Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldCheck, Lock, Mail, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/inbox";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bienvenido a Sekunet Chat");
      router.replace(next);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "No fue posible iniciar sesión");
    } finally { setLoading(false); }
  }

  async function handleResetPassword() {
    if (!email) { setError("Ingresa tu correo primero para enviarte el enlace de recuperación"); return; }
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin/settings`
      });
      if (error) throw error;
      toast.success("Enlace de recuperación enviado a tu correo");
    } catch (err: any) {
      setError(err?.message || "No fue posible enviar el correo de recuperación");
    } finally { setLoading(false); }
  }

  return (
    <main id="main" className="min-h-dvh grid lg:grid-cols-2 px-safe">
      {/* Panel de marca */}
      <aside className="relative hidden lg:flex flex-col justify-between p-14 xl:p-16 gradient-brand text-white overflow-hidden">
        {/* Orbes decorativos */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-white/[0.07] blur-3xl" />
          <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-orange-400/[0.12] blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-blue-400/[0.06] blur-2xl" />
        </div>

        {/* Logo top */}
        <div className="relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="relative group/logo">
              <div className="absolute -inset-2 bg-gradient-to-r from-white/30 via-blue-400/30 to-orange-400/30 rounded-3xl blur-xl opacity-60 group-hover/logo:opacity-100 transition duration-700" />
              <div className="relative w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl p-1 shadow-2xl shadow-black/40 border border-white/30 group-hover/logo:scale-110 transition-all duration-500">
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/80 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={48} height={48} priority className="object-contain drop-shadow-[0_0_25px_rgba(59,130,246,0.6)]" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-white/70">Sekunet</p>
              <p className="text-lg font-bold leading-tight">Centro de Atención</p>
            </div>
          </div>
        </div>

        {/* Contenido central */}
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg space-y-10 py-12">
          <div className="space-y-6">
            <h1 className="text-[3.5rem] xl:text-6xl font-black leading-[1.05] tracking-tight">
              Conversaciones que{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-amber-200">conectan</span>
                <span className="absolute -bottom-1 left-0 right-0 h-3 bg-amber-400/20 rounded-full blur-sm" aria-hidden />
              </span>
              <span className="text-amber-200">.</span>
            </h1>
            <p className="text-white/75 text-lg xl:text-xl leading-relaxed max-w-md">
              Plataforma de atención al cliente con IA integrada, diseñada para el equipo de soporte técnico de Sekunet.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.07] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors duration-300">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-400/20 shrink-0">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Acceso seguro</p>
                <p className="text-xs text-white/60">Roles y permisos granulares por agente</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.07] backdrop-blur-sm border border-white/10 hover:bg-white/[0.12] transition-colors duration-300">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-sky-400/20 shrink-0">
                <Lock className="h-5 w-5 text-sky-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Datos protegidos</p>
                <p className="text-xs text-white/60">Sesiones cifradas y tráfico encriptado</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent mb-5" />
          <p className="text-xs text-white/50">© {new Date().getFullYear()} Sekunet. Desarrollado por César Andrés Batista Vargas.</p>
        </div>
      </aside>

      {/* Formulario */}
      <section className="flex flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6 pt-safe">
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-0.5 shadow-xl shadow-blue-500/30 border border-white/10">
                <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={34} height={34} className="object-contain drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                </div>
              </div>
            <div>
              <span className="font-bold text-base block leading-tight">Sekunet Chat</span>
              <span className="text-[11px] text-muted-foreground">Centro de Atención</span>
            </div>
          </div>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        <div className="flex-1 grid place-items-center px-5 sm:px-6 pb-safe">
          <div className="w-full max-w-sm">
            <div className="mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Iniciar sesión</h2>
              <p className="text-muted-foreground mt-1.5 sm:mt-2 text-sm sm:text-base">Accede a tu panel de atención al cliente.</p>
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-[hsl(var(--danger)/.4)] bg-[hsl(var(--danger)/.1)] p-3 text-sm text-[hsl(var(--danger))]">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input id="email" type="email" autoComplete="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="pl-10" placeholder="tu@empresa.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input id="password" type={showPwd ? "text" : "password"} autoComplete="current-password" required
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="pl-10 pr-10" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" loading={loading} size="lg" className="w-full">
                Entrar
              </Button>
            </form>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button type="button" onClick={handleResetPassword} className="text-xs text-muted-foreground hover:text-brand-700 dark:hover:text-brand-300 hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
              <p className="text-xs text-center text-muted-foreground">
                Al iniciar sesión aceptas nuestras políticas de privacidad y uso responsable de datos.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen grid place-items-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </main>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
