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
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} },
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
  const [msgs, setMsgs] = React.useState<ChatMsg[]>([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  /* Restaurar sesión previa */
  React.useEffect(() => {
    const saved = store.get("sek_widget_session");
    if (saved) {
      setSessionId(saved);
      setStep("chat");
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
        if (!res.ok) return;
        const data = await res.json();
        const hist: ChatMsg[] = [];
        (data.histcliente ?? []).forEach((e: any, i: number) => {
          hist.push({ id: `c-${i}`, role: e.role ?? "user", content: e.content ?? "", time: e.time ?? "" });
        });
        (data.histtecnico ?? []).forEach((e: any, i: number) => {
          hist.push({ id: `t-${i}`, role: "tecnico", content: e.content ?? "", time: e.time ?? "" });
        });
        hist.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        setMsgs(hist.map(m => ({ ...m, status: "sent" })));
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, step]);

  /* ── Iniciar sesión ── */
  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) { setError("Por favor ingresa tu nombre."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BASE}/api/widget/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), correo: correo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al iniciar sesión");
      store.set("sek_widget_session", data.session_id);
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
      if (!res.ok) throw new Error("Error al enviar");
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
          <div style={S.avatar}>S</div>
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

          <label style={S.label}>Nombre *</label>
          <input
            style={S.input}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Tu nombre"
            required
            autoFocus
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

          <button type="submit" disabled={loading} style={S.btnPrimary}>
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
