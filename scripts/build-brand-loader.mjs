// Reproduce the native SVG loader from the approved flat raster silhouette.
// Requires local ImageMagick and Potrace only when re-authoring, not at runtime.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const branding = path.join(root, 'assets/branding');
const cycleSeconds = 3.2 / 1.5;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tech-brand-loader-'));
try {
  const bitmap = path.join(temporary, 'silhouette.pbm');
  const trace = path.join(temporary, 'silhouette.svg');
  execFileSync('magick', [path.join(branding, 'tech-at-flat-pastel-v4.png'), '-colorspace', 'Gray', '-threshold', '97%', bitmap]);
  execFileSync('potrace', [bitmap, '--svg', '--opttolerance', '0.2', '--output', trace]);
  const source = fs.readFileSync(trace, 'utf8');
  const geometry = source.match(/<g transform="([^"]+)"[^>]*>([\s\S]*?)<\/g>/);
  if (!geometry || !geometry[2].includes('<path')) throw new Error('Could not extract the traced @ silhouette.');
  const palette = [
    [0, '#f0ba72'], [0.13, '#f3d578'], [0.27, '#f18fad'],
    [0.41, '#e78ce5'], [0.55, '#ae91ec'], [0.69, '#7eacf0'],
    [0.82, '#78d6db'], [0.92, '#91dcb2'], [1, '#f0ba72'],
  ];
  const stops = palette.map(([offset, color]) => `      <stop offset="${offset}" stop-color="${color}"/>`).join('\n');

  // Sample each cubic by arc length so equal animation phases travel around
  // the actual strokes, rather than across a moving rectangular color field.
  function route(start, cubics, count, width, name, phaseOffset = 0) {
    const points = [{ x: start[0], y: start[1], length: 0 }];
    let previous = start;
    for (const [a, b, end] of cubics) {
      for (let step = 1; step <= 300; step++) {
        const t = step / 300, s = 1 - t;
        const x = s ** 3 * previous[0] + 3 * s ** 2 * t * a[0] + 3 * s * t ** 2 * b[0] + t ** 3 * end[0];
        const y = s ** 3 * previous[1] + 3 * s ** 2 * t * a[1] + 3 * s * t ** 2 * b[1] + t ** 3 * end[1];
        const last = points.at(-1);
        points.push({ x, y, length: last.length + Math.hypot(x - last.x, y - last.y) });
      }
      previous = end;
    }
    const length = points.at(-1).length;
    function at(u) {
      const distance = u * length;
      let hi = points.findIndex(p => p.length >= distance);
      if (hi <= 0) return points[0];
      const a = points[hi - 1], b = points[hi], t = (distance - a.length) / (b.length - a.length);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    const segments = Array.from({ length: count }, (_, index) => {
      const a = at(index / count), b = at((index + 1) / count), u = (index + .5) / count;
      // color(t,u)=palette(t/T-u-offset), so a color travels in increasing u.
      const phase = (1 - ((u + phaseOffset) % 1)) % 1;
      const color = palette[Math.floor(phase * (palette.length - 1))][1];
      return `      <path class="flow-segment" data-route="${name}" data-u="${u.toFixed(8)}" data-phase="${phase.toFixed(8)}" d="M${a.x.toFixed(3)} ${a.y.toFixed(3)} L${b.x.toFixed(3)} ${b.y.toFixed(3)}" stroke="${color}" style="animation-delay:-${(phase * cycleSeconds).toFixed(8)}s"/>`;
    }).join('\n');
    return { points, length, svg: `    <g data-route="${name}" data-phase-offset="${phaseOffset.toFixed(8)}" stroke-width="${width}">\n${segments}\n    </g>` };
  }
  const outer = route([588, 979], [
    [[390, 958], [247, 833], [222, 659]],
    [[193, 477], [331, 312], [510, 259]],
    [[690, 205], [869, 270], [982, 406]],
    [[1094, 542], [1095, 699], [982, 770]],
    [[930, 803], [863, 813], [769, 813]],
    [[769, 690], [769, 570], [769, 461]],
  ], 128, 220, 'outer');
  // Match the closed inner loop's start color to the shared stem junction.
  const junction = outer.points.reduce((a, b) => Math.hypot(b.x - 765, b.y - 628) < Math.hypot(a.x - 765, a.y - 628) ? b : a);
  const inner = route([765, 628], [
    [[765, 525], [707, 461], [625, 461]],
    [[531, 461], [459, 536], [459, 634]],
    [[459, 735], [528, 793], [619, 793]],
    [[700, 793], [765, 728], [765, 628]],
  ], 64, 200, 'inner', junction.length / outer.length);
  const colorFrames = palette.map(([offset, color]) => `${offset * 100}%{stroke:${color}}`).join('');
  // Static alpha masks let the website move prepainted gradient surfaces on
  // the compositor, independently of map JavaScript and SVG paint animation.
  for(const [name,route,width] of [['outer',outer,220],['inner',inner,200]]) {
    const line=route.points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' ');
    const mask=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1254 1254"><defs><clipPath id="shape" transform="${geometry[1]}">${geometry[2]}</clipPath><filter id="soft" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="12"/></filter></defs><g clip-path="url(#shape)"><path d="${line}" fill="none" stroke="white" stroke-width="${width}" stroke-linecap="round" filter="url(#soft)"/></g></svg>\n`;
    fs.writeFileSync(path.join(branding,`tech-at-loading-${name}-mask.svg`),mask);
  }
  const createContourSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254" role="img" aria-label="Tech at symbol, colors following its strokes">
  <title>Tech @ loading animation</title>
  <desc>Stationary flat @. Pastel colors follow the outer spiral, stem and inner loop every ${cycleSeconds.toFixed(3)} seconds. Reduced motion shows a static mark.</desc>
  <style>
    .flow-segment{fill:none;stroke-linecap:round;animation:tech-route-color ${cycleSeconds}s linear infinite}
    @keyframes tech-route-color{${colorFrames}}
    @media(prefers-reduced-motion:reduce){.flow-segment{animation:none}}
  </style>
  <defs>
    <clipPath id="tech-at-shape" transform="${geometry[1]}">${geometry[2]}</clipPath>
    <linearGradient id="tech-pastels" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1254" y2="0" spreadMethod="repeat">
${stops}
    </linearGradient>
    <filter id="tech-flow-soften" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="12"/></filter>
  </defs>
  <rect width="1254" height="1254" fill="#fff"/>
  <g clip-path="url(#tech-at-shape)">
    <rect width="1254" height="1254" fill="url(#tech-pastels)"/>
    <g filter="url(#tech-flow-soften)">
${outer.svg}
${inner.svg}
    </g>
  </g>
</svg>
`;
  const createSvg = animated => animated ? createContourSvg() : `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254" role="img" aria-label="Tech at symbol, pastel colors">
  <title>Tech @ pastel logo</title>
  <desc>Stationary flat @ traced from the approved design. A richer pastel gradient on white.</desc>
  <style>
    ${''}
  </style>
  <defs>
    <clipPath id="tech-at-shape" transform="${geometry[1]}">
      ${geometry[2]}
    </clipPath>
    <linearGradient id="tech-pastels" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1254" y2="0" spreadMethod="repeat">
${stops}
    </linearGradient>
    <linearGradient id="tech-soft-light"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1254" height="1254" fill="#fff"/>
  <g clip-path="url(#tech-at-shape)">
    <rect class="color-field" x="-1254" y="0" width="3762" height="1254" fill="url(#tech-pastels)"/>
    ${''}
  </g>
</svg>
`;
  for (const [file, animated] of [['tech-at-loading-v5.svg', true], ['tech-at-flat-pastel-v5.svg', false]]) {
    fs.writeFileSync(path.join(branding, file), createSvg(animated));
    console.log(`Wrote assets/branding/${file}`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
