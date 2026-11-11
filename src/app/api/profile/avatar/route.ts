import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { broadcastAgentEvent } from "@/lib/realtime-broadcast";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("avatar") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${user.id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: uploadError } = await service.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = service.storage.from("avatars").getPublicUrl(path);
  const versionedUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

  await service.from("sek_agent_config")
    .update({ avatar_url: versionedUrl })
    .ilike("email", user.email!);

  await broadcastAgentEvent({
    eventType: "UPDATE",
    email: user.email!,
    avatar_url: versionedUrl,
  });

  return NextResponse.json({ url: versionedUrl });
}
