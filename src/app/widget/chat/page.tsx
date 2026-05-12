"use client";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";

/* ─── Tipos ─────────────────────────────────────────────────── */
type MsgRole = "user" | "assistant" | "tecnico";
interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string;
  time: string;
  status?: "pending" | "sent" | "error";
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
const BASE = ""; // mismo origen
const SESSION_VERSION = "2"; // Incrementar para forzar re-login de todos los usuarios
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch {} },
};

// Marca de uso único cuando Hacienda falla: se guarda en localStorage
const haciendaFallbackFlag = {
  get: () => { try { return localStorage.getItem("sek_cedula_fallback_used"); } catch { return null; } },
  set: () => { try { localStorage.setItem("sek_cedula_fallback_used", "1"); } catch {} },
  clear: () => { try { localStorage.removeItem("sek_cedula_fallback_used"); } catch {} },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ─── Componente principal ───────────────────────────────────── */
export default function WidgetPage() {
  const [step, setStep] = React.useState<"splash" | "form" | "chat">("splash");
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [nombre, setNombre] = React.useState("");
  const [correo, setCorreo] = React.useState("");
  const [cedula, setCedula] = React.useState("");
  const [cedulaStatus, setCedulaStatus] = React.useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [cedulaInfo, setCedulaInfo] = React.useState<{ nombre?: string; tipo?: string } | null>(null);
  const [cedulaError, setCedulaError] = React.useState("");
  const [msgs, setMsgs] = React.useState<ChatMsg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [showEncuesta, setShowEncuesta] = React.useState(false);
  const [encuestaRating, setEncuestaRating] = React.useState(0);
  const [encuestaEnviada, setEncuestaEnviada] = React.useState(false);
  const casoCerradoRef = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cedulaTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Validar cédula contra Hacienda (con debounce) ── */
  function onCedulaChange(raw: string) {
    const clean = raw.replace(/[^\d]/g, "");
    setCedula(clean);
    setCedulaInfo(null);
    setCedulaError("");

    if (cedulaTimerRef.current) clearTimeout(cedulaTimerRef.current);

    if (!clean || clean.length < 9) {
      setCedulaStatus("idle");
      return;
    }

    setCedulaStatus("checking");
    cedulaTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/cedula?id=${clean}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setCedulaStatus("valid");
          setCedulaInfo({ nombre: data.nombre, tipo: data.tipo });
          setCedulaError("");
          haciendaFallbackFlag.clear();
          // Auto-rellenar nombre si está vacío
          if (!nombre.trim() && data.nombre) {
            setNombre(data.nombre);
          }
        } else if (!res.ok && res.status >= 500) {
          // Hacienda no responde: permitir UNA SOLA VEZ (marcar flag)
          if (haciendaFallbackFlag.get()) {
            setCedulaStatus("invalid");
            setCedulaError("Hacienda sigue sin responder. Intente más tarde.");
          } else {
            setCedulaStatus("valid");
            setCedulaInfo({ nombre, tipo: "no verificada" });
            setCedulaError("No pudimos verificar con Hacienda, pero puede continuar (uso único).");
            haciendaFallbackFlag.set();
          }
        } else {
          setCedulaStatus("invalid");
          setCedulaError(data.error || "Cédula no válida");
        }
      } catch {
        // Timeout o error de red: permitir UNA SOLA VEZ (marcar flag)
        if (haciendaFallbackFlag.get()) {
          setCedulaStatus("invalid");
          setCedulaError("Hacienda sigue sin responder. Intente más tarde.");
        } else {
          setCedulaStatus("valid");
          setCedulaInfo({ nombre, tipo: "no verificada" });
          setCedulaError("No pudimos verificar con Hacienda, pero puede continuar (uso único).");
          haciendaFallbackFlag.set();
        }
      }
    }, 600);
  }

  /* Restaurar sesión previa (solo si la versión coincide) */
  React.useEffect(() => {
    const savedVer = store.get("sek_widget_version");
    const saved = store.get("sek_widget_session");

    // Si la versión cambió, invalidar sesión
    if (savedVer !== SESSION_VERSION) {
      store.del("sek_widget_session");
      store.del("sek_widget_version");
      return;
    }

    if (saved) {
      setSessionId(saved);
      setStep("chat");
      (async () => {
        try {
          const res = await fetch(`${BASE}/api/widget/messages?session_id=${saved}`);
          if (!res.ok) {
            store.del("sek_widget_session");
            store.del("sek_widget_version");
            setSessionId(null);
            setStep("splash");
          }
        } catch {}
      })();
    }
  }, []);

  /* Scroll al fondo cuando llegan mensajes */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  /* Polling de respuestas del agente cada 4 s */
  React.useEffect(() => {
    if (!sessionId || step !== "chat") return;

    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/api/widget/messages?session_id=${sessionId}`);
        if (!res.ok) {
          if (res.status === 404) {
            try { sessionStorage.removeItem("sek_widget_session"); } catch {}
            setSessionId(null);
            setStep("form");
          }
          return;
        }
        const data = await res.json();
        // Detectar cierre de caso — mostrar encuesta (también en la primera carga)
        const estadoActual = data.estado?.toLowerCase();
        const estaCerrado = estadoActual === "cerrado" || estadoActual === "resuelto";
        const yaEnBD = data.calificacion_cliente != null;
        const encuestaGuardada = !!store.get(`sek_encuesta_${sessionId}`);

        if (estaCerrado) {
          // Marcar como cerrado en esta sesión
          casoCerradoRef.current = true;
          if (!yaEnBD && !encuestaGuardada) {
            // No calificada en BD y no marcada en storage → mostrar encuesta
            setShowEncuesta(true);
          }
          // Si ya está en BD, sincronizar storage para no volver a mostrar
          if (yaEnBD) store.set(`sek_encuesta_${sessionId}`, "1");
        }
        // Si el caso se reabrió, limpiar estado de encuesta
        if (!estaCerrado && casoCerradoRef.current) {
          casoCerradoRef.current = false;
          store.del(`sek_encuesta_${sessionId}`);
          setShowEncuesta(false);
          setEncuestaEnviada(false);
        }
        const hist: ChatMsg[] = [];
        (data.histcliente ?? []).forEach((e: any, i: number) => {
          hist.push({
            id: `c-${i}`,
            role: e.role ?? "user",
            content: e.content ?? "",
            time: e.time ?? "",
            mediaUrl: e.mediaUrl,
            mediaType: e.mediaType,
            fileName: e.fileName,
          });
        });
        (data.histtecnico ?? []).forEach((e: any, i: number) => {
          hist.push({ id: `t-${i}`, role: "tecnico", content: e.content ?? "", time: e.time ?? "" });
        });
        hist.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        if (hist.length === 0) {
          setMsgs(prev => {
            if (prev.some(m => m.id === "welcome")) return prev;
            return [{
              id: "welcome",
              role: "assistant",
              content: `¡Hola${nombre ? " " + nombre : ""}! 👋 Somos el equipo de soporte de Sekunet. ¿En qué podemos ayudarte hoy?`,
              time: new Date().toISOString(),
              status: "sent",
            }];
          });
        } else {
          setMsgs(hist.map(m => ({ ...m, status: "sent" })));
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, step, nombre]);

  /* ── Iniciar sesión ── */
  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    if (!cedula.trim() || cedulaStatus !== "valid") {
      setError("Debe ingresar un número de cédula válido.");
      return;
    }
    if (!nombre.trim()) { setError("Por favor ingresa tu nombre."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), correo: correo.trim(), cedula: cedula.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al iniciar sesión");
      store.set("sek_widget_session", data.session_id);
      store.set("sek_widget_version", SESSION_VERSION);
      setSessionId(data.session_id);
      setStep("chat");
      setMsgs([{
        id: "welcome",
        role: "assistant",
        content: `¡Hola${nombre ? " " + nombre : ""}! 👋 Somos el equipo de soporte de Sekunet. ¿En qué podemos ayudarte hoy?`,
        time: new Date().toISOString(),
        status: "sent",
      }]);
    } catch (err: any) {
      setError(err.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  /* ── Enviar mensaje ── */
  async function sendMsg(override?: string, mUrl?: string, mType?: string, mName?: string) {
    const body = (override ?? draft).trim();
    if ((!body && !mUrl) || sending || !sessionId) return;
    setSending(true);

    const optimistic: ChatMsg = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: body || mName || "Archivo adjunto",
      time: new Date().toISOString(),
      status: "pending",
      mediaUrl: mUrl,
      mediaType: mType,
      fileName: mName,
    };
    setMsgs(p => [...p, optimistic]);
    if (!override) setDraft("");

    try {
      const res = await fetch(`${BASE}/api/widget/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          session_id: sessionId, 
          content: body, 
          role: "user",
          mediaUrl: mUrl,
          mediaType: mType,
          fileName: mName
        }),
      });
      if (!res.ok) {
        if (res.status === 404) {
          try { sessionStorage.removeItem("sek_widget_session"); } catch {}
          setSessionId(null);
          setStep("form");
          throw new Error("Sesión expirada. Por favor, inicia el chat de nuevo.");
        }
        throw new Error("Error al enviar");
      }
      setMsgs(p => p.map(m => m.id === optimistic.id ? { ...m, status: "sent" } : m));
    } catch {
      setMsgs(p => p.map(m => m.id === optimistic.id ? { ...m, status: "error" } : m));
    } finally {
      setSending(false);
    }
  }

  async function enviarEncuesta(rating: number) {
    if (!sessionId || encuestaEnviada) return;
    setEncuestaEnviada(true);
    store.set(`sek_encuesta_${sessionId}`, "1");
    try {
      await fetch(`${BASE}/api/widget/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, rating }),
      });
    } catch { /* no bloquea si falla */ }
    setTimeout(() => setShowEncuesta(false), 2000);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `widget/${sessionId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      await sendMsg("", publicUrl, file.type, file.name);
    } catch (err: any) {
      alert("Error al subir archivo: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  }

  /* ─── RENDER ─────────────────────────────────────────────── */
  if (step === "splash") {
    return <SplashScreen onFinish={() => setStep("form")} />;
  }

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.avatar}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iSoTienda3D.png" alt="Sekunet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <div>
            <div style={S.headerTitle}>Soporte Sekunet</div>
            <div style={S.headerSub}>
              <span style={S.dot} /> En línea
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      {step === "form" ? (
        <form onSubmit={startSession} style={S.form}>
          <p style={S.formTitle}>¡Hola! 👋 Antes de comenzar</p>
          <p style={S.formSub}>Ingresa tus datos para conectarte con un agente.</p>

          <label style={S.label}>Cédula / DIMEX *</label>
          <div style={{ position: "relative" }}>
            <input
              style={{
                ...S.input,
                width: "100%",
                boxSizing: "border-box" as const,
                paddingRight: 36,
                borderColor: cedulaStatus === "valid" ? "#16a34a"
                  : cedulaStatus === "invalid" ? "#dc2626"
                  : undefined,
              }}
              value={cedula}
              onChange={e => onCedulaChange(e.target.value)}
              placeholder="Ej: 101230456"
              inputMode="numeric"
              maxLength={12}
              required
              autoFocus
            />
            <span style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              fontSize: 16, lineHeight: 1,
            }}>
              {cedulaStatus === "checking" && "⏳"}
              {cedulaStatus === "valid" && "✅"}
              {cedulaStatus === "invalid" && "❌"}
            </span>
          </div>
          {cedulaStatus === "valid" && cedulaInfo?.nombre && (
            <p style={{ fontSize: 11, color: "#16a34a", margin: "-2px 0 0 2px" }}>
              ✓ {cedulaInfo.nombre}
              {cedulaInfo.tipo && <span style={{ opacity: 0.7 }}> ({cedulaInfo.tipo})</span>}
            </p>
          )}
          {cedulaError && <p style={{ fontSize: 11, color: "#dc2626", margin: "-2px 0 0 2px" }}>{cedulaError}</p>}

          <label style={S.label}>Nombre *</label>
          <input
            style={S.input}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Tu nombre"
            required
          />

          <label style={S.label}>Correo (opcional)</label>
          <input
            style={S.input}
            type="email"
            value={correo}
            onChange={e => setCorreo(e.target.value)}
            placeholder="tu@correo.com"
          />

          {error && <p style={S.err}>{error}</p>}

          <button
            type="submit"
            disabled={loading || cedulaStatus !== "valid"}
            style={{
              ...S.btnPrimary,
              opacity: (loading || cedulaStatus !== "valid") ? 0.5 : 1,
              cursor: (loading || cedulaStatus !== "valid") ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Conectando…" : "Iniciar chat →"}
          </button>
        </form>
      ) : (
        <>
          {/* Messages */}
          <div ref={scrollRef} style={S.messages}>
            {msgs.length === 0 && (
              <p style={S.emptyMsg}>Sin mensajes aún.</p>
            )}
            {msgs.map(m => (
              <MsgBubble key={m.id} m={m} onSelect={val => sendMsg(val)} />
            ))}
            {/* Encuesta de satisfacción */}
            {showEncuesta && (
              <div style={{
                margin: "12px 0", padding: "16px", borderRadius: 16,
                background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
                color: "#fff", textAlign: "center",
              }}>
                {encuestaEnviada ? (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>🙏</div>
                    <p style={{ fontWeight: 700, fontSize: 14 }}>¡Gracias por su respuesta!</p>
                    <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>Su opinión nos ayuda a mejorar.</p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>¿Cómo califica la atención recibida?</p>
                    <p style={{ fontSize: 11, opacity: 0.85, marginBottom: 12 }}>Toque una estrella para calificar</p>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                      {[1, 2, 3, 4, 5].map(s => (
                        <button
                          key={s}
                          onClick={() => { setEncuestaRating(s); enviarEncuesta(s); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 28, padding: "2px", lineHeight: 1,
                            opacity: encuestaRating > 0 ? (s <= encuestaRating ? 1 : 0.35) : 1,
                            transform: encuestaRating === s ? "scale(1.3)" : "scale(1)",
                            transition: "all .15s",
                          }}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => { store.set(`sek_encuesta_${sessionId}`, "1"); setShowEncuesta(false); }}
                      style={{
                        background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                        color: "#fff", borderRadius: 8, padding: "4px 12px",
                        fontSize: 11, cursor: "pointer"
                      }}
                    >
                      Omitir
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input */}
          <div style={S.inputArea}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFile}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                background: "none", border: "none", padding: "8px 4px",
                color: "#64748b", cursor: "pointer", opacity: uploading ? 0.5 : 1,
              }}
              title="Subir archivo"
            >
              {uploading ? "⏳" : "📎"}
            </button>
            <textarea
              style={S.textarea}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder="Escribe un mensaje..."
              rows={1}
            />
            <button
              onClick={() => sendMsg()}
              disabled={(!draft.trim() && !uploading) || sending}
              style={{
                background: "none", border: "none", padding: "8px 4px",
                color: "#2563eb", fontWeight: 700, cursor: "pointer",
                opacity: (!draft.trim() && !uploading) || sending ? 0.5 : 1,
              }}
            >
              {sending ? "..." : "Enviar"}
            </button>
          </div>
          <div style={S.powered}>
            Powered by <strong>Sekunet</strong>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Burbuja de mensaje ─────────────────────────────────────── */
function MsgBubble({ m, onSelect }: { m: ChatMsg; onSelect?: (val: string) => void }) {
  const isUser = m.role === "user";
  const isTec = m.role === "tecnico";
  const isIA = m.role === "assistant";

  const renderMedia = () => {
    if (!m.mediaUrl) return null;
    const t = m.mediaType || "";
    if (t.startsWith("image/")) {
      return (
        <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.mediaUrl} alt={m.fileName || "imagen"} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, objectFit: "cover" }} />
        </a>
      );
    }
    if (t.startsWith("video/")) {
      return <video src={m.mediaUrl} controls style={{ maxWidth: "100%", borderRadius: 8, marginTop: 4 }} />;
    }
    if (t.startsWith("audio/")) {
      return <audio src={m.mediaUrl} controls style={{ marginTop: 4, width: "100%", maxWidth: 200 }} />;
    }
    return (
      <a
        href={m.mediaUrl} target="_blank" rel="noopener noreferrer"
        style={{
          marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.05)",
          fontSize: 11, color: "inherit", textDecoration: "none"
        }}
      >
        <span>📎 {m.fileName || "Archivo"}</span>
      </a>
    );
  };

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 8 }}>
      <div style={{
        maxWidth: "78%",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "8px 12px",
        background: isUser
          ? "linear-gradient(135deg,#1d4ed8,#2563eb)"
          : isTec
            ? "linear-gradient(135deg,#065f46,#059669)"
            : "#f1f5f9",
        color: isUser || isTec ? "#fff" : "#0f172a",
        fontSize: 13,
        lineHeight: 1.5,
        boxShadow: "0 1px 4px rgba(0,0,0,.08)",
      }}>
        {(isIA || isTec) && (
          <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2, opacity: 0.85 }}>
            {isIA ? "🤖 Asistente" : "💬 Agente"}
          </div>
        )}
        {renderMedia()}
        
        {/* Contenido con detección de [SUGERENCIAS] */}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {(!m.content && m.fileName) && (
            <span style={{ opacity: 0.7, fontSize: 11 }}>📎 {m.fileName}</span>
          )}
          {m.content?.includes("[SUGERENCIAS:") ? (
            <>
              {m.content.split("[SUGERENCIAS:")[0]}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {m.content
                  .match(/\[SUGERENCIAS:\s*(.+?)\]/)?.[1]
                  .split(",")
                  .map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => onSelect?.(opt.trim())}
                      style={{
                        background: isUser || isTec ? "rgba(255,255,255,0.2)" : "rgba(37,99,235,0.1)",
                        border: isUser || isTec ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(37,99,235,0.3)",
                        color: isUser || isTec ? "#fff" : "#2563eb",
                        padding: "4px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      {opt.trim()}
                    </button>
                  ))}
              </div>
              {m.content.split("]")[1]}
            </>
          ) : (
            m.content
          )}
        </div>

        <div style={{
          fontSize: 10, marginTop: 4, textAlign: "right",
          opacity: 0.7,
          color: isUser || isTec ? "#fff" : "#64748b"
        }}>
          {m.time ? fmt(m.time) : ""}
          {m.status === "pending" && " ⏳"}
          {m.status === "error" && " ❌"}
        </div>
      </div>
    </div>
  );
}

