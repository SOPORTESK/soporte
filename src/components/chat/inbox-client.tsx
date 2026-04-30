"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SekCase } from "@/lib/types";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import { Inbox as InboxIcon } from "lucide-react";

export function InboxClient({
  initialCases, initialSelectedId
}: { initialCases: SekCase[]; initialSelectedId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [cases, setCases] = React.useState<SekCase[]>(initialCases);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSelectedId);
  const supabase = React.useMemo(() => createClient(), []);

  React.useEffect(() => {
    const c = params.get("c");
    if (c) setSelectedId(c);
  }, [params]);

  React.useEffect(() => {
    const channel = supabase
      .channel("cases-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "sek_cases" },
        async () => {
          const { data } = await supabase
            .from("sek_cases").select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (data) setCases(data as any);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

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
