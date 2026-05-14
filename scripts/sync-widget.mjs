// Sincroniza public/widget-standalone.html (canónico) → widget-standalone.html (raíz, para GitHub Pages).
// Se ejecuta automáticamente en pre-commit y antes de build.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = "public/widget-standalone.html";
const DST = "widget-standalone.html";

if (!existsSync(SRC)) {
  console.error(`✗ ${SRC} no existe. Cancelado.`);
  process.exit(1);
}

const src = readFileSync(SRC, "utf8");
const dst = existsSync(DST) ? readFileSync(DST, "utf8") : "";

if (src === dst) {
  console.log(`✓ widget-standalone.html ya está sincronizado.`);
  process.exit(0);
}

writeFileSync(DST, src);
console.log(`✓ Sincronizado: ${SRC} → ${DST} (${src.length} bytes)`);

// Si estamos en pre-commit, agregar el archivo modificado al stage.
try {
  execSync(`git add "${DST}"`, { stdio: "ignore" });
  console.log(`✓ ${DST} agregado al commit.`);
} catch {
  // No estamos en contexto de git; no pasa nada.
}
