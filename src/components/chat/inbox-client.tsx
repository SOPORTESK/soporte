"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SekCase } from "@/lib/types";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { clienteInfo, asText } from "@/lib/utils";

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
  initialCases, initialSelectedId
}: { initialCases: SekCase[]; initialSelectedId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [cases, setCases] = React.useState<SekCase[]>(initialCases);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId);
  const [unreadTotal, setUnreadTotal] = React.useState(0);
  const supabase = React.useMemo(() => createClient(), []);
  const prevCasesRef = React.useRef<SekCase[]>(initialCases);

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

          /* Detectar mensajes nuevos del cliente */
          const changed = newCases.find(nc => {
            if (String(nc.id) === selectedId) return false;
            const prev = prevCasesRef.current.find(p => String(p.id) === String(nc.id));
            const prevLen = (Array.isArray(prev?.histcliente) ? prev!.histcliente.length : 0);
            const newLen = (Array.isArray(nc.histcliente) ? nc.histcliente.length : 0);
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

  const selected = cases.find(c => String(c.id) === selectedId) || null;

  return (
    <div className="grid h-dvh lg:h-[100dvh] grid-cols-1 md:grid-cols-[340px_1fr] overflow-hidden">
      <ConversationList cases={cases} selectedId={selectedId} onSelect={selectCase} />
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
