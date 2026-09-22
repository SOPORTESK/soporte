import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url, apiToken, accountId } = await req.json();
    if (!url || !apiToken) {
      return NextResponse.json({ success: false, error: "URL y API Token son requeridos." }, { status: 400 });
    }

    const cleanUrl = url.replace(/\/+$/, "");
    const target = accountId 
      ? `${cleanUrl}/api/v1/accounts/${accountId}/inboxes` 
      : `${cleanUrl}/api/v1/profile`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(target, {
        headers: {
          "api_access_token": apiToken,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json({ 
          success: true, 
          status: res.status, 
          message: "Conexión exitosa con Chatwoot.",
          inboxes: Array.isArray(data) ? data.map((i: any) => ({ id: i.id, name: i.name, channel: i.channel_type })) : undefined
        });
      } else {
        return NextResponse.json({ 
          success: false, 
          status: res.status, 
          error: `Chatwoot respondió con estado HTTP ${res.status}. Verifique el API Token y el Account ID.` 
        });
      }
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      return NextResponse.json({ 
        success: false, 
        error: `No se pudo conectar con Chatwoot en ${cleanUrl}. Error: ${fetchErr.name === "AbortError" ? "Tiempo de espera agotado" : fetchErr.message}` 
      });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "Error al probar conexión." }, { status: 500 });
  }
}
