import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "soporte@sekunet.com";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

function formatTranscript(histcliente: any[], histtecnico: any[]): string {
  const all: { role: string; time: string; content: string; author?: string }[] = [];

  for (const m of (histcliente ?? [])) {
    if (m?.time && m?.content) {
      all.push({ role: m.role || "user", time: m.time, content: m.content, author: m.author });
    }
  }
  for (const m of (histtecnico ?? [])) {
    if (m?.role === "nota") continue;
    if (m?.time && m?.content) {
      all.push({ role: m.role || "tecnico", time: m.time, content: m.content, author: m.author });
    }
  }

  all.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  const lines = all.map((m) => {
    const t = new Date(m.time).toLocaleString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });
    const who = m.role === "user" ? "Cliente" : (m.author || "Soporte Sekunet");
    return `[${t}] ${who}: ${m.content}`;
  });

  return lines.join("\n");
}

function buildHtml(clienteName: string, transcript: string, caseTitle: string): string {
  const lines = transcript.split("\n").map((line) => {
    const isClient = line.includes("] Cliente:");
    const color = isClient ? "#1e40af" : "#166534";
    const bg = isClient ? "#eff6ff" : "#f0fdf4";
    return `<div style="padding:8px 12px;margin:4px 0;border-radius:8px;background:${bg};border-left:3px solid ${color};font-size:14px;line-height:1.5">${line.replace(/</g, "&lt;")}</div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;padding:32px 16px;margin:0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden">
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:24px 28px">
      <h1 style="color:#fff;font-size:18px;margin:0">Soporte Sekunet</h1>
      <p style="color:rgba(255,255,255,.8);font-size:13px;margin:6px 0 0">Transcripcion de su conversacion</p>
    </div>
    <div style="padding:24px 28px">
      <p style="font-size:15px;color:#1e293b;margin:0 0 8px">Estimado/a <strong>${clienteName}</strong>,</p>
      <p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.5">A continuacion encontrara la transcripcion de su conversacion con nuestro equipo de soporte${caseTitle ? ` (${caseTitle})` : ""}.</p>
      <div style="background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0">
        ${lines}
      </div>
      <p style="font-size:13px;color:#64748b;margin:20px 0 0;line-height:1.5">Si tiene alguna consulta adicional, no dude en contactarnos nuevamente a traves de nuestro chat de soporte.</p>
    </div>
    <div style="background:#f1f5f9;padding:16px 28px;text-align:center">
      <p style="font-size:12px;color:#94a3b8;margin:0">Sekunet - Soporte Tecnico</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const { case_id } = await req.json();
    if (!case_id) {
      return new Response(JSON.stringify({ error: "case_id required" }), { status: 400 });
    }

    const { data: caso, error } = await db
      .from("sek_cases")
      .select("id, title, cliente, histcliente, histtecnico, estado")
      .eq("id", case_id)
      .maybeSingle();

    if (error || !caso) {
      return new Response(JSON.stringify({ error: "Case not found" }), { status: 404 });
    }

    const cliente = typeof caso.cliente === "object" ? caso.cliente : {};
    const email = (cliente as any)?.correo;

    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ skip: true, reason: "no client email" }), { status: 200 });
    }

    const clienteName = (cliente as any)?.nombre || "Cliente";
    const transcript = formatTranscript(caso.histcliente || [], caso.histtecnico || []);

    if (!transcript.trim()) {
      return new Response(JSON.stringify({ skip: true, reason: "empty transcript" }), { status: 200 });
    }

    const html = buildHtml(clienteName, transcript, caso.title || "");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Transcripcion de su conversacion - Soporte Sekunet`,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[send-transcript] Resend error:", res.status, errBody);
      return new Response(JSON.stringify({ error: "email send failed", detail: errBody }), { status: 500 });
    }

    const result = await res.json();
    console.log(`[send-transcript] Email sent to ${email} for case ${case_id}`, result);

    return new Response(JSON.stringify({ ok: true, email_id: result.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[send-transcript] Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
