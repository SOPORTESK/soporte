import { createClient } from "@/lib/supabase/server";
import { ChannelsClient } from "@/components/admin/channels-client";
import type { SekChannel } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface ChannelStatsSummary {
  total: number;
  active: number;
  resolved: number;
  resolutionRate: number;
  today: number;
  last7Days: number;
  avgResolutionMinutes: number;
}

export type AllChannelsStats = Record<"whatsapp" | "widget" | "messenger" | "telegram" | "instagram", ChannelStatsSummary>;

function computeStatsForChannel(cases: any[], channelKey: string): ChannelStatsSummary {
  const channelCases = cases.filter(c => {
    const rawCanal = String(c.canal || "").toLowerCase().trim();
    if (channelKey === "whatsapp") {
      return !rawCanal || rawCanal === "whatsapp";
    }
    if (channelKey === "widget") {
      return rawCanal === "widget" || rawCanal === "web";
    }
    if (channelKey === "messenger") {
      return rawCanal === "messenger" || rawCanal === "facebook";
    }
    if (channelKey === "telegram") {
      return rawCanal === "telegram";
    }
    if (channelKey === "instagram") {
      return rawCanal === "instagram" || rawCanal === "ig";
    }
    return rawCanal === channelKey;
  });

  const total = channelCases.length;
  const active = channelCases.filter(c => c.estado !== "cerrado" && c.estado !== "resuelto").length;
  const resolved = channelCases.filter(c => c.estado === "cerrado" || c.estado === "resuelto").length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  let today = 0;
  let last7Days = 0;
  let totalResolutionTimeMinutes = 0;
  let casesWithDuration = 0;

  for (const c of channelCases) {
    if (c.created_at) {
      const createdTime = new Date(c.created_at).getTime();
      if (createdTime >= startOfToday) today++;
      if (createdTime >= sevenDaysAgo) last7Days++;

      if (c.estado === "cerrado" || c.estado === "resuelto") {
        const endTime = c.closed_at ? new Date(c.closed_at).getTime() : c.updated_at ? new Date(c.updated_at).getTime() : null;
        if (endTime && endTime > createdTime) {
          const diffMinutes = (endTime - createdTime) / (1000 * 60);
          // Ignorar duraciones atípicas mayores a 7 días
          if (diffMinutes < 7 * 24 * 60) {
            totalResolutionTimeMinutes += diffMinutes;
            casesWithDuration++;
          }
        }
      }
    }
  }

  const avgResolutionMinutes = casesWithDuration > 0 ? Math.round(totalResolutionTimeMinutes / casesWithDuration) : 0;

  return {
    total,
    active,
    resolved,
    resolutionRate,
    today,
    last7Days,
    avgResolutionMinutes,
  };
}

export default async function AdminCanalesPage() {
  const supabase = createClient();

  const [channelsRes, casesRes] = await Promise.all([
    supabase.from("sek_channels").select("*").order("created_at"),
    supabase.from("sek_cases").select("id, canal, estado, created_at, closed_at, updated_at").order("created_at", { ascending: false }).limit(3000),
  ]);

  const rawCases = casesRes.data || [];

  const stats: AllChannelsStats = {
    whatsapp: computeStatsForChannel(rawCases, "whatsapp"),
    widget: computeStatsForChannel(rawCases, "widget"),
    messenger: computeStatsForChannel(rawCases, "messenger"),
    telegram: computeStatsForChannel(rawCases, "telegram"),
    instagram: computeStatsForChannel(rawCases, "instagram"),
  };

  return (
    <ChannelsClient
      channels={((channelsRes.data as any[]) as SekChannel[]) || []}
      stats={stats}
    />
  );
}
