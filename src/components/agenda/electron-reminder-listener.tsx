"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface ElectronReminderProps {
  currentAgentEmail?: string | null;
  currentAgentName?: string | null;
}

// Generador de sonido armónico usando Web Audio API (nativo, sin descargas, sin bloqueos)
function playReminderChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const now = ctx.currentTime;

    // Tono 1: Frecuencia 587.33 Hz (Re5 / D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Tono 2: Frecuencia 880 Hz (La5 / A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.18);
    gain2.gain.setValueAtTime(0.4, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.85);

    // Tono 3: Frecuencia 1174.66 Hz (Re6 / D6 - Campana final suave)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(1174.66, now + 0.35);
    gain3.gain.setValueAtTime(0.35, now + 0.35);
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.35);
    osc3.stop(now + 1.2);
  } catch (err) {
    console.warn("[playReminderChime] Error al sintetizar sonido:", err);
  }
}

export function ElectronReminderListener({
  currentAgentEmail,
  currentAgentName,
}: ElectronReminderProps) {
  const isElectronRef = useRef(false);
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const supabase = createClient();

  useEffect(() => {
    const isElec =
      typeof window !== "undefined" &&
      (Boolean((window as any).electronAPI?.isElectron) ||
        navigator.userAgent.toLowerCase().includes("electron"));

    isElectronRef.current = isElec;
    if (!isElec || !currentAgentEmail) return;

    const myEmail = currentAgentEmail.toLowerCase().trim();

    // 1. Escuchar asignaciones en vivo vía Supabase Realtime
    const channel = supabase.channel("sek_agenda_events");

    channel
      .on("broadcast", { event: "agenda_task_assigned" }, ({ payload }) => {
        const task = payload?.task;
        if (!task) return;

        const assigned = (task.assigned_to || "").toLowerCase().trim();
        const isForMe = assigned === "all" || assigned === myEmail;
        const createdByMe = (task.created_by || "").toLowerCase().trim() === myEmail;

        // Si es para mí y fue creada o asignada por otra persona (o para todo el equipo)
        if (isForMe && (!createdByMe || payload.isNew)) {
          const key = `assigned_task_${task.id}_${task.updated_at || Date.now()}`;
          if (notifiedKeysRef.current.has(key)) return;
          notifiedKeysRef.current.add(key);

          // Alerta Sonora en Electron
          playReminderChime();

          // Alerta Visual nativa en Windows
          const creator = task.created_by_name || "Administrador / Compañero";
          const due = task.due_date ? ` • Límite: ${task.due_date}` : "";
          (window as any).electronAPI?.notificarRecordatorio?.({
            tipo: "tarea_asignada",
            titulo: task.title,
            detalle: `Asignada por: ${creator}${due}\nPrioridad: ${task.priority || "media"}`,
          });
        }
      })
      .on("broadcast", { event: "agenda_event_assigned" }, ({ payload }) => {
        const evt = payload?.event;
        if (!evt) return;

        const assigned = (evt.assigned_to || "").toLowerCase().trim();
        const isForMe = assigned === "all" || assigned === myEmail;
        const createdByMe = (evt.created_by || "").toLowerCase().trim() === myEmail;

        if (isForMe && (!createdByMe || payload.isNew)) {
          const key = `assigned_evt_${evt.id}_${evt.updated_at || Date.now()}`;
          if (notifiedKeysRef.current.has(key)) return;
          notifiedKeysRef.current.add(key);

          // Alerta Sonora en Electron
          playReminderChime();

          // Alerta Visual nativa en Windows
          const creator = evt.created_by_name || "Administrador / Compañero";
          const time = evt.start_time ? ` a las ${evt.start_time}` : "";
          (window as any).electronAPI?.notificarRecordatorio?.({
            tipo: "evento_proximo",
            titulo: evt.title,
            detalle: `Programado por: ${creator}\nFecha: ${evt.date}${time}`,
          });
        }
      })
      .subscribe();

    // 2. Comprobador en segundo plano de tareas y eventos del día (Recordatorios por hora/vencimiento)
    const checkReminders = async () => {
      try {
        const res = await fetch("/api/agenda", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const now = new Date();

        // Formato local YYYY-MM-DD
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
        const currentDay = String(now.getDate()).padStart(2, "0");
        const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;

        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const nowTimeMinutes = currentHours * 60 + currentMinutes;

        // A. Verificar Eventos de hoy
        const events = Array.isArray(data.events) ? data.events : [];
        for (const evt of events) {
          if (evt.status === "cancelled" || evt.status === "completed") continue;
          if (evt.date !== todayStr) continue;

          const assigned = (evt.assigned_to || "").toLowerCase().trim();
          if (assigned !== "all" && assigned !== myEmail) continue;

          if (evt.start_time) {
            const [h, m] = evt.start_time.split(":").map(Number);
            const evtMinutes = h * 60 + m;
            // Alertar si faltan entre 0 y 5 minutos para que empiece
            const diff = evtMinutes - nowTimeMinutes;
            if (diff >= 0 && diff <= 5) {
              const key = `reminder_evt_${evt.id}_${todayStr}`;
              if (!notifiedKeysRef.current.has(key)) {
                notifiedKeysRef.current.add(key);
                playReminderChime();
                (window as any).electronAPI?.notificarRecordatorio?.({
                  tipo: "evento_proximo",
                  titulo: `En ${diff === 0 ? "este momento" : `${diff} min`}: ${evt.title}`,
                  detalle: `Hora: ${evt.start_time}${evt.location ? ` • Lugar: ${evt.location}` : ""}`,
                });
              }
            }
          }
        }

        // B. Verificar Tareas pendientes vencidas o por vencer hoy
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        for (const tsk of tasks) {
          if (tsk.status === "completed") continue;
          if (!tsk.due_date) continue;

          const assigned = (tsk.assigned_to || "").toLowerCase().trim();
          if (assigned !== "all" && assigned !== myEmail) continue;

          // Si vence hoy
          if (tsk.due_date === todayStr) {
            const key = `reminder_task_${tsk.id}_${todayStr}`;
            if (!notifiedKeysRef.current.has(key)) {
              notifiedKeysRef.current.add(key);
              playReminderChime();
              (window as any).electronAPI?.notificarRecordatorio?.({
                tipo: "tarea_vencida",
                titulo: `Recordatorio: ${tsk.title}`,
                detalle: `Tarea pendiente asignada para el día de hoy.\nPrioridad: ${tsk.priority || "media"}`,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[checkReminders error]", e);
      }
    };

    // Ejecutar chequeo al montar y cada 40 segundos
    checkReminders();
    const interval = setInterval(checkReminders, 40000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentAgentEmail, supabase]);

  // Este componente solo orquesta notificaciones y sonido en Electron, no renderiza UI
  return null;
}
