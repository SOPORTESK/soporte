"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { ShieldCheck, Lock, Mail, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
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

  return (
    <main id="main" className="min-h-dvh grid lg:grid-cols-2">
      {/* Panel de marca */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 gradient-brand text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20" aria-hidden style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,.3), transparent 40%)"
        }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-xl p-2 shadow-xl">
              <Image src="/logo.png" alt="Sekunet" width={48} height={48} priority />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">Sekunet</p>
              <p className="text-lg font-semibold">Centro de Atención</p>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Conversaciones que <span className="text-accent-300">conectan</span>.</h1>
          <p className="text-white/85 text-lg">Plataforma omnicanal premium con WhatsApp integrado, accesible y diseñada para tu equipo.</p>
          <ul className="space-y-3 text-white/90">
            <li className="flex items-start gap-3"><ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" /> Cifrado de extremo a extremo y RLS estricto en cada consulta</li>
            <li className="flex items-start gap-3"><Lock className="h-5 w-5 mt-0.5 shrink-0" /> Autenticación segura con Supabase Auth + 2FA opcional</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} Sekunet. Todos los derechos reservados.</p>
      </aside>

      {/* Formulario */}
      <section className="flex flex-col">
        <header className="flex items-center justify-between p-6">
          <div className="lg:hidden flex items-center gap-2">
            <Image src="/logo.png" alt="Sekunet" width={32} height={32} />
            <span className="font-semibold">Sekunet Chat</span>
          </div>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        <div className="flex-1 grid place-items-center px-6 pb-12">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight">Iniciar sesión</h2>
              <p className="text-muted-foreground mt-2">Accede a tu panel de atención al cliente.</p>
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

            <p className="mt-6 text-xs text-center text-muted-foreground">
              Al iniciar sesión aceptas nuestras políticas de privacidad y uso responsable de datos.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
