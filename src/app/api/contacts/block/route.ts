import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  blockContact,
  getBlockedContacts,
  isContactBlocked,
  unblockContact,
} from "@/lib/blocked-contacts";

export async function GET(req: NextRequest) {
  try {
    const auth = createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const supabase = createServiceClient();

    if (searchParams.get("list") === "1") {
      const contacts = await getBlockedContacts(supabase);
      return NextResponse.json({ contacts });
    }

    const phone = searchParams.get("phone") || "";
    const cedula = searchParams.get("cedula") || "";

    const entry = await isContactBlocked(supabase, { phone, cedula });
    return NextResponse.json({ blocked: Boolean(entry), entry });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error consultando bloqueo" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "unblock" ? "unblock" : "block";
    const phone = body?.phone ? String(body.phone) : "";
    const cedula = body?.cedula ? String(body.cedula) : "";
    const name = body?.name ? String(body.name) : "";
    const reason = body?.reason ? String(body.reason) : "";

    if (!phone && !cedula) {
      return NextResponse.json(
        { error: "Teléfono o cédula requeridos" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    if (action === "unblock") {
      await unblockContact(supabase, { phone, cedula });
      return NextResponse.json({ ok: true, blocked: false });
    }

    await blockContact(supabase, {
      phone,
      cedula,
      name,
      reason,
      blockedBy: user.email || undefined,
    });
    return NextResponse.json({ ok: true, blocked: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Error actualizando bloqueo" },
      { status: 500 }
    );
  }
}
