export interface InternalMessage {
  id: string;
  channelId: string; // "group_general" o "dm_email1_email2" (ordenado alfabéticamente)
  senderEmail: string;
  senderName: string;
  senderAvatar?: string | null;
  content: string;
  mediaUrl?: string | null;
  mediaType?: string | null; // e.g. "image/jpeg", "audio/webm", "application/pdf", "video/mp4"
  fileName?: string | null;
  fileSize?: number | null;
  createdAt: string;
  readBy: string[]; // Emails que han leído este mensaje
  replyTo?: { content: string; author: string } | null;
  edited?: boolean;
}

export interface InternalConversationSummary {
  channelId: string;
  type: "group" | "direct";
  name: string;
  avatarUrl?: string | null;
  targetEmail?: string;
  lastMessage?: InternalMessage | null;
  unreadCount: number;
}

export function buildDirectChannelId(email1: string, email2: string): string {
  const sorted = [email1.trim().toLowerCase(), email2.trim().toLowerCase()].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

