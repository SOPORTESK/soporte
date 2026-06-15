import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import net from "node:net";

export const runtime = "nodejs";

const WATCHER_VBS = "C:\\Users\\Taller SK\\Apps\\watch-all-hidden.vbs";

function checkPort(port: number, host = "127.0.0.1", timeout = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (up: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function snapshot() {
  const [pg, evolution, app] = await Promise.all([
    checkPort(5433),
    checkPort(7001),
    checkPort(3100),
  ]);
  return { pg, evolution, app };
}

export async function GET() {
  return NextResponse.json({ ok: true, services: await snapshot() });
}

export async function POST() {
  try {
    // Lanzar el watcher único de forma desacoplada. El watcher detecta por
    // puerto qué servicios están caídos (PostgreSQL 5433, Evolution 7001,
    // Next.js 3100) y reinicia los que falten. Es idempotente: si ya hay un
    // watcher corriendo, simplemente habrá una verificación extra sin daño.
    const child = spawn("wscript.exe", [WATCHER_VBS], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    // Dar tiempo al watcher para levantar servicios caídos
    await new Promise((r) => setTimeout(r, 14000));

    const services = await snapshot();
    const allUp = services.pg && services.evolution && services.app;

    return NextResponse.json({
      ok: true,
      allUp,
      services,
      message: allUp
        ? "Todos los servicios están arriba."
        : "Watcher relanzado. Algunos servicios pueden tardar unos segundos más en levantar.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "restart_error" },
      { status: 500 }
    );
  }
}
