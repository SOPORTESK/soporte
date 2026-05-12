const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

async function generateSplashIcon() {
  console.log('Generando icono transparente para splash screen...');

  const logoPath = path.join(PUBLIC_DIR, 'logoTienda3D.png');
  const outputPath = path.join(PUBLIC_DIR, 'icon-splash.png');

  // Crear icono 512x512 con fondo transparente
  const logoBuffer = fs.readFileSync(logoPath);
  
  // Redimensionar y poner en canvas transparente
  const resizedLogo = await sharp(logoBuffer)
    .resize(420, 420, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Crear canvas 512x512 transparente y centrar el logo
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: resizedLogo,
        left: 46, // (512 - 420) / 2
        top: 46
      }
    ])
    .png()
    .toFile(outputPath);

  console.log('✓ Icono splash generado:', outputPath);
  console.log('  - Tamaño: 512x512');
  console.log('  - Fondo: transparente');
  console.log('  - Logo centrado');
}

generateSplashIcon().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
