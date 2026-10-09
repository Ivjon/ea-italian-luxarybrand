// Fabric surfaces drawn in code: normal maps for the weave or grain of each material and colour maps for patterns.
// Garment UVs are in metres, so `tile` is the size in metres one texture covers.
import * as THREE from './vendor/three.module.min.js';

const cache = new Map();
const SIZE = 256;

function canvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Repeatable value noise (wraps at `period` cells).
function noise2(period, seed = 1) {
  const g = [];
  for (let i = 0; i < period * period; i++) g.push(Math.abs(Math.sin((i + 1) * 12.9898 * seed) * 43758.5453) % 1);
  const at = (x, y) => g[((y % period) + period) % period * period + (((x % period) + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}

// Height function (x, y in 0..1, repeating) -> tangent-space normal map.
function normalMap(key, height, strength = 2) {
  if (cache.has(key)) return cache.get(key);
  const c = canvas(), ctx = c.getContext('2d'), img = ctx.createImageData(SIZE, SIZE), h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) h[y * SIZE + x] = height(x / SIZE, y / SIZE);
  const H = (x, y) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1), i = (y * SIZE + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const TAU = Math.PI * 2;
// Surface per material: [height function, strength, tile size in metres].
const SURFACES = {
  leather: () => { const n = noise2(24, 3), m = noise2(64, 7); return [(x, y) => 0.7 * Math.abs(n(x * 24, y * 24) - 0.5) + 0.3 * m(x * 64, y * 64), 3, 0.09]; },
  patent: null, satin: null, silk: null, rubber: null, steel: null, gold: null, silver: null, acetate: null, pearl: null,
  suede: () => { const n = noise2(128, 5); return [(x, y) => n(x * 128, y * 128), 1.2, 0.05]; },
  wool: () => { const n = noise2(64, 2); return [(x, y) => 0.6 * (0.5 + 0.5 * Math.sin(TAU * (x * 48 + y * 48))) + 0.4 * n(x * 64, y * 64), 1.6, 0.06]; },
  cashmere: () => { const n = noise2(32, 4); return [(x, y) => 0.75 * Math.abs(Math.sin(TAU * x * 16)) + 0.25 * n(x * 32, y * 32), 2.2, 0.1]; },
  knit: () => [(x, y) => Math.abs(Math.sin(TAU * x * 20)) * (0.85 + 0.15 * Math.sin(TAU * y * 40)), 2.6, 0.1],
  cotton: () => { const n = noise2(64, 9); return [(x, y) => 0.5 * (Math.sin(TAU * x * 64) * Math.sin(TAU * y * 64)) + 0.5 * n(x * 64, y * 64), 0.9, 0.04]; },
  denim: () => { const n = noise2(32, 6); return [(x, y) => 0.75 * (0.5 + 0.5 * Math.sin(TAU * (x * 40 - y * 40))) + 0.25 * n(x * 32, y * 128), 2, 0.05]; },
  linen: () => { const n = noise2(16, 8), m = noise2(128, 1); return [(x, y) => 0.6 * n(x * 4, y * 16) + 0.4 * m(x * 128, y * 128), 1.5, 0.08]; },
  technical: () => [(x, y) => 0.5 + 0.5 * Math.sin(TAU * (x * 64)) * Math.sin(TAU * (y * 64)), 0.5, 0.03],
  velvet: () => { const n = noise2(128, 2); return [(x, y) => n(x * 128, y * 128), 0.6, 0.05]; },
  tulle: () => [(x, y) => Math.abs(Math.sin(TAU * x * 24)) * Math.abs(Math.sin(TAU * y * 24)), 1.5, 0.04],
};
export function surfaceNormal(material, pattern) {
  if (pattern === 'pique') return { map: normalMap('pique', (x, y) => Math.max(0, Math.sin(TAU * x * 32) * Math.sin(TAU * y * 32)), 3), tile: 0.05 };
  if (pattern === 'rib') return { map: normalMap('rib', (x, y) => Math.abs(Math.sin(TAU * x * 16)) * (0.9 + 0.1 * Math.sin(TAU * y * 48)), 3), tile: 0.08 };
  if (pattern === 'twill') return { map: normalMap('denim', SURFACES.denim()[0], 2), tile: 0.05 };
  const make = SURFACES[material];
  if (!make) return null;
  const [height, strength, tile] = make();
  return { map: normalMap(`m-${material}`, height, strength), tile };
}

const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const shade = (hex, k) => `rgb(${hexRgb(hex).map(v => Math.round(Math.min(255, Math.max(0, k >= 0 ? v + (255 - v) * k : v * (1 + k))))).join(',')})`;
const lum = hex => { const [r, g, b] = hexRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

// Colour map for a pattern in a colour (null for plain pieces). Lines are lighter on dark cloth and darker on light.
export function patternMap(pattern, hex) {
  const key = `p-${pattern}-${hex}`;
  if (cache.has(key)) return cache.get(key);
  const dark = lum(hex) < 0.45, line = shade(hex, dark ? 0.32 : -0.28);
  const c = canvas(), ctx = c.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, SIZE, SIZE);
  let tile = 0.1;
  if (pattern === 'pinstripe') {
    ctx.fillStyle = line;
    for (let x = 0; x < SIZE; x += 32) ctx.fillRect(x, 0, 2, SIZE);
    tile = 0.1;
  } else if (pattern === 'stripe') {
    ctx.fillStyle = line;
    for (let y = 0; y < SIZE; y += 64) ctx.fillRect(0, y, SIZE, 24);
    tile = 0.12;
  } else if (pattern === 'check') {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = line;
    for (let x = 0; x < SIZE; x += 64) { ctx.fillRect(x, 0, 18, SIZE); ctx.fillRect(0, x, SIZE, 18); }
    ctx.globalAlpha = 0.8;
    for (let x = 30; x < SIZE; x += 64) { ctx.fillRect(x, 0, 2, SIZE); ctx.fillRect(0, x, SIZE, 2); }
    tile = 0.14;
  } else if (pattern === 'print') {
    // A foulard-style print: scattered medallions in the colour's companions.
    const accents = [shade(hex, dark ? 0.55 : -0.45), shade(hex, dark ? 0.3 : -0.25), '#c9a24a'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, r = 6 + rnd() * 16;
      ctx.fillStyle = accents[i % 3];
      for (const [ox, oy] of [[0, 0], [SIZE, 0], [0, SIZE], [-SIZE, 0], [0, -SIZE]]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.62, rnd() * Math.PI, 0, TAU);
        ctx.fill();
      }
    }
    tile = 0.22;
  } else if (pattern === 'crystal') {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`;
      ctx.beginPath();
      ctx.arc(rnd() * SIZE, rnd() * SIZE, 1.5 + rnd() * 2.5, 0, TAU);
      ctx.fill();
    }
    tile = 0.06;
  } else if (pattern === 'lace') {
    ctx.fillStyle = shade(hex, dark ? 0.12 : -0.1);
    for (let y = 0; y < SIZE; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < SIZE; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
    }
    tile = 0.06;
  } else return null;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const out = { map: tex, tile };
  cache.set(key, out);
  return out;
}

// Lace and tulle let the body show through: an alpha map of small holes.
export function holesMap(pattern) {
  const key = `holes-${pattern}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(), ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#000';
  const step = pattern === 'tulle' ? 16 : 32;
  for (let y = 0; y < SIZE; y += step) for (let x = (y / step) % 2 ? step / 2 : 0; x < SIZE; x += step) {
    ctx.beginPath();
    ctx.arc(x, y, step * (pattern === 'tulle' ? 0.32 : 0.22), 0, TAU);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const out = { map: tex, tile: pattern === 'tulle' ? 0.02 : 0.06 };
  cache.set(key, out);
  return out;
}

// A soft round dot for the sparkle particles and a radial blob for the contact shadow.
export function dotTexture() {
  if (cache.has('dot')) return cache.get('dot');
  const c = canvas(64), ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  cache.set('dot', tex);
  return tex;
}
export function contactShadowTexture() {
  if (cache.has('contact')) return cache.get('contact');
  const c = canvas(128), ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  cache.set('contact', tex);
  return tex;
}
