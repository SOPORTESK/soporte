"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SekCase, SekHistEntry } from "@/lib/types";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { Inbox as InboxIcon, Crown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { clienteInfo, asText, customerKey } from "@/lib/utils";

/* ── Filtrar casos según el tipo de contenedor ── */
function filterCasesByContainer(cases: SekCase[], containerType: string | undefined, currentAgentEmail: string | null, currentAgentName: string | null): SekCase[] {
  // Smart Inbox: SOLO casos nuevos que la IA está atendiendo (visibles por todos, no editables)
  if (containerType === "smart-inbox") {
    return cases.filter(c => String(c.estado || "").toLowerCase() === "ia_atendiendo");
  }

  // Soporte Avanzado: casos escalados por la IA que aún NO ha tomado ningún agente
  if (containerType === "soporte-avanzado") {
    return cases.filter(c => {
      const estado = String(c.estado || "").toLowerCase();
      return estado === "escalado" && !c.assigned_to;
    });
  }

  // Mi Bandeja de Gestión: todos los casos asignados al agente actual, sin importar su estado
  if (containerType === "mi-gestion") {
    if (!currentAgentEmail) return [];
    return cases.filter(c => c.assigned_to === currentAgentEmail);
  }

  // Bandeja: muestra TODOS los casos (inbox general)
  return cases;
}

/* ── Agrupar casos por cliente (un solo chat por cliente, varios casos dentro) ── */
function mergeGroups(rawCases: SekCase[]): SekCase[] {
  const groups = new Map<string, SekCase[]>();
  for (const c of rawCases) {
    const key = customerKey(c);
    const arr = groups.get(key);
    if (arr) arr.push(c); else groups.set(key, [c]);
  }
  const out: SekCase[] = [];
  groups.forEach((items, key) => {
    /* Ordenar casos por created_at ascendente para historial cronológico */
    const sorted = [...items].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    /* Caso "objetivo" para escrituras: el más reciente abierto, o si no hay, el último */
    const openCases = sorted.filter(c => {
      const e = String(c.estado || "").toLowerCase();
      return e !== "cerrado" && e !== "resuelto";
    });
    const target = openCases[openCases.length - 1] ?? sorted[sorted.length - 1];
    /* Combinar historiales con marcadores de inicio/fin de cada caso */
    const histcliente: SekHistEntry[] = [];
    const histtecnico: SekHistEntry[] = [];
    sorted.forEach((c, idx) => {
      const hc = Array.isArray(c.histcliente) ? c.histcliente : [];
      const ht = Array.isArray(c.histtecnico) ? c.histtecnico : [];
      if (idx > 0) {
        /* Separador entre casos */
        histtecnico.push({
          role: "separator",
          time: c.created_at,
          content: `── Nueva conversación · ${new Date(c.created_at).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" })} ──`,
          author: "",
          _separator: true,
        } as SekHistEntry);
      }
      hc.forEach((e, ei) => histcliente.push({ ...e, _sourceCaseId: c.id, _sourceIndex: ei } as SekHistEntry));
      ht.forEach((e, ei) => histtecnico.push({ ...e, _sourceCaseId: c.id, _sourceIndex: ei } as SekHistEntry));
    });
    /* Estado agregado: abierto si hay alguno abierto, si no, el del último */
    const anyOpen = openCases.length > 0;
    /* Prioridad agregada: máxima */
    const prioOrder: Record<string, number> = { baja: 1, media: 2, alta: 3, urgente: 4 };
    const maxPrio = sorted.reduce<string | null>((acc, c) => {
      const p = String(c.prioridad || "").toLowerCase();
      if (!acc) return p || null;
      return (prioOrder[p] ?? 0) > (prioOrder[acc] ?? 0) ? p : acc;
    }, null);

    const ratings = sorted
      .map(c => {
        try {
          const clientObj = typeof c.cliente === "string" ? JSON.parse(c.cliente) : c.cliente;
          return Number(clientObj?.calificacion_agente);
        } catch (e) { return NaN; }
      })
      .filter(r => !isNaN(r) && r > 0);
    const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null;

    const last = target;
    /* Mejor info de cliente disponible en el grupo: algunos casos (p. ej. creados
       por un mensaje saliente) pueden no tener nombre. Tomamos el primer valor
       no vacío de cada campo recorriendo todos los casos del grupo para no perder
       la identificación del cliente. */
    const bestCliente: Record<string, unknown> =
      typeof target.cliente === "object" && target.cliente ? { ...(target.cliente as Record<string, unknown>) } : {};
    for (const cc of sorted) {
      const co = typeof cc.cliente === "object" && cc.cliente ? (cc.cliente as Record<string, unknown>) : {};
      const ci = clienteInfo(cc.cliente);
      if (!bestCliente.nombre && ci.nombre) bestCliente.nombre = ci.nombre;
      if (!bestCliente.correo && ci.correo) bestCliente.correo = ci.correo;
      if (!bestCliente.cuenta && ci.cuenta) bestCliente.cuenta = ci.cuenta;
      if (!bestCliente.cedula && ci.cedula) bestCliente.cedula = ci.cedula;
      if (!bestCliente.telefono && ci.telefono) bestCliente.telefono = ci.telefono;
      if (!bestCliente.telefono_real && co.telefono_real) bestCliente.telefono_real = co.telefono_real;
    }
    const synthetic: SekCase = {
      ...last,
      id: key,
      cliente: bestCliente as SekCase["cliente"],
      histcliente,
      histtecnico,
      estado: (anyOpen ? (target.estado ?? "abierto") : (last.estado ?? "cerrado")) as SekCase["estado"],
      prioridad: (maxPrio ?? last.prioridad) as SekCase["prioridad"],
      unread_count: sorted.reduce((s, c) => s + (c.unread_count || 0), 0),
      _group: {
        caseIds: sorted.map(c => c.id),
        targetCaseId: target.id,
        targetHisttecnico: Array.isArray(target.histtecnico) ? target.histtecnico : [],
        targetEstado: target.estado ?? null,
        totalCases: sorted.length,
        openCases: openCases.length,
        avgRating,
      },
    };
    out.push(synthetic);
  });
  /* Ordenar grupos por última actividad */
  out.sort((a, b) => {
    const tA = new Date(a.last_message_at || a.updated_at || a.created_at).getTime();
    const tB = new Date(b.last_message_at || b.updated_at || b.created_at).getTime();
    return tB - tA;
  });
  return out;
}

