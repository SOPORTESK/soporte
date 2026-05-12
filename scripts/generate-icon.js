const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OUTPUT_DIR = PUBLIC_DIR;

// Gradient colors from widget header: #1d4ed8 → #2563eb
const COLOR_START = '#1d4ed8';
const COLOR_END = '#2563eb';

async function createGradientBackground(size) {
  // Create SVG with gradient
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${COLOR_START};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${COLOR_END};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="highlight" x1="0%" y1="0%" x2="0%" y2="50%">
          <stop offset="0%" style="stop-color:white;stop-opacity:0.15" />
          <stop offset="100%" style="stop-color:white;stop-opacity:0" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#grad)"/>
      <rect width="${size}" height="${size * 0.5}" rx="${size * 0.22}" fill="url(#highlight)"/>
    </svg>
  `;
  return Buffer.from(svg);
}

async function generateIcon(size, outputName) {
  console.log(`Generating ${size}x${size} icon...`);

  // Create background with gradient
  const backgroundSvg = await createGradientBackground(size);

  // Load the logo
  const logoPath = path.join(PUBLIC_DIR, 'iSoTienda3D.png');
  const logoBuffer = fs.readFileSync(logoPath);

  // Resize logo to fit (70% of icon size)
  const logoSize = Math.round(size * 0.7);
  const resizedLogo = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Calculate position to center the logo
  const offset = Math.round((size - logoSize) / 2);

  // Composite logo onto background
  const finalIcon = await sharp(backgroundSvg)
    .composite([
      {
        input: resizedLogo,
        left: offset,
        top: offset,
      }
    ])
    .png()
    .toBuffer();

  // Save the icon
  const outputPath = path.join(OUTPUT_DIR, outputName);
  fs.writeFileSync(outputPath, finalIcon);
  console.log(`✓ Saved: ${outputPath}`);
}

async function main() {
  console.log('🎨 Generating premium Sekunet icons...');
  console.log(`Using gradient: ${COLOR_START} → ${COLOR_END}`);
  console.log('');

  try {
    // Generate icons in different sizes
    await generateIcon(512, 'icon-premium-512.png');
    await generateIcon(192, 'icon-premium-192.png');
    await generateIcon(180, 'icon-premium-180.png');
    await generateIcon(120, 'icon-premium-120.png');
    await generateIcon(96, 'icon-premium-96.png');
    await generateIcon(72, 'icon-premium-72.png');
    await generateIcon(48, 'icon-premium-48.png');

    console.log('');
    console.log('✅ All icons generated successfully!');
    console.log('');
    console.log('Files created:');
    console.log('  - icon-premium-512.png (PWA main icon)');
    console.log('  - icon-premium-192.png (PWA small icon)');
    console.log('  - icon-premium-180.png (iOS home screen)');
    console.log('  - icon-premium-120.png (iOS spotlight)');
    console.log('  - icon-premium-96.png (Android)');
    console.log('  - icon-premium-72.png (Android)');
    console.log('  - icon-premium-48.png (Android)');
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

main();
