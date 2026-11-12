export const WA_OUTBOX_KEY = "wa_outbox_queue";

export interface WaOutboxItem {
  id: string;
  action?: "send" | "delete";
  case_id: string;
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  deletePayload?: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
    participant?: string;
  };
  quoted?: {
    key: {
      id: string;
      remoteJid: string;
      fromMe: boolean;
      participant?: string;
    };
    message: {
      conversation: string;
    };
  };
  matchContent?: string;
  created_at: string;
  status: "pending" | "processing" | "failed";
  attempts: number;
  last_error?: string;
}

export function generateQueuedMessageId(): string {
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueWaOutbox(
  supabase: any,
  item: WaOutboxItem
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data: row } = await supabase
        .from("sek_app_settings")
        .select("value")
        .eq("key", WA_OUTBOX_KEY)
        .maybeSingle();

      let queue: WaOutboxItem[] = [];
      if (row?.value) {
        try {
          const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          if (Array.isArray(parsed)) queue = parsed;
        } catch {
          queue = [];
        }
      }

      const nowMs = Date.now();
      const MAX_AGE_MS = 48 * 60 * 60 * 1000;
      queue = queue.filter((q) => {
        if (!q || !q.id) return false;
        if (q.id === item.id) return false;
        const t = q.created_at ? new Date(q.created_at).getTime() : 0;
        if (t && nowMs - t > MAX_AGE_MS) return false;
        return true;
      });

      queue.push(item);
      if (queue.length > 200) {
        queue = queue.slice(-200);
      }

      const { error } = await supabase
        .from("sek_app_settings")
        .upsert(
          {
            key: WA_OUTBOX_KEY,
            value: JSON.stringify(queue),
            iv: "none",
            tag: "none",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (!error) {
        return true;
      }
      console.error(`[wa-outbox] Error encolando mensaje (intento ${attempt}/2):`, error.message);
    } catch (e: any) {
      console.error(`[wa-outbox] Excepción encolando mensaje (intento ${attempt}/2):`, e?.message);
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return false;
}

export async function removeFromWaOutbox(
  supabase: any,
  id: string
): Promise<boolean> {
  if (!id) return false;
  try {
    const { data: row } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", WA_OUTBOX_KEY)
      .maybeSingle();

    if (!row?.value) return false;
    const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    if (!Array.isArray(parsed)) return false;

    const filtered = parsed.filter((q: any) => q && q.id !== id);
    if (filtered.length === parsed.length) return false;

    const { error } = await supabase
      .from("sek_app_settings")
      .upsert(
        {
          key: WA_OUTBOX_KEY,
          value: JSON.stringify(filtered),
          iv: "none",
          tag: "none",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    return !error;
  } catch {
    return false;
  }
}