const BASE_TITLE = "Sekunet Chat";

function playNotif() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

function playN2Alert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Tres tonos ascendentes para alerta importante
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch {}
}

function playEscaladoAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Cinco tonos urgentes y repetitivos a mayor volumen
    [880, 660, 880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0.8, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.15);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
  } catch {}
}

export function InboxClient({
  initialCases, initialSelectedId, containerType
}: { initialCases: SekCase[]; initialSelectedId: string | null; containerType?: "inbox" | "smart-inbox" | "soporte-avanzado" | "mi-gestion" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [cases, setCases] = React.useState<SekCase[]>(initialCases);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId);
  const [unreadTotal, setUnreadTotal] = React.useState(0);
  const [agentEmail, setAgentEmail] = React.useState<string | null>(null);
  const [agentName, setAgentName] = React.useState<string | null>(null);
  const [agentRole, setAgentRole] = React.useState<string | null>(null);
  const [godModeEmail, setGodModeEmail] = React.useState<string | null>(null);
  const [godModeName, setGodModeName] = React.useState<string | null>(null);
  const supabase = React.useMemo(() => createClient(), []);
  const prevCasesRef = React.useRef<SekCase[]>(initialCases);

  /* Detectar MODO DIOS desde localStorage */
  React.useEffect(() => {
    if (localStorage.getItem("god_mode_active") === "true") {
      const godEmail = localStorage.getItem("god_mode_target_email");
      const godName = localStorage.getItem("god_mode_target_name");
      if (godEmail) {
        setGodModeEmail(godEmail);
        setGodModeName(godName || godEmail);
        console.log(`[GOD MODE] Actuando como: ${godName || godEmail}`);
      }
    }
  }, []);

  /* Obtener email, nombre y rol del agente actual para filtrar Mi Gestion */
  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data?.user?.email) {
        // Si estamos en MODO DIOS, usar el email del agente objetivo
        const effectiveEmail = godModeEmail || data.user.email;
        setAgentEmail(effectiveEmail);
        // Buscar nombre y rol del agente en config
        const { data: agent } = await supabase
          .from("sek_agent_config")
          .select("nombre,apellido,rol")
          .ilike("email", effectiveEmail)
          .maybeSingle();
        if (agent) {
          const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ");
          setAgentName(fullName);
          setAgentRole(agent.rol);
          console.log(`[Mi Gestion] Agente identificado: ${fullName}, Rol: ${agent.rol}`);
        }
      }
    });
  }, [supabase, godModeEmail]);

  const selectCase = React.useCallback((id: string) => {
    setSelectedId(id);
    // En modo PWA standalone no persistir el chat en la URL para que al reabrir
    // la app siempre muestre la bandeja y no el último chat visitado
    const isPwa = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (!isPwa) {
      const url = new URL(window.location.href);
      url.searchParams.set("c", id);
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [router]);

  const handleCaseDeleted = React.useCallback((id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
    }
    setCases(prev => prev.filter(c => {
      const caseIdStr = String(c.id);
      const matchesId = caseIdStr === id;
      const matchesGroupKey = c._group?.caseIds.some(cid => String(cid) === id);
      const matchesPhoneKey = id.startsWith("tel:") && String(c.customer_phone).includes(id.substring(4));
      return !matchesId && !matchesGroupKey && !matchesPhoneKey;
    }));
  }, [selectedId]);

  /* Casos filtrados según containerType */
  const filteredCases = React.useMemo(() => {
    // Si es Mi Gestion y aún no tenemos datos, confiar en el filtro del servidor (initialCases)
    if (containerType === "mi-gestion" && !agentName && !agentEmail && cases === initialCases) {
      return cases;
    }
    // Si estamos en MODO DIOS, forzar modo "mi-gestion" para ver casos de ese agente
    const effectiveContainer = godModeEmail ? "mi-gestion" : containerType;
    return filterCasesByContainer(cases, effectiveContainer, agentEmail, agentName);
  }, [cases, containerType, agentEmail, agentName, initialCases, godModeEmail]);

  /* Casos agrupados por cliente (un solo chat por cliente, varios casos dentro) */
  const mergedCases = React.useMemo(() => mergeGroups(filteredCases), [filteredCases]);
  const prevMergedRef = React.useRef<SekCase[]>(mergedCases);
  const escaladosPendientes = React.useMemo(() => {
    // Computar desde la lista global "cases" para que el banner aparezca en todas las bandejas (incluyendo Mi Gestión)
    const escalated = cases.filter(c => String(c.estado).toLowerCase() === "escalado");
    return mergeGroups(escalated);
  }, [cases]);

  React.useEffect(() => {
    const source = params.get("source");
    const c = params.get("c");
    const isPwa = source === "pwa" ||
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isPwa && c) {
      // En modo PWA, al abrir siempre volver a la bandeja (no al último chat)
      setSelectedId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("c");
      url.searchParams.delete("source");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    } else if (c) {
      setSelectedId(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [unreadTotal]);

  /* Intervalo: recordar casos escalados pendientes cada 60s */
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (escaladosPendientes.length > 0) {
        playEscaladoAlert();
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [escaladosPendientes.length]);

  React.useEffect(() => {
    const channel = supabase
      .channel("cases-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "sek_cases" },
        async (payload) => {
          const { data } = await supabase
            .from("sek_cases").select("*")
            .neq("canal", "simulator")
            .order("created_at", { ascending: false })
            .limit(500);
          if (!data) return;
          const newCases = data as SekCase[];
          const filteredNewCases = filterCasesByContainer(newCases, containerType, agentEmail, agentName);
          setCases(filteredNewCases);

          /* Detectar mensajes nuevos comparando los GRUPOS de cliente (filtrados) */
          const newMerged = mergeGroups(filteredNewCases);
          /* IGNORAR: eventos DELETE (eliminación de casos) y eventos que no agregan mensajes del cliente */
          if (payload.eventType !== "DELETE") {
            const changed = newMerged.find(ng => {
              if (String(ng.id) === selectedId) return false;
              const prev = prevMergedRef.current.find(p => String(p.id) === String(ng.id));
              const prevLen = (Array.isArray(prev?.histcliente) ? prev!.histcliente.length : 0);
              const newLen = (Array.isArray(ng.histcliente) ? ng.histcliente.length : 0);
              // Solo notificar si realmente hay mensajes NUEVOS del cliente (no reorganización de grupos)
              if (newLen <= prevLen) return false;
              // Verificar que el último mensaje sea realmente nuevo (despues de la última vez)
              const lastMsg = ng.histcliente?.[ng.histcliente.length - 1];
              const prevLastMsg = prev?.histcliente?.[prev?.histcliente?.length - 1];
              // Si el último mensaje cambió, es realmente nuevo
              return lastMsg?.time !== prevLastMsg?.time || lastMsg?.content !== prevLastMsg?.content;
            });

            if (changed) {
              playNotif();
              const ci = clienteInfo(changed.cliente);
              const name = ci.nombre || ci.telefono || asText(changed.title) || "Cliente";
              const hist = Array.isArray(changed.histcliente) ? changed.histcliente : [];
              const last = hist[hist.length - 1];
              // No notificar si el mensaje es muy antiguo (más de 5 minutos) - evita notificaciones fantasma
              const msgTime = last?.time ? new Date(last.time).getTime() : 0;
              const isRecent = (Date.now() - msgTime) < 5 * 60 * 1000;
              if (isRecent) {
                toast.info(`💬 Nuevo mensaje de ${name}`, {
                  description: asText(last?.content).slice(0, 80),
                  action: { label: "Ver", onClick: () => selectCase(String(changed.id)) }
                });
                setUnreadTotal(p => p + 1);
              }
            }
          }

          /* 🔔 Alerta para caso escalado por IA */
          if (payload.eventType === "UPDATE") {
            const updCase = payload.new as SekCase;
            const oldCase2 = payload.old as SekCase;
            const nuevoEstado = String(updCase?.estado).toLowerCase();
            const viejoEstado = String(oldCase2?.estado).toLowerCase();

            if (nuevoEstado === "escalado" && viejoEstado !== "escalado") {
              const ci3 = clienteInfo(updCase.cliente);
              const name3 = ci3.nombre || ci3.telefono || asText(updCase.title) || "Cliente";
              const equipo3 = (updCase.cliente as any)?.equipo || "";
              
              playEscaladoAlert();
              toast.warning(`Nueva conversación: ${name3}`, {
                description: equipo3 ? `Equipo: ${equipo3} · Requiere atención` : "Requiere atención de un agente",
                duration: 30000,
                action: { label: "Atender", onClick: () => selectCase(String(updCase.id)) }
              });
            }
          }

          /* 🔔 Alerta especial para Soporte Avanzado: nuevo caso con etiqueta n2 */
          if (containerType === "soporte-avanzado" && payload.eventType === "UPDATE") {
            const newCase = payload.new as SekCase;
            const oldCase = payload.old as SekCase;
            const newTags = Array.isArray(newCase?.tags) ? newCase.tags : [];
            const oldTags = Array.isArray(oldCase?.tags) ? oldCase.tags : [];
            
            // Verificar si se agregó etiqueta n2
            const hasN2Now = newTags.some((t: string) => t.toLowerCase() === "n2" || t.toLowerCase() === "soporte-n2");
            const hadN2Before = oldTags.some((t: string) => t.toLowerCase() === "n2" || t.toLowerCase() === "soporte-n2");
            
            if (hasN2Now && !hadN2Before) {
              // Alerta visual y sonora especial
              playN2Alert();
              const ci2 = clienteInfo(newCase.cliente);
              const name2 = ci2.nombre || ci2.telefono || asText(newCase.title) || "Cliente";
              
              toast.success("🔧 Nueva solicitud de soporte avanzado", {
                description: `${name2} ha sido etiquetado como N2`,
                duration: 8000,
                action: { 
                  label: "Ver caso", 
                  onClick: () => selectCase(String(newCase.id)) 
                }
              });
            }
          }

          prevCasesRef.current = filteredNewCases;
          prevMergedRef.current = newMerged;
        })
      .subscribe();
    /* Polling de respaldo cada 5s */
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sek_cases").select("*")
        .neq("canal", "simulator")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!data) return;
      const newCases = data as SekCase[];
      const filteredNewCases = filterCasesByContainer(newCases, containerType, agentEmail, agentName);
      const prevTotal = prevCasesRef.current.length;
      const prevMsgs = prevCasesRef.current.reduce((s, c) => s + (c.histcliente?.length || 0), 0);
      const newTotal = filteredNewCases.length;
      const newMsgs = filteredNewCases.reduce((s, c) => s + (c.histcliente?.length || 0), 0);
      if (newTotal !== prevTotal || newMsgs !== prevMsgs) {
        setCases(filteredNewCases);
        prevCasesRef.current = filteredNewCases;
        prevMergedRef.current = mergeGroups(filteredNewCases);
      }
    }, 5000);

    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [supabase, selectedId, containerType, agentEmail, agentName, selectCase]);

  const selected =
    mergedCases.find(c => String(c.id) === selectedId)
    || mergedCases.find(c => c._group?.caseIds.some(cid => String(cid) === selectedId))
    || null;

  const [listWidth, setListWidth] = React.useState<number>(340);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const stored = Number(localStorage.getItem("inbox_list_width") || 340);
    setListWidth(stored);
    setMounted(true);
  }, []);
  const isDragging = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onDragStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newW = Math.min(560, Math.max(240, ev.clientX - rect.left));
      setListWidth(newW);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setListWidth(w => { localStorage.setItem("inbox_list_width", String(w)); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden flex-col">
      {/* Banner de Modo Dios */}
      {godModeEmail && (
        <div className="shrink-0 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white px-4 py-2 flex items-center justify-between z-50 relative">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            <span className="text-sm font-bold">
              MODO DIOS — Actuando como: <strong>{godModeName || godModeEmail}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("god_mode_target_email");
              localStorage.removeItem("god_mode_target_name");
              localStorage.removeItem("god_mode_active");
              window.location.href = "/admin/equipo";
            }}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors"
          >
            Salir
          </button>
        </div>
      )}

      {/* Banner Persistente de Casos Escalados */}
      {escaladosPendientes.length > 0 && (
        <div className="shrink-0 bg-orange-500/10 border-b border-orange-500/20 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 z-40 relative">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                {escaladosPendientes.length === 1 
                  ? `Caso sin atender: ${clienteInfo(escaladosPendientes[0].cliente).nombre || asText(escaladosPendientes[0].title) || "Cliente"}`
                  : `Hay ${escaladosPendientes.length} casos sin atender esperando asignación`}
              </p>
              <p className="text-xs text-orange-600/80 dark:text-orange-400/80">
                {escaladosPendientes.length === 1 
                  ? ((escaladosPendientes[0].cliente as any)?.equipo ? `Equipo: ${(escaladosPendientes[0].cliente as any).equipo}` : "Esperando asignación de agente")
                  : "Varios clientes requieren atención inmediata de un agente"}
              </p>
            </div>
          </div>
          <button
            onClick={() => selectCase(String(escaladosPendientes[0].id))}
            className="shrink-0 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
          >
            {escaladosPendientes.length === 1 ? "Atender caso" : "Ver casos"}
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* Lista: visible en móvil solo cuando NO hay caso seleccionado */}
      <div
        className={`${selected ? "hidden md:flex" : "flex"} md:flex flex-col shrink-0 overflow-hidden w-full md:w-auto`}
        style={{ width: mounted && typeof window !== "undefined" && window.innerWidth >= 768 ? listWidth : undefined }}
      >
        <ConversationList cases={mergedCases} selectedId={selectedId} onSelect={selectCase} agentRole={agentRole || undefined} onDeleteSuccess={handleCaseDeleted} />
      </div>
      {/* Divisor arrastrable — solo visible en md+ */}
      <div
        onMouseDown={onDragStart}
        className="hidden md:flex w-1 shrink-0 cursor-col-resize items-center justify-center group hover:bg-brand-500/30 transition-colors bg-border/50"
        title="Arrastrar para redimensionar"
      >
        <div className="h-8 w-0.5 rounded-full bg-border group-hover:bg-brand-400 transition-colors" />
      </div>
      {/* Panel de chat */}
      <div className={`min-h-0 min-w-0 ${selected ? "flex" : "hidden md:flex"} flex-1 flex-col bg-background`}>
        {selected ? (
          <ChatView key={selected.id} sekCase={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="flex-1 grid place-items-center text-center p-8">
            <div className="max-w-sm">
              <div className="mx-auto h-16 w-16 rounded-full bg-brand-100 dark:bg-brand-900/40 grid place-items-center text-brand-700 dark:text-brand-300 mb-4">
                <InboxIcon className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold">Selecciona una conversación</h2>
              <p className="text-muted-foreground mt-2">Elige un caso de la lista para comenzar a responder.</p>
            </div>
          </div>
        )}
      </div>
      </div>{/* cierre del layout interno */}
    </div>
  );
}
