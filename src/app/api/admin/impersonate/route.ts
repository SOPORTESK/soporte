import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // Service role client — no depende de cookies de sesión
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Verificar sesión actual con el cliente de cookies
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: caller } = await serviceClient
    .from("sek_agent_config")
    .select("rol")
    .ilike("email", user.email!)
    .maybeSingle();

  if (caller?.rol !== "superadmin") {
    return NextResponse.json({ error: "Solo superadmin puede impersonar" }, { status: 403 });
  }

  // 2. Obtener el email objetivo (JSON)
  const body = await req.json();
  const email = body.email as string;
  const agentName = (body.agentName as string) || email;
  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3100";

  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: email.toLowerCase(),
    options: {
      redirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message || "No se pudo generar el enlace" },
      { status: 500 }
    );
  }

  // Generar magic link de retorno para el superadmin
  const { data: returnData } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: user.email!.toLowerCase(),
    options: { redirectTo: `${siteUrl}/auth/confirm` },
  });

  // Devolver URL del magic link y URL de retorno para el banner
  return NextResponse.json({
    url: data.properties.action_link,
    returnUrl: returnData?.properties?.action_link || null,
    agentName,
  });
}
