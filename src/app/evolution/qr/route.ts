import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const EVO_URL = process.env.EVOLUTION_API_URL || "";
  const EVO_KEY = process.env.EVOLUTION_API_KEY || "";
  const instance = (new URL(req.url)).searchParams.get("instance") || (process.env.EVOLUTION_INSTANCE || "");
  const number = (new URL(req.url)).searchParams.get("number");
  if (!EVO_URL || !EVO_KEY || !instance) {
    return new Response("Missing Evolution configuration", { status: 500 });
  }
  try {
    const url = new URL(`${EVO_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(instance)}`);
    if (number) url.searchParams.set("number", number);
    const res = await fetch(url.toString(), { headers: { apikey: EVO_KEY } });
    const data = await res.json();
    const base64: string = data?.base64 || "";
    const html = `<!doctype html><html><head><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Evolution QR</title><style>body{display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0f;color:#fff;font-family:system-ui}.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.4);max-width:420px}.qr{width:360px;height:360px;display:block;background:#0b0b0f;border-radius:12px;border:1px solid #374151}.muted{color:#9ca3af;font-size:12px;margin-top:8px}</style></head><body><div class="card"><h3>Escanee este código QR en WhatsApp</h3><img class="qr" src="${base64}" alt="QR" /><p class="muted">WhatsApp → Dispositivos vinculados → Vincular dispositivo. Esta página se actualiza cada 5s.</p></div></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e: any) {
    return new Response(`Error: ${e?.message || "qr_failed"}`, { status: 500 });
  }
}
