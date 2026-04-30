import { createClient } from "@/lib/supabase/server";
import { ChannelsClient } from "@/components/admin/channels-client";

export const dynamic = "force-dynamic";

export default async function AdminCanalesPage() {
  const supabase = createClient();
  const { data: channels } = await supabase
    .from("sek_channels").select("*").order("created_at");
  return <ChannelsClient channels={(channels as any[]) || []} />;
}