/* ─── Splash Screen Premium ──────────────────────────────────── */
function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [exiting, setExiting] = React.useState(false);

  React.useEffect(() => {
    const t1 = setTimeout(() => setExiting(true), 3000);
    const t2 = setTimeout(() => onFinish(), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onFinish]);

  // Partículas generadas de forma determinista
  const particles = React.useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      left: `${(i * 37 + 11) % 100}%`,
      size: 2 + (i % 4) * 1.5,
      delay: `${(i * 0.7) % 5}s`,
      duration: `${4 + (i % 4) * 2}s`,
      opacity: 0.3 + (i % 3) * 0.2,
    })), []);

  return (
    <div className={`splash-root ${exiting ? "splash-exit" : ""}`}>
      {/* Shimmer lines top & bottom */}
      <div className="splash-shimmer" />
      <div className="splash-shimmer-bottom" />

      {/* Ambient orbs */}
      <div className="splash-orb splash-orb-1" />
      <div className="splash-orb splash-orb-2" />
      <div className="splash-orb splash-orb-3" />

      {/* Floating particles */}
      <div className="splash-particles">
        {particles.map((p, i) => (
          <div
            key={i}
            className="splash-particle"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>

      {/* Pulse rings */}
      <div className="splash-ring" />
      <div className="splash-ring" />
      <div className="splash-ring" />

      {/* Logo */}
      <div className="splash-logo-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/iSoTienda3D.png"
          alt="Sekunet"
          className="splash-logo-img"
        />
      </div>
      <div className="splash-logo-reflection" />

      {/* Brand text */}
      <div className="splash-brand">
        <div className="splash-brand-name">Sekunet</div>
      </div>
      <div className="splash-tagline">Soporte Inteligente</div>

      {/* Separator line */}
      <div className="splash-line" />

      {/* Loading dots */}
      <div className="splash-loader">
        <div className="splash-loader-dot" />
        <div className="splash-loader-dot" />
        <div className="splash-loader-dot" />
      </div>

      {/* Bottom text */}
      <div className="splash-bottom">
        <div className="splash-bottom-text">Experiencia Premium</div>
      </div>
    </div>
  );
}

/* ─── Estilos inline (sin dependencias CSS) ──────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100vh",
    background: "#fff", overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    background: "#2563eb",
    padding: "12px 16px",
    flexShrink: 0,
    boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
  },
  headerInner: { display: "flex", alignItems: "center", gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: "12px",
    background: "transparent",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  headerTitle: { color: "#fff", fontWeight: 600, fontSize: 14 },
  headerSub: { color: "rgba(255,255,255,.8)", fontSize: 11, display: "flex", alignItems: "center", gap: 4 },
  dot: {
    width: 7, height: 7, borderRadius: "50%",
    background: "#4ade80", display: "inline-block",
  },
  form: {
    flex: 1, overflowY: "auto", padding: 20,
    display: "flex", flexDirection: "column", gap: 8,
  },
  formTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 2 },
  formSub: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: {
    border: "1.5px solid #e2e8f0", borderRadius: 8,
    padding: "9px 12px", fontSize: 13, outline: "none",
    fontFamily: "inherit", color: "#0f172a",
    transition: "border-color .15s",
  },
  err: { color: "#dc2626", fontSize: 12 },
  btnPrimary: {
    marginTop: 8, padding: "10px 0", borderRadius: 10,
    background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
    color: "#fff", border: "none", cursor: "pointer",
    fontWeight: 600, fontSize: 14, fontFamily: "inherit",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "12px 14px",
    background: "#f8fafc",
  },
  emptyMsg: { textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 40 },
  inputBar: {
    display: "flex", alignItems: "flex-end", gap: 8,
    padding: "8px 12px", borderTop: "1px solid #e2e8f0",
    background: "#fff", flexShrink: 0,
  },
  textarea: {
    flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 10,
    padding: "8px 12px", fontSize: 13, resize: "none",
    fontFamily: "inherit", outline: "none", color: "#0f172a",
    maxHeight: 100, overflowY: "auto",
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: "50%",
    background: "linear-gradient(135deg,#1d4ed8,#2563eb)",
    color: "#fff", border: "none", cursor: "pointer",
    fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0, transition: "opacity .15s",
  },
  powered: {
    textAlign: "center", fontSize: 10, color: "#94a3b8",
    padding: "4px 0 6px", background: "#fff",
  },
};
