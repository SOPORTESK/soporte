import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const releaseDir = path.join(process.cwd(), "release");
    
    // Buscar el instalador más reciente en la carpeta release
    let targetFile = "Soporte Sekunet Setup 1.2.0.exe";
    if (fs.existsSync(releaseDir)) {
      const files = fs.readdirSync(releaseDir)
        .filter((f) => f.endsWith(".exe") && f.toLowerCase().includes("soporte sekunet"))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(releaseDir, a));
          const statB = fs.statSync(path.join(releaseDir, b));
          return statB.mtimeMs - statA.mtimeMs;
        });

      if (files.length > 0) {
        targetFile = files[0];
      }
    }

    const filePath = path.join(releaseDir, targetFile);

    if (!fs.existsSync(filePath)) {
      // Redirección de respaldo a releases de GitHub si no existe el binario local
      return NextResponse.redirect("https://github.com/SOPORTESK/soporte/releases/latest");
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    // Convertir read stream de node a Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.microsoft.portable-executable",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(targetFile)}"`,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("[api/download/electron] Error sirviendo instalador:", err);
    return NextResponse.redirect("https://github.com/SOPORTESK/soporte/releases/latest");
  }
}
