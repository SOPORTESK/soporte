"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Mic,
  Square,
  Play,
  Pause,
  FileText,
  Download,
  Image as ImageIcon,
  X,
  Maximize2,
  Minimize2,
  Loader2,
  Users,
  Check,
  CheckCheck,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { InternalMessage } from "@/lib/internal-chat-types";

interface InternalChatViewProps {
  channelId: string;
  channelName: string;
  channelAvatar?: string | null;
  channelStatus?: string | null;
  isGroup?: boolean;
  currentUserEmail: string;
  currentUserName: string;
  onBack: () => void;
  onNewMessageSent?: (msg: InternalMessage) => void;
}

export function InternalChatView({
  channelId,
  channelName,
  channelAvatar,
  channelStatus,
  isGroup = false,
  currentUserEmail,
  currentUserName,
  onBack,
  onNewMessageSent,
}: InternalChatViewProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type?: string; name?: string } | null>(null);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Cargar mensajes iniciales
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(`/api/internal-chat?channelId=${encodeURIComponent(channelId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.success && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setTimeout(() => scrollToBottom("auto"), 100);
        }
      })
      .catch((err) => console.error("Error cargando chat interno:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [channelId]);

  // Escuchar mensajes en tiempo real vía Supabase Broadcast
  useEffect(() => {
    const channel = supabase.channel("sek_internal_chat");

    channel
      .on("broadcast", { event: "new_internal_message" }, ({ payload }) => {
        const msg = payload as InternalMessage;
        if (msg && msg.channelId === channelId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          setTimeout(() => scrollToBottom("smooth"), 100);
          // Marcar como leído
          fetch("/api/internal-chat/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId }),
          }).catch(() => {});
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  // Envío de mensaje de texto
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/internal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar");

      const saved: InternalMessage = data.message;
      setMessages((prev) => [...prev, saved]);
      setDraft("");
      setTimeout(() => scrollToBottom("smooth"), 80);

      // Notificar a otros clientes vía Broadcast
      const channel = supabase.channel("sek_internal_chat");
      channel.send({
        type: "broadcast",
        event: "new_internal_message",
        payload: saved,
      });

      if (onNewMessageSent) onNewMessageSent(saved);
    } catch (err: any) {
      toast.error(err.message || "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  // Subida de archivos (imágenes, documentos, videos)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const toastId = toast.loading(`Subiendo ${file.name}...`);
    try {
      const fileExt = file.name.split(".").pop() || "bin";
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `internal-chat/${channelId}/${Date.now()}_${cleanName}`;

      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });

      if (upErr) throw upErr;

      const { data: pubData } = supabase.storage.from("attachments").getPublicUrl(path);
      const mediaUrl = pubData?.publicUrl;

      if (!mediaUrl) throw new Error("No se obtuvo URL del archivo");

      const res = await fetch("/api/internal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content: "",
          mediaUrl,
          mediaType: file.type || "application/octet-stream",
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar adjunto");

      const saved: InternalMessage = data.message;
      setMessages((prev) => [...prev, saved]);
      setTimeout(() => scrollToBottom("smooth"), 80);

      const channel = supabase.channel("sek_internal_chat");
      channel.send({
        type: "broadcast",
        event: "new_internal_message",
        payload: saved,
      });

      if (onNewMessageSent) onNewMessageSent(saved);
      toast.success("Archivo enviado con éxito", { id: toastId });
    } catch (err: any) {
      console.error("Error subiendo archivo:", err);
      toast.error(err.message || "Error al subir archivo", { id: toastId });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Grabar Nota de Voz
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        stream.getTracks().forEach((track) => track.stop());
        if (audioBlob.size > 2000) {
          setRecordedAudioBlob(audioBlob);
          const previewUrl = URL.createObjectURL(audioBlob);
          setAudioPreview(previewUrl);
        }
      };

      mr.start(250);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    setAudioPreview(null);
    setRecordedAudioBlob(null);
    setRecordingTime(0);
  };

  const sendAudioNote = async () => {
    if (!recordedAudioBlob) return;
    setUploadingFile(true);
    const toastId = toast.loading("Enviando nota de voz...");

    try {
      const fileName = `nota_voz_${Date.now()}.webm`;
      const path = `internal-chat/${channelId}/${fileName}`;

      const { error: upErr } = await supabase.storage
        .from("attachments")
        .upload(path, recordedAudioBlob, {
          upsert: true,
          contentType: "audio/webm",
        });

      if (upErr) throw upErr;

      const { data: pubData } = supabase.storage.from("attachments").getPublicUrl(path);
      const mediaUrl = pubData?.publicUrl;

      if (!mediaUrl) throw new Error("No se obtuvo URL de audio");

      const res = await fetch("/api/internal-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          content: "",
          mediaUrl,
          mediaType: "audio/webm",
          fileName: "Nota de voz",
          fileSize: recordedAudioBlob.size,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar nota de voz");

      const saved: InternalMessage = data.message;
      setMessages((prev) => [...prev, saved]);
      cancelRecording();
      setTimeout(() => scrollToBottom("smooth"), 80);

      const channel = supabase.channel("sek_internal_chat");
      channel.send({
        type: "broadcast",
        event: "new_internal_message",
        payload: saved,
      });

      if (onNewMessageSent) onNewMessageSent(saved);
      toast.success("Nota de voz enviada", { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Error al enviar nota de voz", { id: toastId });
    } finally {
      setUploadingFile(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-card relative overflow-hidden">
      {/* ── CABECERA DEL CHAT ── */}
      <div className="p-3 bg-muted/40 border-b border-border/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Volver a la lista de equipo"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="relative shrink-0">
            {isGroup ? (
              <div className="h-8 w-8 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 grid place-items-center">
                <Users className="h-4 w-4" />
              </div>
            ) : channelAvatar ? (
              <img
                src={channelAvatar}
                alt={channelName}
                className="h-8 w-8 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs border border-border text-foreground">
                {channelName.slice(0, 2).toUpperCase()}
              </div>
            )}
            {!isGroup && channelStatus && (
              <span
                className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${
                  channelStatus === "online"
                    ? "bg-emerald-500"
                    : channelStatus === "away"
                    ? "bg-amber-400"
                    : channelStatus === "busy"
                    ? "bg-rose-500"
                    : "bg-gray-400"
                }`}
              />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-black text-foreground truncate leading-tight">
              {channelName}
            </h3>
            <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
              {isGroup
                ? "Canal de equipo · Todos los técnicos"
                : channelStatus === "online"
                ? "En línea"
                : channelStatus === "away"
                ? "Ausente"
                : channelStatus === "busy"
                ? "Ocupado"
                : "Mensaje directo"}
            </p>
          </div>
        </div>
      </div>

      {/* ── CUERPO DE MENSAJES (SCROLL) ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 bg-background/50">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            <span className="text-xs">Cargando mensajes...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground px-4">
            <div className="p-3 rounded-2xl bg-muted/40 border border-border/60">
              <Users className="h-6 w-6 text-violet-400" />
            </div>
            <p className="text-xs font-bold text-foreground">Inicia la conversación</p>
            <p className="text-[11px] text-muted-foreground max-w-xs">
              Envía mensajes, notas de voz, imágenes o documentos de forma directa y segura.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderEmail.toLowerCase() === currentUserEmail.toLowerCase();
            const isAudio = m.mediaType?.startsWith("audio/") || m.fileName?.endsWith(".webm") || m.fileName === "Nota de voz";
            const isImage = m.mediaType?.startsWith("image/");
            const isVideo = m.mediaType?.startsWith("video/");

            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"} space-y-1 animate-in fade-in duration-150`}
              >
                {!isMe && isGroup && (
                  <span className="text-[10px] font-bold text-violet-400 pl-1">
                    {m.senderName}
                  </span>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl p-2.5 text-xs shadow-xs space-y-1.5 ${
                    isMe
                      ? "bg-violet-600 text-white rounded-br-xs"
                      : "bg-muted/70 border border-border/70 text-foreground rounded-bl-xs"
                  }`}
                >
                  {/* IMAGEN ADJUNTA */}
                  {isImage && m.mediaUrl && (
                    <div
                      onClick={() => setPreviewMedia({ url: m.mediaUrl!, type: "image", name: m.fileName || "Foto" })}
                      className="cursor-pointer overflow-hidden rounded-xl border border-black/10 max-h-48 group relative"
                    >
                      <img
                        src={m.mediaUrl}
                        alt="Adjunto"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  )}

                  {/* VIDEO ADJUNTO */}
                  {isVideo && m.mediaUrl && (
                    <video
                      src={m.mediaUrl}
                      controls
                      className="w-full rounded-xl max-h-48 bg-black/50"
                    />
                  )}

                  {/* NOTA DE VOZ / AUDIO PLAYER */}
                  {isAudio && m.mediaUrl && (
                    <InternalAudioPlayer url={m.mediaUrl} isMe={isMe} />
                  )}

                  {/* DOCUMENTO / ARCHIVO ADJUNTO */}
                  {m.mediaUrl && !isImage && !isVideo && !isAudio && (
                    <a
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                        isMe
                          ? "bg-white/10 hover:bg-white/20 border-white/20 text-white"
                          : "bg-background hover:bg-muted/80 border-border text-foreground"
                      }`}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-violet-400" />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[11px] truncate leading-tight">
                          {m.fileName || "Documento adjunto"}
                        </p>
                        {m.fileSize && (
                          <p className="text-[9px] opacity-75 leading-tight">
                            {(m.fileSize / 1024).toFixed(0)} KB
                          </p>
                        )}
                      </div>
                      <Download className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    </a>
                  )}

                  {/* TEXTO DEL MENSAJE */}
                  {m.content && (
                    <p className="leading-relaxed whitespace-pre-wrap break-words text-xs">
                      {m.content}
                    </p>
                  )}

                  {/* HORA Y LEÍDO */}
                  <div
                    className={`flex items-center justify-end gap-1 text-[9px] pt-0.5 ${
                      isMe ? "text-white/70" : "text-muted-foreground"
                    }`}
                  >
                    <span>{formatTime(m.createdAt)}</span>
                    {isMe && (
                      <CheckCheck
                        className={`h-3 w-3 ${
                          m.readBy && m.readBy.length > 1 ? "text-sky-300" : "text-white/60"
                        }`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── BARRA DE GRABACIÓN DE AUDIO (SI ESTÁ GRABANDO) ── */}
      {isRecording && (
        <div className="p-3 bg-rose-500/10 border-t border-rose-500/30 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-rose-500">
              {Math.floor(recordingTime / 60)}:
              {String(recordingTime % 60).padStart(2, "0")}
            </span>
            <span className="text-[11px] text-rose-400 font-semibold hidden sm:inline">
              Grabando nota de voz...
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-1.5 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-bold transition-colors"
              title="Cancelar grabación"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Finalizar</span>
            </button>
          </div>
        </div>
      )}

      {/* ── PREVIEW DE AUDIO GRABADO ANTES DE ENVIAR ── */}
      {audioPreview && !isRecording && (
        <div className="p-3 bg-muted/60 border-t border-border/80 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Volume2 className="h-4 w-4 text-violet-500 shrink-0" />
            <audio src={audioPreview} controls className="h-8 max-w-[200px]" />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cancelRecording}
              disabled={uploadingFile}
              className="p-2 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              title="Descartar audio"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={sendAudioNote}
              disabled={uploadingFile}
              className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm shadow-violet-600/30 transition-all"
            >
              {uploadingFile ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Enviar Audio</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── BARRA DE ENTRADA INFERIOR ── */}
      {!isRecording && !audioPreview && (
        <form
          onSubmit={handleSendMessage}
          className="p-2.5 bg-card border-t border-border/60 flex items-center gap-1.5 shrink-0"
        >
          {/* Input oculto para adjuntar archivo */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.xml,.xlsx,.xls,.doc,.docx,.txt"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-50"
            title="Adjuntar archivo, foto o documento"
          >
            {uploadingFile ? (
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Escribe a ${channelName}...`}
            className="flex-1 bg-muted/40 border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
          />

          <button
            type="button"
            onClick={startRecording}
            disabled={uploadingFile || isRecording}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Grabar nota de voz"
          >
            <Mic className="h-4 w-4" />
          </button>

          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-600/30 transition-all disabled:opacity-40 disabled:hover:bg-violet-600 shrink-0"
            title="Enviar mensaje"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      )}

      {/* ── MODAL LIGHTBOX DE IMÁGENES ── */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewMedia(null)}
        >
          <div
            className="relative max-w-2xl max-h-[85vh] bg-card rounded-2xl overflow-hidden shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setPreviewMedia(null)}
                className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black grid place-items-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={previewMedia.url}
              alt={previewMedia.name || "Preview"}
              className="max-h-[80vh] w-auto object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── REPRODUCTOR DE AUDIO ELEGANTE ──
function InternalAudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onTime = () => setCurrentTime(a.currentTime);
    const onLoaded = () => {
      if (isFinite(a.duration)) setDuration(a.duration);
    };

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);

    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play().catch(() => {});
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const time = Number(e.target.value);
    a.currentTime = time;
    setCurrentTime(time);
  };

  const fmt = (sec: number) => {
    if (!isFinite(sec) || isNaN(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-xl min-w-[200px] ${
        isMe ? "bg-white/10" : "bg-card/70 border border-border/50"
      }`}
    >
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        className={`h-7 w-7 rounded-lg grid place-items-center shrink-0 transition-transform active:scale-95 ${
          isMe
            ? "bg-white text-violet-600 hover:bg-white/90"
            : "bg-violet-600 text-white hover:bg-violet-500"
        }`}
      >
        {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-black/20 rounded-lg appearance-none cursor-pointer accent-violet-400"
        />
        <div
          className={`flex items-center justify-between text-[9px] font-mono leading-none ${
            isMe ? "text-white/80" : "text-muted-foreground"
          }`}
        >
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}
