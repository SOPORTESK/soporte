import { execSync } from "node:child_process";

try {
  const listOutput = execSync("pm2 jlist", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
  const list = JSON.parse(listOutput || "[]");
  const exists = list.some((p) => p.name === "sekunet-frontend");
  if (exists) {
    console.log("→ Sincronizando servidor PM2 con el nuevo build...");
    execSync("pm2 restart sekunet-frontend --update-env", { stdio: "inherit" });
    console.log("✓ Servidor sekunet-frontend recargado automáticamente con el nuevo build.");
  }
} catch (e) {
  // PM2 no activo o entorno sin PM2; no bloquea
}
