"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SekCase, SekHistEntry } from "@/lib/types";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { clienteInfo, asText, customerKey } from "@/lib/utils";

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
      hc.forEach(e => histcliente.push(e));
      ht.forEach(e => histtecnico.push(e));
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

    const last = target;
    const synthetic: SekCase = {
      ...last,
      id: key,
      histcliente,
      histtecnico,
      estado: (anyOpen ? "abierto" : (last.estado ?? "cerrado")) as SekCase["estado"],
      prioridad: (maxPrio ?? last.prioridad) as SekCase["prioridad"],
      unread_count: sorted.reduce((s, c) => s + (c.unread_count || 0), 0),
      _group: {
        caseIds: sorted.map(c => c.id),
        targetCaseId: target.id,
        targetHisttecnico: Array.isArray(target.histtecnico) ? target.histtecnico : [],
        targetEstado: target.estado ?? null,
        totalCases: sorted.length,
        openCases: openCases.length,
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

export function InboxClient({
  initialCases, initialSelectedId, containerType
}: { initialCases: SekCase[]; initialSelectedId: string | null; containerType?: "inbox" | "soporte-avanzado" | "mi-gestion" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [cases, setCases] = React.useState<SekCase[]>(initialCases);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId);
  const [unreadTotal, setUnreadTotal] = React.useState(0);
  const supabase = React.useMemo(() => createClient(), []);
  const prevCasesRef = React.useRef<SekCase[]>(initialCases);

  /* Casos agrupados por cliente (un solo chat con varios casos dentro) */
  const mergedCases = React.useMemo(() => mergeGroups(cases), [cases]);
  const prevMergedRef = React.useRef<SekCase[]>(mergedCases);

  React.useEffect(() => {
    const c = params.get("c");
    if (c) setSelectedId(c);
  }, [params]);

  React.useEffect(() => {
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [unreadTotal]);

  React.useEffect(() => {
    const channel = supabase
      .channel("cases-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "sek_cases" },
        async (payload) => {
          const { data } = await supabase
            .from("sek_cases").select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (!data) return;
          const newCases = data as SekCase[];
          setCases(newCases);

          /* Detectar mensajes nuevos comparando los GRUPOS de cliente */
          const newMerged = mergeGroups(newCases);
          const changed = newMerged.find(ng => {
            if (String(ng.id) === selectedId) return false;
            const prev = prevMergedRef.current.find(p => String(p.id) === String(ng.id));
            const prevLen = (Array.isArray(prev?.histcliente) ? prev!.histcliente.length : 0);
            const newLen = (Array.isArray(ng.histcliente) ? ng.histcliente.length : 0);
            return newLen > prevLen;
          });

          if (changed) {
            playNotif();
            const ci = clienteInfo(changed.cliente);
            const name = ci.nombre || ci.telefono || asText(changed.title) || "Cliente";
            const hist = Array.isArray(changed.histcliente) ? changed.histcliente : [];
            const last = hist[hist.length - 1];
            toast.info(`💬 Nuevo mensaje de ${name}`, {
              description: asText(last?.content).slice(0, 80),
              action: { label: "Ver", onClick: () => selectCase(String(changed.id)) }
            });
            setUnreadTotal(p => p + 1);
          }

          prevCasesRef.current = newCases;
          prevMergedRef.current = newMerged;
        })
      .subscribe();
    /* Polling de respaldo cada 5s */
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("sek_cases").select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!data) return;
      const newCases = data as SekCase[];
      const prevTotal = prevCasesRef.current.length;
      const prevMsgs = prevCasesRef.current.reduce((s, c) => s + (c.histcliente?.length || 0), 0);
      const newTotal = newCases.length;
      const newMsgs = newCases.reduce((s, c) => s + (c.histcliente?.length || 0), 0);
      if (newTotal !== prevTotal || newMsgs !== prevMsgs) {
        setCases(newCases);
        prevCasesRef.current = newCases;
      }
    }, 5000);

    return () => { clearInterval(poll); supabase.removeChannel(channel); };
  }, [supabase, selectedId]);

  function selectCase(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("c", id);
    router.replace(url.pathname + url.search, { scroll: false });
  }

  const selected =
    mergedCases.find(c => String(c.id) === selectedId)
    || mergedCases.find(c => c._group?.caseIds.some(cid => String(cid) === selectedId))
    || null;

  return (
    <div className="grid h-dvh lg:h-[100dvh] grid-cols-1 md:grid-cols-[340px_1fr] overflow-hidden">
      <ConversationList cases={mergedCases} selectedId={selectedId} onSelect={selectCase} />
      <div className={`min-h-0 ${selected ? "flex" : "hidden md:flex"} flex-col bg-background`}>
        {selected ? (
          <ChatView sekCase={selected} onBack={() => setSelectedId(null)} />
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
    </div>
  );
}
