// Freeze the approved native contour export's first-frame colors as a favicon.
// Re-authoring uses installed Chrome/Playwright and ImageMagick; runtime does not.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const branding = path.join(root, 'assets/branding');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tech-favicon-'));
const faviconMarkScale = 0.8;
const reliefSvg = fs.readFileSync(path.join(branding, 'tech-at-raised-relief-v7.svg'), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1254, height: 1254 }, reducedMotion: 'no-preference' });
  await page.goto(pathToFileURL(path.join(branding, 'tech-at-loading-v5.svg')).href);
  const frozen = await page.evaluate(({markScale, reliefSvg}) => {
    for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 0; }
    const svg = document.documentElement;
    const colors = [...svg.querySelectorAll('path.flow-segment')].map(node => ({ node, color: getComputedStyle(node).stroke }));
    for (const { node, color } of colors) {
      node.setAttribute('stroke', color);
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke-linecap', 'round');
    }
    for (const style of svg.querySelectorAll('style')) style.remove();
    for (const node of svg.querySelectorAll('*')) {
      for (const attribute of [...node.attributes]) {
        if (attribute.name === 'style' || attribute.name === 'class' || attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
      }
    }
    const clip = svg.querySelector('clipPath'), bounds = clip.querySelector('path').getBBox();
    const matrix = clip.transform.baseVal.consolidate().matrix;
    const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y + bounds.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
    const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
    const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    const size = Math.max(maxX - minX, maxY - minY) * 1.18;
    const x = centerX - size / 2, y = centerY - size / 2;
    svg.setAttribute('viewBox', [x, y, size, size].map(n => n.toFixed(4)).join(' '));
    svg.setAttribute('width', '64'); svg.setAttribute('height', '64');
    svg.setAttribute('aria-label', 'Tech at symbol');
    svg.querySelector('title').textContent = 'Tech @ favicon';
    svg.querySelector('desc').textContent = 'Still pastel Tech @ with soft raised edges and sheen.';
    const backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    backdrop.setAttribute('x', String(x)); backdrop.setAttribute('y', String(y));
    backdrop.setAttribute('width', String(size)); backdrop.setAttribute('height', String(size));
    backdrop.setAttribute('rx', String(size * .22)); backdrop.setAttribute('fill', '#fff');
    svg.querySelector(':scope > rect').replaceWith(backdrop);
    // Twenty percent smaller than the original mark; badge stays unchanged.
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mark.id = 'favicon-mark';
    mark.setAttribute('transform', `translate(${centerX},${centerY}) scale(${markScale}) translate(${-centerX},${-centerY})`);
    for (const node of [...svg.children]) {
      if (!['title', 'desc', 'defs', 'rect'].includes(node.localName)) mark.append(node);
    }
    // Inline the runtime relief, keeping the favicon a self-contained vector.
    const relief = new DOMParser().parseFromString(reliefSvg, 'image/svg+xml').documentElement;
    for (const node of relief.querySelectorAll('*')) {
      if (node.id) node.id = 'relief-' + node.id;
      for (const attribute of [...node.attributes]) {
        let value = attribute.value.replace(/url\(#([^)]+)\)/g, 'url(#relief-$1)');
        if (attribute.name === 'href' && value.startsWith('#')) value = '#relief-' + value.slice(1);
        if (value !== attribute.value) node.setAttribute(attribute.name, value);
      }
    }
    for (const node of [...relief.children]) {
      if (node.localName === 'title') continue;
      const imported = document.importNode(node, true);
      if (node.localName === 'defs') svg.querySelector('defs').append(...imported.children);
      else mark.append(imported);
    }
    svg.append(mark);
    return new XMLSerializer().serializeToString(svg) + '\n';
  }, {markScale: faviconMarkScale, reliefSvg});
  if (/animation|@keyframes|<script/i.test(frozen)) throw new Error('Favicon must be completely still.');
  const output = path.join(branding, 'favicon.svg');
  fs.writeFileSync(output, frozen);
  // A fresh HTML surface avoids standalone SVG viewer viewport caching when
  // changing from the loader's large authoring viewport to favicon dimensions.
  const rasterPage = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await rasterPage.setContent('<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:256px;height:256px}</style>' + frozen);
  const png = path.join(temporary, 'favicon.png');
  await rasterPage.locator('svg').screenshot({ path: png, omitBackground: true });
  const frames = [48, 32, 16].map(size => {
    const frame = path.join(temporary, `favicon-${size}.png`);
    // Remove near-zero alpha ringing after each resize without discarding the
    // useful antialiasing along the badge's rounded edge.
    execFileSync('magick', [png, '-resize', `${size}x${size}`, '-channel', 'A', '-fx', 'u<0.04?0:u', '+channel', frame]);
    return frame;
  });
  execFileSync('magick', [...frames, path.join(branding, 'favicon.ico')]);
  console.log('Wrote assets/branding/favicon.svg and favicon.ico (16, 32, 48px).');
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
