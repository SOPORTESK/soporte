import { createServiceClient } from "@/lib/supabase/service";
import type { InternalMessage, InternalConversationSummary } from "@/lib/internal-chat-types";

const SETTING_PREFIX = "internal_chat_channel_";
const RECENT_CHATS_KEY = "internal_chat_active_channels";

export function getChannelSettingKey(channelId: string): string {
  // sanitizar key para evitar colisiones
  return `${SETTING_PREFIX}${channelId.toLowerCase().replace(/[^a-z0-9_@.-]/g, "_")}`;
}

export function buildDirectChannelId(email1: string, email2: string): string {
  const sorted = [email1.trim().toLowerCase(), email2.trim().toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

export async function getChannelMessages(channelId: string): Promise<InternalMessage[]> {
  try {
    const supabase = createServiceClient();
    const key = getChannelSettingKey(channelId);
    const { data, error } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error || !data?.value) {
      return [];
    }

    const parsed = JSON.parse(data.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[getChannelMessages] Error loading channel ${channelId}:`, err);
    return [];
  }
}

export async function saveChannelMessage(
  channelId: string,
  message: InternalMessage
): Promise<InternalMessage> {
  const supabase = createServiceClient();
  const key = getChannelSettingKey(channelId);
  const existing = await getChannelMessages(channelId);

  // Mantener los últimos 300 mensajes por canal para rendimiento ágil
  const updated = [...existing, message].slice(-300);

  await supabase.from("sek_app_settings").upsert(
    {
      key,
      value: JSON.stringify(updated),
      iv: "none",
      tag: "none",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  // Registrar canal activo si no está registrado
  try {
    const { data: activeData } = await supabase
      .from("sek_app_settings")
      .select("value")
      .eq("key", RECENT_CHATS_KEY)
      .maybeSingle();

    let channels: string[] = [];
    if (activeData?.value) {
      channels = JSON.parse(activeData.value);
    }
    if (!channels.includes(channelId)) {
      channels.push(channelId);
      await supabase.from("sek_app_settings").upsert(
        {
          key: RECENT_CHATS_KEY,
          value: JSON.stringify(channels),
          iv: "none",
          tag: "none",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );
    }
  } catch {}

  return message;
}

export async function markChannelMessagesAsRead(
  channelId: string,
  readerEmail: string
): Promise<void> {
  const normalizedReader = readerEmail.trim().toLowerCase();
  const supabase = createServiceClient();
  const key = getChannelSettingKey(channelId);
  const existing = await getChannelMessages(channelId);

  let hasChanges = false;
  const updated = existing.map((msg) => {
    if (!msg.readBy) msg.readBy = [];
    if (!msg.readBy.map((e) => e.toLowerCase()).includes(normalizedReader)) {
      hasChanges = true;
      return {
        ...msg,
        readBy: [...msg.readBy, normalizedReader],
      };
    }
    return msg;
  });

  if (hasChanges) {
    await supabase.from("sek_app_settings").upsert(
      {
        key,
        value: JSON.stringify(updated),
        iv: "none",
        tag: "none",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  }
}

export async function getConversationsSummary(
  userEmail: string,
  allAgents: Array<{ email: string; nombre: string | null; apellido: string | null; avatar_url?: string | null }>
): Promise<InternalConversationSummary[]> {
  const normalizedUser = userEmail.trim().toLowerCase();
  const summaries: InternalConversationSummary[] = [];

  const generalKey = getChannelSettingKey("group_general");
  const agentKeyMap = new Map<string, string>();
  const directKeys: string[] = [];

  for (const agent of allAgents) {
    if (agent.email.toLowerCase() === normalizedUser) continue;
    const channelId = buildDirectChannelId(normalizedUser, agent.email);
    const key = getChannelSettingKey(channelId);
    agentKeyMap.set(agent.email.toLowerCase(), key);
    directKeys.push(key);
  }

  const allKeys = [generalKey, ...directKeys];
  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("sek_app_settings")
    .select("key, value")
    .in("key", allKeys);

  const messagesByKey = new Map<string, InternalMessage[]>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.value);
        if (Array.isArray(parsed)) messagesByKey.set(r.key, parsed);
      } catch {}
    }
  }

  // 1. Canal General (Siempre disponible para todo el equipo)
  const generalMessages = messagesByKey.get(generalKey) || [];
  const lastGeneral = generalMessages[generalMessages.length - 1] || null;
  const unreadGeneral = generalMessages.filter(
    (m) =>
      m.senderEmail.toLowerCase() !== normalizedUser &&
      (!m.readBy || !m.readBy.map((e) => e.toLowerCase()).includes(normalizedUser))
  ).length;

  summaries.push({
    channelId: "group_general",
    type: "group",
    name: "Chat General del Equipo",
    lastMessage: lastGeneral,
    unreadCount: unreadGeneral,
  });

  // 2. Canales Directos con cada compañero de trabajo
  for (const agent of allAgents) {
    const aEmail = agent.email.toLowerCase();
    if (aEmail === normalizedUser) continue;

    const channelId = buildDirectChannelId(normalizedUser, agent.email);
    const key = agentKeyMap.get(aEmail);
    const messages = (key ? messagesByKey.get(key) : null) || [];
    const lastMsg = messages[messages.length - 1] || null;
    const unread = messages.filter(
      (m) =>
        m.senderEmail.toLowerCase() !== normalizedUser &&
        (!m.readBy || !m.readBy.map((e) => e.toLowerCase()).includes(normalizedUser))
    ).length;

    const fullName = [agent.nombre, agent.apellido].filter(Boolean).join(" ") || agent.email;

    summaries.push({
      channelId,
      type: "direct",
      name: fullName,
      avatarUrl: agent.avatar_url,
      targetEmail: agent.email,
      lastMessage: lastMsg,
      unreadCount: unread,
    });
  }

  return summaries;
}
