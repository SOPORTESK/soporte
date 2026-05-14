"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, User, Send, Loader2, Save, FileText, Paperclip, X, History, RotateCcw, ShieldAlert, ChevronDown, ChevronUp, CheckCheck, Play, Eye, MessageSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface HistoryEntry {
  time: string;
  summary: string;
  prompt: string;
}

interface DbHistoryEntry {
  id: string;
  summary: string;
  changed_by: string;
  change_type: "block_edit" | "full_replace" | "restore";
  created_at: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  attachment?: {
    name: string;
    type: string;
    url?: string;
  };
}

export function MetaAgentChat({ initialPrompt, isSuperadmin }: { initialPrompt: string; isSuperadmin?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(initialPrompt);
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dbHistory, setDbHistory] = useState<DbHistoryEntry[]>([]);
  const [showDbHistory, setShowDbHistory] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [patchInfo, setPatchInfo] = useState<{ before: string; after: string } | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Estados para modo SIMULACIÓN
  const [mode, setMode] = useState<"train" | "simulate">("train");
  const [simulationMessages, setSimulationMessages] = useState<Message[]>([]);
  const [simulationInput, setSimulationInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationCaseId, setSimulationCaseId] = useState<string | null>(null);
  // Estado para el chat con el ARQUITECTO en vivo
  const [architectMessages, setArchitectMessages] = useState<Message[]>([]);
  const [architectInput, setArchitectInput] = useState("");
  const [isArchitectThinking, setIsArchitectThinking] = useState(false);
  const architectScrollRef = useRef<HTMLDivElement>(null);
  const simulationScrollRef = useRef<HTMLDivElement>(null);
  const promptPanelRef = useRef<HTMLDivElement>(null);

  // Cargar historial persistente y prompt activo desde BD al montar
  useEffect(() => {
    fetch("/api/admin/agente-ia/restore-prompt")
      .then(r => r.json())
      .then(d => {
        if (d.history) setDbHistory(d.history);
        if (d.activePrompt) setCurrentPrompt(d.activePrompt);
      })
      .catch(() => {});
  }, []);

  const reloadDbHistory = (updatePrompt = false) => {
    fetch("/api/admin/agente-ia/restore-prompt")
      .then(r => r.json())
      .then(d => {
        if (d.history) setDbHistory(d.history);
        if (updatePrompt && d.activePrompt) setCurrentPrompt(d.activePrompt);
      })
      .catch(() => {});
  };

  const handleRestore = async (entry: DbHistoryEntry) => {
    if (!confirm(`¿Restaurar la versión "${entry.summary}" del ${new Date(entry.created_at).toLocaleString()}? Esta acción reemplazará el prompt activo.`)) return;
    setRestoring(entry.id);
    try {
      const res = await fetch("/api/admin/agente-ia/restore-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: entry.id, currentPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentPrompt(data.restoredPrompt);
      toast.success("Versión restaurada correctamente.");
      reloadDbHistory();
    } catch (err: any) {
      toast.error(err.message || "Error al restaurar");
    } finally {
      setRestoring(null);
    }
  };
  
  const renderPatch = (fullPrompt: string, patch: { before: string; after: string } | null) => {
    if (!patch) {
      return <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-zinc-400">{fullPrompt}</pre>;
    }
    const idx = fullPrompt.indexOf(patch.after);
    if (idx === -1) {
      return <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-zinc-400">{fullPrompt}</pre>;
    }
    const before = fullPrompt.slice(0, idx);
    const changed = fullPrompt.slice(idx, idx + patch.after.length);
    const after = fullPrompt.slice(idx + patch.after.length);
    return (
      <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-zinc-400">
        {before}
        <mark className="bg-emerald-500/30 text-emerald-200 rounded px-0.5 not-italic font-bold">{changed}</mark>
        {after}
      </pre>
    );
  };

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async (e?: React.FormEvent, predefinedMessage?: string) => {
    e?.preventDefault();
    const msgToSend = predefinedMessage || input.trim();
    if ((!msgToSend && !attachedFile) || isLoading) return;

    const userMessage = msgToSend;
    const fileToUpload = attachedFile;
    setInput("");
    setAttachedFile(null);
    
    // Add optimistic user message with attachment if any
    const newMessages: Message[] = [
      ...messages, 
      { 
        role: "user", 
        content: userMessage || (fileToUpload ? `[Archivo: ${fileToUpload.name}]` : ""),
        attachment: fileToUpload ? { name: fileToUpload.name, type: fileToUpload.type } : undefined
      }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      let fileData = null;
      if (fileToUpload) {
        const name = fileToUpload.name.toLowerCase();
        const isImage = fileToUpload.type.startsWith("image/");
        const isVideoOrAudio = fileToUpload.type.startsWith("video/") || fileToUpload.type.startsWith("audio/");
        const isTextType = fileToUpload.type.includes("text") || name.endsWith(".csv") || name.endsWith(".md") || name.endsWith(".txt") || name.endsWith(".json") || name.endsWith(".xml");
        const needsExtraction = name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx") || name.endsWith(".html") || name.endsWith(".htm");

        if (isImage) {
          // Imágenes: base64 para Gemini Vision
          fileData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(fileToUpload);
          });
        } else if (isVideoOrAudio) {
          // Video/Audio: subir a Gemini File API y pasar la URI
          const arrayBuffer = await fileToUpload.arrayBuffer();
          const uploadRes = await fetch("/api/admin/manuales/upload-gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: fileToUpload.name,
              mimeType: fileToUpload.type,
              data: Array.from(new Uint8Array(arrayBuffer)),
            }),
          });
          if (uploadRes.ok) {
            const { fileUri, mimeType } = await uploadRes.json();
            fileData = { fileUri, mimeType, name: fileToUpload.name };
          }
        } else if (isTextType) {
          // Texto plano: leer directamente
          const text = await fileToUpload.text();
          fileData = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
        } else if (needsExtraction) {
          // PDF, DOC, DOCX, HTML: extraer texto via API
          const form = new FormData();
          form.append("files", fileToUpload);
          const extractRes = await fetch("/api/admin/manuales/extract-text", { method: "POST", body: form });
          if (extractRes.ok) {
            const { text } = await extractRes.json();
            fileData = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text || "[Sin texto extraíble]")))}`;
          }
        } else {
          // Fallback: intentar extraer texto
          const form = new FormData();
          form.append("files", fileToUpload);
          const extractRes = await fetch("/api/admin/manuales/extract-text", { method: "POST", body: form });
          if (extractRes.ok) {
            const { text } = await extractRes.json();
            fileData = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text || "[Sin texto extraíble]")))}`;
          }
        }
      }

      const res = await fetch("/api/admin/agente-ia/meta-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage, 
          history: messages,
          currentPrompt,
          mode,
          isSuperadminOverride: false,
          file: fileData ? {
            base64: fileData,
            name: fileToUpload?.name,
            type: fileToUpload?.type
          } : null
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al conectar con la IA.");
      }

      const data = await res.json();

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);

      // Si la respuesta contiene una propuesta (box de sugerencias), mostrar botón de aplicar
      if (data.reply?.includes("PROPUESTA DE CAMBIO") || data.reply?.includes("¿Aprueba este cambio?")) {
        setPendingApproval(true);
      }

      // Si la IA decidió actualizar el prompt
      if (data.newPrompt) {
        setPendingApproval(false);
        const newEntry: HistoryEntry = {
          time: new Date().toLocaleTimeString(),
          summary: data.summary || "Actualización de reglas",
          prompt: data.newPrompt
        };
        setHistory(prev => [newEntry, ...prev].slice(0, 5));
        setPreviousPrompt(currentPrompt);
        setCurrentPrompt(data.newPrompt);
        setPatchInfo(data.patchInfo || null);
        setShowDiff(true);
        setTimeout(() => {
          const mark = promptPanelRef.current?.querySelector("mark");
          mark?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
        toast.success("¡El Sistema se ha actualizado! Las reglas de la IA han cambiado.", {
          icon: <Save className="h-4 w-4 text-emerald-500" />
        });
        reloadDbHistory();
      }
    } catch (error: any) {
      console.error(error);
      const errMsg = error.message || "Hubo un problema de conexión";
      toast.error(errMsg);
      setMessages((prev) => [...prev, { role: "assistant", content: "Lo siento, tuve un problema interno de conexión." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type });
          setAttachedFile(file);
        }
      }
    }
  };

  // Funciones para MODO SIMULACIÓN
  const sendSimulationMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const msgToSend = simulationInput.trim();
    if (!msgToSend || isSimulating) return;

    const newMessages = [...simulationMessages, { role: "user" as const, content: msgToSend }];
    setSimulationMessages(newMessages);
    setSimulationInput("");
    setIsSimulating(true);

    try {
      // Llamar al endpoint de simulación (que invoca la edge ia-agent real)
      const res = await fetch("/api/admin/agente-ia/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgToSend, case_id: simulationCaseId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error en simulación");
      }

      const data = await res.json();
      if (data.case_id) setSimulationCaseId(data.case_id);
      setSimulationMessages(prev => [...prev, { role: "assistant", content: data.reply }]);

      // Auto-disparo: el ARQUITECTO observa y comenta tras cada turno del agente
      const caseIdToObserve = data.case_id || simulationCaseId;
      if (caseIdToObserve) {
        triggerArchitectObservation(caseIdToObserve);
      }

    } catch (error: any) {
      console.error("Simulation error:", error);
      toast.error(error.message || "Error en simulación");
      setSimulationMessages(prev => [...prev, { role: "assistant", content: "Lo siento, hubo un error en la simulación." }]);
    } finally {
      setIsSimulating(false);
    }
  };

  // ── ARQUITECTO EN VIVO: observación automática + diálogo bidireccional ──

  // Aplicar patch al prompt si la respuesta del arquitecto trae newPrompt (mismo flow que train chat)
  const applyArchitectPatch = (data: any) => {
    if (data.newPrompt) {
      const newEntry: HistoryEntry = {
        time: new Date().toLocaleTimeString(),
        summary: data.summary || "Actualización desde análisis en vivo",
        prompt: data.newPrompt,
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 5));
      setPreviousPrompt(currentPrompt);
      setCurrentPrompt(data.newPrompt);
      setPatchInfo(data.patchInfo || null);
      setShowDiff(true);
      toast.success("¡Prompt actualizado desde análisis en vivo!", {
        icon: <Save className="h-4 w-4 text-emerald-500" />,
      });
      reloadDbHistory();
    }
  };

  // Disparo silencioso después de cada turno del agente: el arquitecto comenta solo
  const triggerArchitectObservation = async (caseIdToObserve: string) => {
    setIsArchitectThinking(true);
    try {
      const res = await fetch("/api/admin/agente-ia/meta-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "",
          history: architectMessages,
          currentPrompt,
          mode: "train",
          simulation_case_id: caseIdToObserve,
          auto_observation: true,
        }),
      });
      if (!res.ok) throw new Error("Error consultando al arquitecto");
      const data = await res.json();
      if (data.reply) {
        setArchitectMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
      applyArchitectPatch(data);
    } catch (e: any) {
      console.error("[architect] auto-observation error:", e);
    } finally {
      setIsArchitectThinking(false);
    }
  };

  // Mensaje manual del admin al arquitecto
  const sendArchitectMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = architectInput.trim();
    if (!msg || isArchitectThinking) return;

    const newHist = [...architectMessages, { role: "user" as const, content: msg }];
    setArchitectMessages(newHist);
    setArchitectInput("");
    setIsArchitectThinking(true);

    try {
      const res = await fetch("/api/admin/agente-ia/meta-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: architectMessages,
          currentPrompt,
          mode: "train",
          simulation_case_id: simulationCaseId,
          auto_observation: false,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error con arquitecto");
      }
      const data = await res.json();
      setArchitectMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      applyArchitectPatch(data);
    } catch (e: any) {
      toast.error(e.message || "Error consultando al arquitecto");
      setArchitectMessages(prev => [...prev, { role: "assistant", content: "(Error de conexión al arquitecto)" }]);
    } finally {
      setIsArchitectThinking(false);
    }
  };

  const handleArchitectKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendArchitectMessage();
    }
  };

  // Auto-scroll del panel arquitecto
  useEffect(() => {
    if (architectScrollRef.current) {
      architectScrollRef.current.scrollTop = architectScrollRef.current.scrollHeight;
    }
  }, [architectMessages, isArchitectThinking]);

  const handleSimulationKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendSimulationMessage();
    }
  };

  // Auto-scroll para simulación
  useEffect(() => {
    if (simulationScrollRef.current) {
      simulationScrollRef.current.scrollTop = simulationScrollRef.current.scrollHeight;
    }
  }, [simulationMessages, isSimulating]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

      {/* ── Panel izquierdo: Prompt + Historial ── */}
      <div className="xl:col-span-2 flex flex-col gap-4">

        {/* Prompt actual */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 grid place-items-center">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Reglas Actuales</p>
                <p className="text-[10px] text-muted-foreground">Prompt activo de SEKA</p>
              </div>
            </div>
            {previousPrompt && (
              <button
                onClick={() => setShowDiff(!showDiff)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  showDiff
                    ? "bg-violet-500/10 border-violet-500/30 text-violet-500"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {showDiff ? "Ocultar diff" : "Ver cambios"}
              </button>
            )}
          </div>

          <div className="relative bg-[#0d0d0f] flex-1">
            <div ref={promptPanelRef} className="overflow-y-auto max-h-[400px] p-4 scrollbar-thin">
              {showDiff && patchInfo ? (
                renderPatch(currentPrompt, patchInfo)
              ) : (
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-zinc-400">
                  {currentPrompt}
                </pre>
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0d0d0f] to-transparent pointer-events-none" />
          </div>
        </div>

        {/* Historial de versiones */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setShowDbHistory(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 grid place-items-center">
                <History className="h-4 w-4" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold leading-tight">Historial de Versiones</p>
                <p className="text-[10px] text-muted-foreground">{dbHistory.length} versión{dbHistory.length !== 1 ? "es" : ""} guardada{dbHistory.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dbHistory.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  {dbHistory.length}
                </span>
              )}
              {showDbHistory ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {showDbHistory && (
            <div className="border-t border-border">
              {dbHistory.length === 0 ? (
                <div className="flex items-center gap-3 p-5 text-muted-foreground">
                  <Save className="h-4 w-4 shrink-0" />
                  <p className="text-xs">Sin versiones guardadas aún. Los cambios aprobados aparecerán aquí.</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {dbHistory.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group">
                      <div className={`mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        entry.change_type === "full_replace"
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : entry.change_type === "restore"
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      }`}>
                        {entry.change_type === "full_replace" ? "Reemplazo" : entry.change_type === "restore" ? "Restore" : "Edición"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium line-clamp-2 leading-snug">{entry.summary}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(entry.created_at).toLocaleString()} · {entry.changed_by}
                        </p>
                      </div>
                      {isSuperadmin && (
                        <button
                          onClick={() => handleRestore(entry)}
                          disabled={restoring === entry.id}
                          title="Restaurar esta versión"
                          className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-violet-500/10 text-muted-foreground hover:text-violet-500 transition-all disabled:opacity-50"
                        >
                          {restoring === entry.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!isSuperadmin && (
                <div className="flex items-center gap-2 px-5 py-3 bg-amber-500/5 border-t border-amber-500/10">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">Solo el Superadmin puede restaurar versiones.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: Chat con Tabs para modo Train/Simulate ── */}
      <div className="xl:col-span-3 rounded-2xl border border-border bg-card flex flex-col overflow-hidden" style={{ minHeight: "600px" }}>

        {/* Header con Toggle de Modo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-violet-500/5 to-indigo-500/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center shadow-lg shadow-violet-500/20">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">SEKA — {mode === "train" ? "Modo Admin" : "Simulación"}</p>
              <p className="text-[11px] text-muted-foreground">
                {mode === "train" ? "Chat de Entrenamiento · Gemini 3.1 Flash Lite" : "Cliente vs Agente · Gemini 3.1 Flash Lite"}
              </p>
            </div>
          </div>
          
          {/* Toggle de Modo */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            <button
              onClick={() => setMode("train")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "train"
                  ? "bg-violet-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Entrenar
            </button>
            <button
              onClick={() => setMode("simulate")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "simulate"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Play className="h-3.5 w-3.5" />
              Simular
            </button>
          </div>
        </div>

        {mode === "train" ? (
          /* ── MODO ENTRENAMIENTO ── */
          <>
            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-4">
                  <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 grid place-items-center">
                    <Bot className="h-8 w-8 text-violet-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-base">Hola, Administrador</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                      {isSuperadmin
                        ? "Dime cómo quieres que SEKA se comporte y lo aplico."
                        : "Puedes ver el prompt activo. Solo el Superadmin puede modificarlo."}
                    </p>
                  </div>
                  {isSuperadmin && (
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {["Sé más casual y directo", "No hables de precios", "Haz un autodiagnóstico"].map(s => (
                        <button
                          key={s}
                          onClick={() => setInput(s)}
                          className="text-xs px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 text-violet-500 hover:bg-violet-500/10 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`h-8 w-8 rounded-2xl flex-shrink-0 grid place-items-center text-xs font-bold ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm shadow-violet-500/20"
                      : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                  }`}>
                    {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white px-4 py-3 rounded-tr-sm shadow-sm shadow-violet-500/20"
                      : "bg-muted/60 border border-border px-4 py-3 rounded-tl-sm"
                  }`}>
                    {msg.attachment && (
                      <div className={`flex items-center gap-2 p-2 mb-2 rounded-lg text-xs ${
                        msg.role === "user" ? "bg-white/15" : "bg-muted border border-border"
                      }`}>
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate max-w-[160px]">{msg.attachment.name}</span>
                      </div>
                    )}
                    <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 flex-shrink-0 grid place-items-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-muted/60 border border-border flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs text-muted-foreground">SEKA está procesando...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card/50">
          {!isSuperadmin ? (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">Solo el <strong>Superadmin</strong> puede enviar instrucciones a SEKA.</p>
            </div>
          ) : (
            <form onSubmit={sendMessage} className="flex flex-col gap-2">
              {/* Botón de aplicar cambio — aparece cuando SEKA propone algo */}
              {pendingApproval && !isLoading && (
                <button
                  type="button"
                  onClick={() => sendMessage(undefined, "aplique")}
                  className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 hover:opacity-90 active:scale-[0.98] transition-all animate-pulse"
                >
                  <CheckCheck className="h-5 w-5" />
                  Aplicar cambio propuesto
                </button>
              )}
              {attachedFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/5 border border-violet-500/20 rounded-xl text-xs">
                  <FileText className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  <span className="truncate flex-1 text-violet-500 font-medium">{attachedFile.name}</span>
                  <button type="button" onClick={() => setAttachedFile(null)} className="p-0.5 hover:bg-violet-500/20 rounded-full text-violet-500 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 p-1.5 rounded-2xl border border-border bg-background focus-within:border-violet-500/50 focus-within:ring-1 focus-within:ring-violet-500/20 transition-all">
                <input type="file" ref={fileInputRef} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.md,.doc,.docx,.mp4,.mov,.avi,.mp3,.wav,.m4a,.ogg,.json,.xml,.html" onChange={(e) => setAttachedFile(e.target.files?.[0] || null)} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-muted-foreground hover:text-violet-500 hover:bg-violet-500/10 rounded-xl transition-colors shrink-0"
                  title="Adjuntar archivo"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder='Ej: "Sé más casual" o "Agrega una regla para no hablar de precios"'
                  className="flex-1 resize-none bg-transparent py-2 px-1 text-sm focus:outline-none max-h-64 placeholder:text-muted-foreground/60"
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={(!input.trim() && !attachedFile) || isLoading}
                  className="p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-violet-500/30 shrink-0"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground px-1">Enter para enviar · Shift+Enter nueva línea</p>
            </form>
          )}
        </div>
      </>
    ) : (
      /* ── MODO SIMULACIÓN ── */
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 flex-1 min-h-0">
        {/* Panel izquierdo: Simulación Cliente-Agente */}
        <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-emerald-500/5 to-teal-500/5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 grid place-items-center">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">Simulación</p>
                <p className="text-[10px] text-muted-foreground">Tú como Cliente · SEKA como Agente</p>
              </div>
            </div>
            <button
              onClick={async () => {
                if (simulationCaseId) {
                  fetch("/api/admin/agente-ia/simulate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reset: true, case_id: simulationCaseId }),
                  }).catch(() => {});
                }
                setSimulationCaseId(null);
                setSimulationMessages([]);
                setArchitectMessages([]);
              }}
              className="text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Reiniciar
            </button>
          </div>

          <div ref={simulationScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
            {simulationMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3 text-muted-foreground">
                <Play className="h-12 w-12 text-emerald-500/30" />
                <p className="text-sm">Inicia la simulación escribiendo como un cliente</p>
                <p className="text-xs opacity-70">Ej: &quot;Hola, tengo un problema con mi cámara&quot;</p>
              </div>
            )}

            {simulationMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`h-7 w-7 rounded-xl flex-shrink-0 grid place-items-center text-xs font-bold ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white"
                    : "bg-zinc-800 text-zinc-300 border border-zinc-700"
                }`}>
                  {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white px-3 py-2 rounded-tr-sm"
                    : "bg-muted/60 border border-border px-3 py-2 rounded-tl-sm"
                }`}>
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </div>
            ))}

            {isSimulating && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-xl bg-zinc-800 border border-zinc-700 grid place-items-center">
                  <Bot className="h-3 w-3 text-zinc-300" />
                </div>
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-muted/60 border border-border flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-xs text-muted-foreground">SEKA está escribiendo...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card/50">
            <form onSubmit={sendSimulationMessage} className="flex items-end gap-2">
              <textarea
                value={simulationInput}
                onChange={(e) => setSimulationInput(e.target.value)}
                onKeyDown={handleSimulationKeyDown}
                placeholder="Escribe como un cliente..."
                className="flex-1 resize-none bg-transparent py-2 px-3 text-sm focus:outline-none max-h-24 placeholder:text-muted-foreground/60 border border-border rounded-xl focus:border-emerald-500/50"
                rows={1}
              />
              <button
                type="submit"
                disabled={!simulationInput.trim() || isSimulating}
                className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isSimulating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>

        {/* Panel derecho: CHAT con el ARQUITECTO en vivo */}
        <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-violet-500/5 to-indigo-500/5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center">
                <Eye className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold">Análisis en Vivo</p>
                <p className="text-[10px] text-muted-foreground">Arquitecto · auto-crítico</p>
              </div>
            </div>
            <button
              onClick={() => setArchitectMessages([])}
              className="text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Limpiar
            </button>
          </div>

          <div ref={architectScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
            {architectMessages.length === 0 && !isArchitectThinking && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3 text-muted-foreground">
                <Eye className="h-12 w-12 text-violet-500/30" />
                <p className="text-sm">El arquitecto observará en vivo</p>
                <p className="text-xs opacity-70">Comenta tras cada turno y podés dialogar con él</p>
              </div>
            )}

            {architectMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`h-7 w-7 rounded-xl flex-shrink-0 grid place-items-center text-xs font-bold ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white"
                    : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
                }`}>
                  {msg.role === "user" ? "Tú" : <Eye className="h-3 w-3" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-500/10 border border-blue-500/20"
                    : "bg-violet-500/5 border border-violet-500/20"
                }`}>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {isArchitectThinking && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 grid place-items-center">
                  <Eye className="h-3 w-3 text-white" />
                </div>
                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                  <span className="text-xs text-muted-foreground">Analizando...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card/50">
            <form onSubmit={sendArchitectMessage} className="flex items-end gap-2">
              <textarea
                value={architectInput}
                onChange={(e) => setArchitectInput(e.target.value)}
                onKeyDown={handleArchitectKeyDown}
                placeholder="Hablá con el arquitecto: pedile que profundice, debatí su crítica, pedí un cambio..."
                rows={2}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/30"
              />
              <button
                type="submit"
                disabled={!architectInput.trim() || isArchitectThinking}
                className="p-2.5 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isArchitectThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    )}
  </div>
</div>
);
}
