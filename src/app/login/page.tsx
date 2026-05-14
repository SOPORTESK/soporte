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

  async function handleMagicLink() {
    if (!email) { setError("Ingresa tu correo primero"); return; }
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` }
      });
      if (error) throw error;
      toast.success("Te enviamos un enlace de acceso a tu correo");
    } catch (err: any) {
      setError(err?.message || "No fue posible enviar el enlace");
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
      <aside className="relative hidden lg:flex flex-col justify-between p-12 gradient-brand text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20" aria-hidden style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,.3), transparent 40%)"
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="relative group/logo">
              <div className="absolute -inset-2 bg-gradient-to-r from-white/30 via-blue-400/30 to-orange-400/30 rounded-3xl blur-xl opacity-70 group-hover/logo:opacity-100 transition duration-700 animate-pulse" />
              <div className="relative w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xl p-1 shadow-2xl shadow-black/40 border border-white/30 group-hover:scale-110 transition-all duration-500">
                <div className="w-full h-full rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/80 flex items-center justify-center overflow-hidden">
                  <Image src="/logoTienda3D.png" alt="Sekunet" width={48} height={48} priority className="object-contain drop-shadow-[0_0_25px_rgba(59,130,246,0.6)]" />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">Sekunet</p>
              <p className="text-lg font-semibold">Centro de Atención</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Conversaciones que <span className="text-accent-300">conectan</span>.</h1>
          <p className="text-white/85 text-lg">Plataforma de atención al cliente con IA integrada, diseñada para el equipo de soporte técnico de Sekunet.</p>
          <ul className="space-y-3 text-white/90">
            <li className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" /> Acceso seguro con roles y permisos por agente</li>
            <li className="flex items-start gap-3"><Lock className="h-5 w-5 mt-0.5 shrink-0" /> Sesiones protegidas y datos cifrados en tránsito</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} Sekunet. Todos los derechos reservados.</p>
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
                <div className="flex justify-between items-center">
                  <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
                  <button type="button" onClick={handleMagicLink} className="text-xs text-brand-700 dark:text-brand-300 hover:underline">
                    Acceder con enlace por correo
                  </button>
                </div>
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
