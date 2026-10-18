// Pre-render the native SVG's exact phase cycle for compositor video playback.
// Chrome/Playwright and FFmpeg are authoring dependencies, not runtime code.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const branding = path.join(root, 'assets/branding');
const resolution = 2048;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tech-loader-video-'));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: resolution, height: resolution }, reducedMotion: 'no-preference' });
  const svg = fs.readFileSync(path.join(branding, 'tech-at-loading-v5.svg'), 'utf8');
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:#fff}svg{display:block;width:${resolution}px;height:${resolution}px}</style>` + svg);
  const period = await page.evaluate(() => {
    const animations = document.getAnimations();
    if (!animations.length) throw new Error('Expected the native loader color animations.');
    for (const animation of animations) animation.pause();
    return animations[0].effect.getTiming().duration;
  });
  const frames = 64;
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate(time => { for (const animation of document.getAnimations()) animation.currentTime = time; }, frame * period / frames);
    await page.locator('svg').screenshot({ path: path.join(temporary, `frame-${String(frame).padStart(3, '0')}.png`) });
  }
  // No duplicate end frame: wrapping from the final sampled phase to frame zero
  // advances by the same phase step as every other pair in the cycle.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', (frames * 1000 / period).toFixed(6), '-i', path.join(temporary, 'frame-%03d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', path.join(branding, 'tech-at-loading-hd.mp4')]);
  console.log(`Wrote assets/branding/tech-at-loading-hd.mp4 (${resolution}px, ${frames} frames, ${period / 1000}s cycle).`);
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
