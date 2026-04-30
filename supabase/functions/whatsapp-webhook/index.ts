import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_SID    = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN  = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM   = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? ""; // whatsapp:+14155238886

const db = createClient(SUPABASE_URL, SERVICE_KEY);

/* ── Enviar mensaje via Twilio ── */
async function sendWA(to: string, body: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({
    From: TWILIO_FROM,
    To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    Body: body,
  });
  await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
}

/* ── Estados del flujo de registro ── */
// estado null = número nuevo
// estado "esperando_datos" = esperando Nombre|Correo|Empresa
// estado "esperando_equipo" = esperando marca y modelo
// estado "activo" = caso abierto, pasa al agente

Deno.serve(async (req) => {
  /* Twilio envía form-urlencoded */
  const form = await req.formData();
  const from    = form.get("From")?.toString() ?? "";   // whatsapp:+50688888888
  const body    = form.get("Body")?.toString()?.trim() ?? "";
  const mediaUrl = form.get("MediaUrl0")?.toString() ?? "";
  const mediaType = form.get("MediaContentType0")?.toString() ?? "";

  if (!from || (!body && !mediaUrl)) {
    return new Response("ok", { status: 200 });
  }

  const phone = from.replace("whatsapp:", "");

  /* Buscar caso abierto existente para este número */
  const { data: existing } = await db
    .from("sek_cases")
    .select("id, estado, cliente, histcliente, histtecnico, canal")
    .eq("canal", "whatsapp")
    .eq("customer_phone", phone)
    .not("estado", "in", '("cerrado","resuelto")')
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  /* ── CASO ACTIVO: agregar mensaje al historial ── */
  if (existing && (existing.cliente as any)?.flujo === "activo") {
    const entry: any = {
      role: "user",
      time: new Date().toISOString(),
      content: body || "Archivo adjunto",
    };
    if (mediaUrl) { entry.mediaUrl = mediaUrl; entry.mediaType = mediaType; }

    const hist = [...(existing.histcliente ?? []), entry];
    await db.from("sek_cases").update({ histcliente: hist }).eq("id", existing.id);
    return new Response("ok", { status: 200 });
  }

  /* ── FLUJO DE REGISTRO ── */

  /* Paso 2: cliente ya tiene datos personales, esperando equipo */
  if (existing && (existing.cliente as any)?.flujo === "esperando_equipo") {
    if (!body) {
      await sendWA(from, "Por favor indícame la *marca y modelo* del equipo.\nEjemplo: Hikvision DS-2CD2143");
      return new Response("ok", { status: 200 });
    }
    /* Guardar equipo y activar caso */
    const clienteActualizado = { ...(existing.cliente as any), equipo: body, flujo: "activo" };
    const bienvenida = {
      role: "assistant",
      time: new Date().toISOString(),
      content: `✅ ¡Listo! Un agente de Soporte Sekunet te atenderá en breve.\n\nEquipo registrado: *${body}*`,
    };
    const hist = [...(existing.histcliente ?? []), bienvenida];
    await db.from("sek_cases").update({
      cliente: clienteActualizado,
      histcliente: hist,
      estado: "abierto",
      title: `WhatsApp — ${clienteActualizado.nombre} — ${body}`,
    }).eq("id", existing.id);

    await sendWA(from, bienvenida.content);
    return new Response("ok", { status: 200 });
  }

  /* Paso 1b: tiene caso pero sin equipo aún */
  if (existing && (existing.cliente as any)?.flujo === "esperando_datos") {
    /* Parsear Nombre | Correo | Empresa */
    const parts = body.split("|").map((s: string) => s.trim());
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      await sendWA(from,
        "No pude entender el formato. Por favor responde así:\n\n" +
        "*Nombre | Correo | Empresa*\n\n" +
        "Ejemplo: Juan Pérez | juan@empresa.com | Sekunet"
      );
      return new Response("ok", { status: 200 });
    }
    const clienteActualizado = {
      ...(existing.cliente as any),
      nombre: parts[0], correo: parts[1], cuenta: parts[2],
      telefono: phone, flujo: "esperando_equipo",
    };
    await db.from("sek_cases").update({ cliente: clienteActualizado }).eq("id", existing.id);
    await sendWA(from,
      `Gracias ${parts[0]} 👍\n\nAhora dime:\n¿*Marca y modelo* del equipo que necesita soporte?\n\nEjemplo: Hikvision DS-2CD2143`
    );
    return new Response("ok", { status: 200 });
  }

  /* ── NÚMERO NUEVO o sin caso activo ── */

  /* Buscar si ya tiene datos personales de un caso anterior cerrado */
  const { data: anterior } = await db
    .from("sek_cases")
    .select("cliente")
    .eq("canal", "whatsapp")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const clientePrevio = anterior?.cliente as any;
  const tieneDatos = clientePrevio?.nombre && clientePrevio?.correo && clientePrevio?.cuenta;

  if (tieneDatos) {
    /* Tiene datos, solo pedir equipo */
    const { data: newCase } = await db.from("sek_cases").insert({
      canal: "whatsapp",
      estado: "pendiente",
      prioridad: "media",
      customer_phone: phone,
      cliente: { ...clientePrevio, flujo: "esperando_equipo" },
      histcliente: [],
      histtecnico: [],
      title: `WhatsApp — ${clientePrevio.nombre}`,
    }).select("id").single();

    await sendWA(from,
      `¡Hola ${clientePrevio.nombre}! 👋 Bienvenido de nuevo a *Soporte Sekunet*.\n\n` +
      `¿*Marca y modelo* del equipo que necesita soporte?\n\nEjemplo: Hikvision DS-2CD2143`
    );
  } else {
    /* Número nuevo, pedir datos personales */
    await db.from("sek_cases").insert({
      canal: "whatsapp",
      estado: "pendiente",
      prioridad: "media",
      customer_phone: phone,
      cliente: { telefono: phone, flujo: "esperando_datos" },
      histcliente: [],
      histtecnico: [],
      title: `WhatsApp — ${phone}`,
    });

    await sendWA(from,
      "¡Hola! 👋 Bienvenido a *Soporte Sekunet*.\n\n" +
      "Para atenderte, necesito algunos datos.\nResponde en este formato:\n\n" +
      "*Nombre | Correo | Empresa*\n\n" +
      "Ejemplo: Juan Pérez | juan@empresa.com | Sekunet"
    );
  }

  return new Response("ok", { status: 200 });
});
