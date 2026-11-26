import "@/lib/dns-boost";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CASE_LIST_FIELDS =
  "id,estado,canal,cliente,assigned_to,last_message_at,last_message_preview,unread_count,created_at,updated_at,title,prioridad,tags,customer_phone,es_test,marca,modelo";

const CASE_FULL_FIELDS =
  "id,estado,canal,cliente,assigned_to,customer_phone,created_at,updated_at,last_message_at,last_message_preview,unread_count,histcliente,histtecnico,marca,modelo,problema,resolucion,title";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

const toEpochMs = (v: unknown): number => {
  if (!v) return 0;
  const t = new Date(String(v)).getTime();
  return isNaN(t) ? 0 : t;
};

function computeCasesHash(rows: any[]): string {
  const sorted = [...rows].sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
  return sorted
    .map((r) => {
      const msgSig = (arr: any[]) =>
        Array.isArray(arr)
          ? arr
              .map(
                (m: any) =>
                  `${m?.time || ""}:${String(m?.content || "").length}:${m?.edited ? 1 : 0}:${m?.deleted ? 1 : 0}:${m?.read_at || ""}:${m?.pinned ? 1 : 0}:${m?.starred ? 1 : 0}:${Array.isArray(m?.reactions) ? m.reactions.length : 0}`
              )
              .join(",")
          : "";
      const hc = Array.isArray(r?.histcliente) ? r.histcliente : [];
      const ht = Array.isArray(r?.histtecnico) ? r.histtecnico : [];
      return [
        r?.id || "",
        toEpochMs(r?.updated_at),
        toEpochMs(r?.last_message_at),
        r?.estado || "",
        r?.assigned_to || "",
        r?.marca || "",
        r?.modelo || "",
        r?.title || "",
        String(r?.last_message_preview || "").slice(0, 60),
        hc.length,
        ht.length,
        msgSig(hc),
        msgSig(ht),
      ].join("|");
    })
    .join("||");
}

async function fetchFullMetaList(serviceClient: any, agentEmail?: string, isAdmin?: boolean) {
  if (agentEmail && isAdmin) {
    const [mineRes, othersRes] = await Promise.all([
      serviceClient
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .neq("canal", "simulator")
        .neq("es_test", true)
        .eq("assigned_to", agentEmail)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(80),
      serviceClient
        .from("sek_cases")
        .select(CASE_LIST_FIELDS)
        .neq("canal", "simulator")
        .neq("es_test", true)
        .not("assigned_to", "is", null)
        .neq("assigned_to", agentEmail)
        .neq("estado", "cerrado")
        .neq("estado", "resuelto")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return [...(mineRes.data || []), ...(othersRes.data || [])];
  }

  let query = serviceClient
    .from("sek_cases")
    .select(CASE_LIST_FIELDS)
    .neq("canal", "simulator")
    .neq("es_test", true);
  if (agentEmail && !isAdmin) {
    query = query.eq("assigned_to", agentEmail);
  }
  const { data, error } = await query
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return data || [];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const serviceClient = createServiceClient();
    const { data: agentCfg } = await serviceClient
      .from("sek_agent_config")
      .select("email")
      .ilike("email", user.email)
      .maybeSingle();
    if (!agentCfg) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") || "list";
    const force = searchParams.get("force") === "1";

    if (mode === "list") {
      const since = searchParams.get("since") || "";
      const agent = searchParams.get("agent") || undefined;
      const isAdmin = searchParams.get("isAdmin") === "1";

      const { data: latestRow } = await serviceClient
        .from("sek_cases")
        .select("updated_at,last_message_at")
        .neq("canal", "simulator")
        .neq("es_test", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const maxUpdatedAt = String(latestRow?.updated_at || "");
      const maxMs = toEpochMs(maxUpdatedAt);
      const sinceMs = toEpochMs(since);

      if (!force && since && sinceMs > 0 && maxMs > 0 && maxMs <= sinceMs) {
        return NextResponse.json(
          { ok: true, changed: false, maxUpdatedAt },
          { headers: NO_STORE_HEADERS }
        );
      }

      let isFull = false;
      let cases: any[] = [];

      if (!force && since && sinceMs > 0) {
        const sinceIso = new Date(Math.max(0, sinceMs - 10_000)).toISOString();
        const { data: deltaRows, error: deltaErr } = await serviceClient
          .from("sek_cases")
          .select(CASE_LIST_FIELDS)
          .neq("canal", "simulator")
          .neq("es_test", true)
          .gte("updated_at", sinceIso)
          .order("updated_at", { ascending: false })
          .limit(80);

        if (!deltaErr && Array.isArray(deltaRows) && deltaRows.length < 80) {
          cases = deltaRows;
        } else {
          isFull = true;
          cases = await fetchFullMetaList(serviceClient, agent, isAdmin);
        }
      } else {
        isFull = true;
        cases = await fetchFullMetaList(serviceClient, agent, isAdmin);
      }

      let bestMaxUpdatedAt = maxUpdatedAt;
      let bestMaxMs = maxMs;
      for (const c of cases) {
        const ms = toEpochMs(c?.updated_at);
        if (ms > bestMaxMs && c?.updated_at) {
          bestMaxMs = ms;
          bestMaxUpdatedAt = String(c.updated_at);
        }
      }

      return NextResponse.json(
        { ok: true, changed: true, isFull, maxUpdatedAt: bestMaxUpdatedAt, cases },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (mode === "case") {
      const rawIds = searchParams.get("ids") || "";
      const phoneDigits = String(searchParams.get("phone") || "").replace(/[^0-9]/g, "");
      const prevHash = searchParams.get("hash") || "";

      const idSet = new Set(
        rawIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 6)
      );

      if (phoneDigits.length >= 8) {
        const { data: siblings } = await serviceClient
          .from("sek_cases")
          .select("id")
          .ilike("customer_phone", `%${phoneDigits.slice(-8)}%`)
          .neq("canal", "simulator")
          .neq("es_test", true)
          .not("estado", "in", "(cerrado,resuelto)")
          .order("created_at", { ascending: false })
          .limit(5);
        for (const s of siblings || []) {
          if (idSet.size >= 6) break;
          if (s?.id) idSet.add(String(s.id));
        }
      }

      const targetIds = Array.from(idSet).slice(0, 6);
      if (targetIds.length === 0) {
        return NextResponse.json(
          { ok: true, changed: false, hash: prevHash, cases: [] },
          { headers: NO_STORE_HEADERS }
        );
      }

      const { data: rows, error } = await serviceClient
        .from("sek_cases")
        .select(CASE_FULL_FIELDS)
        .in("id", targetIds);
      if (error) throw error;

      const cases = rows || [];
      const contentHash = computeCasesHash(cases);
      if (!force && prevHash && prevHash === contentHash) {
        return NextResponse.json(
          { ok: true, changed: false, hash: contentHash },
          { headers: NO_STORE_HEADERS }
        );
      }

      return NextResponse.json(
        { ok: true, changed: true, hash: contentHash, cases },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400, headers: NO_STORE_HEADERS });
  } catch (err: any) {
    console.error("[live-sync] error:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Error interno" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
