import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { image, agent_email, timestamp } = await req.json();
    if (!image || !agent_email) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const buffer = Buffer.from(image, "base64");
    const safeEmail = agent_email.replace(/[^a-zA-Z0-9]/g, "_");
    const fileName = `screenshots/${safeEmail}/${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("attachments")
      .upload(fileName, buffer, { contentType: "image/jpeg", upsert: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("attachments")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
