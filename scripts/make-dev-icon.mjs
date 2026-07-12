import sharp from 'sharp';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, '..', 'assets');

async function addDevBadge(inputPath, outputPath) {
  const img = sharp(inputPath);
  const meta = await img.metadata();
  const w = meta.width;
  const h = meta.height;

  const badgeH = Math.round(h * 0.22);
  const fontSize = Math.round(badgeH * 0.55);

  const overlay = Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="${h - badgeH}" width="${w}" height="${badgeH}"
            fill="#FF3B30" opacity="0.92"/>
      <text x="${w / 2}" y="${h - badgeH / 2 + fontSize * 0.35}"
            font-family="Arial, sans-serif" font-weight="bold"
            font-size="${fontSize}" fill="white" text-anchor="middle"
            letter-spacing="2">DEV</text>
    </svg>`);

  await sharp(inputPath)
    .composite([{ input: overlay, blend: 'over' }])
    .png()
    .toFile(outputPath);

  console.log(`✓ ${outputPath}`);
}

await addDevBadge(
  path.join(assets, 'icon.png'),
  path.join(assets, 'icon-dev.png'),
);
await addDevBadge(
  path.join(assets, 'android-icon-foreground.png'),
  path.join(assets, 'android-icon-foreground-dev.png'),
);
