import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";

export const runtime = "nodejs";

let desktopProcess: ChildProcess | null = null;

export async function POST(req: NextRequest) {
  try {
    const { action, agent_email, agent_name } = await req.json();

    if (action === "start") {
      // Verificar si el proceso sigue vivo
      if (desktopProcess && !desktopProcess.killed && desktopProcess.exitCode === null) {
        return NextResponse.json({ message: "Desktop agent ya está corriendo", pid: desktopProcess.pid });
      }

      // Matar cualquier proceso desktop-agent huérfano anterior
      try {
        const { execSync } = await import("child_process");
        execSync('powershell -Command "Get-WmiObject Win32_Process -Filter \\"Name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'desktop-agent\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: "ignore", windowsHide: true });
      } catch {}

      const scriptPath = path.join(process.cwd(), "desktop-agent.js");
      desktopProcess = spawn("node", [
        scriptPath,
        `--agent=${agent_email}`,
        `--name=${agent_name}`,
        `--api=http://localhost:3100/api/activity/log`,
      ], {
        stdio: "pipe",
        detached: false,
        windowsHide: true,
      });

      desktopProcess.stdout?.on("data", (data) => {
        console.log(`[desktop-agent] ${data.toString().trim()}`);
      });

      desktopProcess.stderr?.on("data", (data) => {
        console.error(`[desktop-agent] ${data.toString().trim()}`);
      });

      desktopProcess.on("exit", () => {
        desktopProcess = null;
        console.log("[desktop-agent] Proceso terminado");
      });

      return NextResponse.json({ message: "Desktop agent iniciado", pid: desktopProcess.pid });
    }

    if (action === "stop") {
      if (desktopProcess) {
        desktopProcess.kill("SIGINT");
        desktopProcess = null;
        return NextResponse.json({ message: "Desktop agent detenido" });
      }
      return NextResponse.json({ message: "Desktop agent no estaba corriendo" });
    }

    if (action === "status") {
      return NextResponse.json({ running: !!desktopProcess, pid: desktopProcess?.pid || null });
    }

    return NextResponse.json({ error: "Acción no válida. Use start, stop, or status." }, { status: 400 });
  } catch (error: any) {
    console.error("[desktop-agent/control] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
