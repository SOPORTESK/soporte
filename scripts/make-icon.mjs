// Genera icon-app-512.png: fondo azul degradado + logo iSoTienda3D centrado sin fondo blanco
import { createCanvas, loadImage } from "canvas";
import { writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "../public");
const SIZE = 512;
const RADIUS = 115;

const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d");

// Fondo redondeado con degradado azul
ctx.beginPath();
ctx.moveTo(RADIUS, 0);
ctx.lineTo(SIZE - RADIUS, 0);
ctx.quadraticCurveTo(SIZE, 0, SIZE, RADIUS);
ctx.lineTo(SIZE, SIZE - RADIUS);
ctx.quadraticCurveTo(SIZE, SIZE, SIZE - RADIUS, SIZE);
ctx.lineTo(RADIUS, SIZE);
ctx.quadraticCurveTo(0, SIZE, 0, SIZE - RADIUS);
ctx.lineTo(0, RADIUS);
ctx.quadraticCurveTo(0, 0, RADIUS, 0);
ctx.closePath();

// Fondo blanco limpio (el logo iSoTienda3D ya tiene fondo blanco)
ctx.fillStyle = "#ffffff";
ctx.fill();
ctx.save();
ctx.clip();

const logo = await loadImage(Buffer.from(readFileSync(join(PUBLIC, "iSoTienda3D.png"))));
// Centrar logo con padding proporcional
const PAD = 60;
ctx.drawImage(logo, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2);
ctx.restore();

const buf = canvas.toBuffer("image/png");
writeFileSync(join(PUBLIC, "icon-app-512.png"), buf);
console.log("✅ icon-app-512.png generado");
