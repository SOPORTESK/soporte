"use client";
import * as React from "react";

/* ─── Tipos ─────────────────────────────────────────────────── */
type MsgRole = "user" | "assistant" | "tecnico";
interface ChatMsg {
  id: string;
  role: MsgRole;
  content: string;
  time: string;
  status?: "pending" | "sent" | "error";
}

/* ─── Helpers ────────────────────────────────────────────────── */
const BASE = ""; // mismo origen
const SESSION_VERSION = "2"; // Incrementar para forzar re-login de todos los usuarios
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch {} },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ─── Componente principal ───────────────────────────────────── */
export default function WidgetPage() {
  const [step, setStep] = React.useState<"form" | "chat">("form");
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
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
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
        if (data.valid) {
          setCedulaStatus("valid");
          setCedulaInfo({ nombre: data.nombre, tipo: data.tipo });
          setCedulaError("");
          // Auto-rellenar nombre si está vacío
          if (!nombre.trim() && data.nombre) {
            setNombre(data.nombre);
          }
        } else {
          setCedulaStatus("invalid");
          setCedulaError(data.error || "Cédula no válida");
        }
      } catch {
        setCedulaStatus("invalid");
        setCedulaError("Error al verificar. Intente de nuevo.");
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
            setStep("form");
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
        const hist: ChatMsg[] = [];
        (data.histcliente ?? []).forEach((e: any, i: number) => {
          hist.push({ id: `c-${i}`, role: e.role ?? "user", content: e.content ?? "", time: e.time ?? "" });
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
  }, [sessionId, step]);

  /* ── Iniciar sesión ── */
  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    if (!cedula.trim() || cedulaStatus !== "valid") {
      setError("Debe ingresar un número de cédula válido verificado por Hacienda.");
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
  async function sendMsg() {
    const body = draft.trim();
    if (!body || sending || !sessionId) return;
    setSending(true);

    const optimistic: ChatMsg = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: body,
      time: new Date().toISOString(),
      status: "pending",
    };
    setMsgs(p => [...p, optimistic]);
    setDraft("");

    try {
      const res = await fetch(`${BASE}/api/widget/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, content: body, role: "user" }),
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

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  }

  /* ─── RENDER ─────────────────────────────────────────────── */
  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.avatar}>
            <svg viewBox="0 0 100 100" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              {/* Hexágono azul (derecha) */}
              <polygon points="50,8 85,28 85,72 50,92 15,72 15,28" fill="none" />
              <polygon points="58,12 88,30 88,68 58,86 28,68 28,30" fill="#2563a8" opacity="0.9" transform="translate(6,-2) scale(0.7) translate(20,14)" />
              {/* Forma hexagonal azul */}
              <path d="M55 18 L80 32 L80 62 L55 76 L30 62 L30 32 Z" fill="url(#blueGrad)" />
              {/* Ondas naranja */}
              <path d="M44 50 Q38 42 38 50 Q38 58 44 50" fill="none" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M38 50 Q28 36 28 50 Q28 64 38 50" fill="none" stroke="#f97316" strokeWidth="3.5" strokeLinecap="round"/>
              <path d="M32 50 Q18 30 18 50 Q18 70 32 50" fill="none" stroke="#ea8c0a" strokeWidth="3" strokeLinecap="round"/>
              {/* Punto central */}
              <circle cx="47" cy="50" r="3.5" fill="#f97316" />
              <defs>
                <linearGradient id="blueGrad" x1="30" y1="18" x2="80" y2="76" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b82f6"/>
                  <stop offset="100%" stopColor="#1e3a8a"/>
                </linearGradient>
              </defs>
            </svg>
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
              <MsgBubble key={m.id} m={m} />
            ))}
          </div>

          {/* Input */}
          <div style={S.inputBar}>
            <textarea
              style={S.textarea}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKey}
              placeholder="Escribe un mensaje… (Enter envía)"
              rows={1}
            />
            <button
              onClick={sendMsg}
              disabled={!draft.trim() || sending}
              style={{ ...S.sendBtn, opacity: !draft.trim() || sending ? 0.5 : 1 }}
              aria-label="Enviar"
            >
              ➤
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
function MsgBubble({ m }: { m: ChatMsg }) {
  const isUser = m.role === "user";
  const isTec = m.role === "tecnico";
  const isIA = m.role === "assistant";

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
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
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

/* ─── Estilos inline (sin dependencias CSS) ──────────────────── */
const S: Record<string, React.CSSProperties> = {
  root: {
    display: "flex", flexDirection: "column", height: "100vh",
    background: "#fff", overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    background: "linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%)",
    padding: "12px 16px",
    flexShrink: 0,
  },
  headerInner: { display: "flex", alignItems: "center", gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,.25)",
    color: "#fff", fontWeight: 700, fontSize: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
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
