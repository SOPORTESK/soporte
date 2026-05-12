import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "soporte@sekunet.com";
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function html(nombre: string, code: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;background:#f4f6f9">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#1a3fa6,#2563eb);padding:32px;text-align:center">
  <p style="color:#fff;font-size:22px;font-weight:700;margin:0">🔑 Recuperar Contraseña</p>
  <p style="color:rgba(255,255,255,.8);font-size:13px;margin:8px 0 0">Soporte Sekunet</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="color:#1e293b;font-size:16px;margin:0 0 12px">Hola, <strong>${nombre}</strong></p>
  <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 28px">
    Recibimos una solicitud para restablecer su contraseña. Use el siguiente código — expira en <strong>15 minutos</strong>.
  </p>
  <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px">
    <p style="font-size:42px;font-weight:800;letter-spacing:10px;color:#1a3fa6;margin:0;font-family:monospace">${code}</p>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0">
    Si no solicitó este cambio, ignore este correo. Su contraseña no cambiará.
  </p>
</td></tr>
<tr><td style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
  <p style="color:#94a3b8;font-size:11px;margin:0">© ${new Date().getFullYear()} Sekunet · Soporte Técnico</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { correo, tipo } = await req.json();
    // tipo: "cliente" | "agente"
    if (!correo || !tipo) return new Response(JSON.stringify({ error: "correo y tipo requeridos" }), { status: 400, headers: cors });

    let nombre = "Usuario";

    if (tipo === "cliente") {
      const { data } = await db.from("sek_clientes").select("nombre,cedula").eq("correo", correo).maybeSingle();
      if (!data) return new Response(JSON.stringify({ error: "No existe cuenta con ese correo" }), { status: 404, headers: cors });
      nombre = data.nombre || "Cliente";
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await hashCode(code);
      await db.from("sek_clientes").update({
        reset_code_hash: codeHash,
        reset_code_expires: new Date(Date.now() + 15 * 60000).toISOString(),
      }).eq("correo", correo);
      await sendEmail(correo, nombre, code);
    } else if (tipo === "agente") {
      const { data } = await db.from("sek_agent_config").select("nombre,apellido").ilike("email", correo).maybeSingle();
      if (!data) return new Response(JSON.stringify({ error: "No existe agente con ese correo" }), { status: 404, headers: cors });
      nombre = [data.nombre, data.apellido].filter(Boolean).join(" ") || "Agente";
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await hashCode(code);
      await db.from("sek_agent_config").update({
        reset_code_hash: codeHash,
        reset_code_expires: new Date(Date.now() + 15 * 60000).toISOString(),
      }).ilike("email", correo);
      await sendEmail(correo, nombre, code);
    } else {
      return new Response(JSON.stringify({ error: "tipo inválido" }), { status: 400, headers: cors });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[send-reset-code]", e.message);
    return new Response(JSON.stringify({ error: "Error interno" }), { status: 500, headers: cors });
  }
});

async function hashCode(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(to: string, nombre: string, code: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Soporte Sekunet <${FROM_EMAIL}>`,
      to: [to],
      subject: `🔑 Código de recuperación: ${code}`,
      html: html(nombre, code),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[send-reset-code] Resend error:", res.status, err);
    throw new Error("email_send_failed");
  }
}
