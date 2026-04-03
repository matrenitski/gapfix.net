import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const assetsDir = resolve(import.meta.dirname, '../public/assets');

const files = [
  { svg: 'og-image.svg', png: 'og-image.png', width: 1200, height: 630 },
  { svg: 'twitter-card.svg', png: 'twitter-card.png', width: 1200, height: 675 },
  { svg: 'github-social-preview.svg', png: 'github-social-preview.png', width: 1280, height: 640 },
];

const browser = await chromium.launch();

for (const f of files) {
  const svgPath = resolve(assetsDir, f.svg);
  const svgContent = readFileSync(svgPath, 'utf-8');

  const html = `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; }
  body { width: ${f.width}px; height: ${f.height}px; overflow: hidden; }
</style>
</head><body>${svgContent}</body></html>`;

  const page = await browser.newPage();
  await page.setViewportSize({ width: f.width, height: f.height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  // Extra wait for font loading
  await page.waitForTimeout(1500);

  const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: f.width, height: f.height } });
  const outPath = resolve(assetsDir, f.png);
  writeFileSync(outPath, buf);
  console.log(`Created ${f.png} (${buf.length} bytes)`);
  await page.close();
}

await browser.close();
console.log('Done.');
