// Static relief uses the accepted @ outline. No animated paint or bitmap logo.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const directory = fileURLToPath(new URL('../assets/branding/', import.meta.url));
const original = fs.readFileSync(directory+'tech-at-flat-pastel-v5.svg', 'utf8');
const shape = original.match(/<clipPath id="tech-at-shape" transform="([^"]+)">([\s\S]*?)<\/clipPath>/);
if (!shape) throw new Error('Accepted logo outline missing.');
const relief = `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254">
<title>Soft raised edge and sheen for the Tech @</title>
<defs>
  <g id="outline" transform="${shape[1]}">${shape[2]}</g>
  <clipPath id="mark" transform="${shape[1]}">${shape[2]}</clipPath>
  <filter id="depth" x="-15%" y="-15%" width="130%" height="140%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="ambient"/>
    <feOffset in="ambient" dy="12" result="ambientOffset"/>
    <feFlood flood-color="#282438" flood-opacity=".12" result="ambientColor"/>
    <feComposite in="ambientColor" in2="ambientOffset" operator="in" result="ambientShadow"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="contact"/>
    <feOffset in="contact" dy="4" result="contactOffset"/>
    <feFlood flood-color="#282438" flood-opacity=".14" result="contactColor"/>
    <feComposite in="contactColor" in2="contactOffset" operator="in" result="contactShadow"/>
    <feMerge result="shadows"><feMergeNode in="ambientShadow"/><feMergeNode in="contactShadow"/></feMerge>
    <feComposite in="shadows" in2="SourceAlpha" operator="out"/>
  </filter>
  <filter id="bevel" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="rounded"/>
    <feOffset in="rounded" dx="3" dy="6" result="down"/>
    <feComposite in="SourceAlpha" in2="down" operator="arithmetic" k2="1" k3="-1" result="upperEdge"/>
    <feFlood flood-color="white" flood-opacity=".65" result="light"/>
    <feComposite in="light" in2="upperEdge" operator="in" result="highlight"/>
    <feOffset in="rounded" dx="-3" dy="-6" result="up"/>
    <feComposite in="SourceAlpha" in2="up" operator="arithmetic" k2="1" k3="-1" result="lowerEdge"/>
    <feFlood flood-color="#393048" flood-opacity=".19" result="dark"/>
    <feComposite in="dark" in2="lowerEdge" operator="in" result="lowlight"/>
    <feMerge><feMergeNode in="lowlight"/><feMergeNode in="highlight"/></feMerge>
  </filter>
  <linearGradient id="sheen" x1=".25" y1="0" x2=".65" y2="1">
    <stop stop-color="white" stop-opacity=".16"/>
    <stop offset=".48" stop-color="white" stop-opacity="0"/>
    <stop offset="1" stop-color="#393048" stop-opacity=".035"/>
  </linearGradient>
</defs>
<use href="#outline" filter="url(#depth)"/>
<g clip-path="url(#mark)"><rect width="1254" height="1254" fill="url(#sheen)"/><use href="#outline" filter="url(#bevel)"/></g>
</svg>\n`;
fs.writeFileSync(directory+'tech-at-raised-relief-v7.svg', relief);

// A loop-only authoring page copies the exact critical runtime styles/markup.
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = index.match(/<style>([\s\S]*?)<\/style>/)[1];
const icons = [...index.matchAll(/<link rel="icon"[^>]*>/g)].map(match => match[0]).join('');
const brand = index.match(/<div id="startup-brand"[\s\S]*?<\/div>\s*<p id="startup-status">/)[0].replace(/\s*<p id="startup-status">$/, '');
fs.writeFileSync(directory+'tech-at-raised-v7-preview.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tech @ — soft raised finish</title>${icons}<style>${styles}</style></head><body><aside id="startup-notice">${brand}</aside></body></html>\n`);
console.log('Built static raised relief and matching looping preview.');
