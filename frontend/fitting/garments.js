// Garments for the mannequin, built from a product's wearable spec (backend/lib/wearable.js): clothes are lofted
// around the body's own measurements and skinned to its skeleton, so they bend with every pose; bags hang from the
// hand, jewellery and accessories ride on their bone. Each garment fades in with a gold-edged dissolve, and
// coats, skirts and scarves sway when the mannequin turns.
import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { torsoAt, armAt, legAt, curve, loft, limbRings, torsoRings, footGeometry } from './body.js';
import { surfaceNormal, patternMap, holesMap } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Shared animation uniforms (fitting.js updates them every frame).
export const shared = { uTime: { value: 0 }, uOmega: { value: 0 } };

// ---------------------------------------------------------------------------------------------------------------
// Materials
const METAL = { gold: '#d9b45f', 'rose gold': '#d6a18c', silver: '#d9d9de', steel: '#c4c6ca', palladium: '#cfd0d4' };
const metalHex = (name, fallback) => METAL[String(name || '').toLowerCase()] || fallback;

const FINISH = {
  leather: { roughness: 0.5, clearcoat: 0.18, clearcoatRoughness: 0.45, sheen: 0.12, envMapIntensity: 0.7 },
  patent: { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 },
  suede: { roughness: 1, sheen: 1, sheenRoughness: 0.75 },
  wool: { roughness: 0.92, sheen: 0.55, sheenRoughness: 0.6 },
  cashmere: { roughness: 0.95, sheen: 0.85, sheenRoughness: 0.5 },
  knit: { roughness: 0.95, sheen: 0.7, sheenRoughness: 0.55 },
  cotton: { roughness: 0.86, sheen: 0.35, sheenRoughness: 0.7 },
  denim: { roughness: 0.9, sheen: 0.25, sheenRoughness: 0.8 },
  linen: { roughness: 0.92, sheen: 0.3, sheenRoughness: 0.8 },
  silk: { roughness: 0.32, sheen: 1, sheenRoughness: 0.25, anisotropy: 0.5 },
  satin: { roughness: 0.24, sheen: 1, sheenRoughness: 0.2, anisotropy: 0.7 },
  technical: { roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.5 },
  velvet: { roughness: 1, sheen: 1, sheenRoughness: 0.35 },
  tulle: { roughness: 0.7, sheen: 0.6, transparent: true, opacity: 0.62 },
  rubber: { roughness: 0.72 },
  gold: { roughness: 0.2, metalness: 1 },
  silver: { roughness: 0.16, metalness: 1 },
  steel: { roughness: 0.28, metalness: 1 },
  acetate: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 },
  pearl: { roughness: 0.22, iridescence: 0.7, iridescenceIOR: 1.4, clearcoat: 0.6 },
};

// Adds the dissolve-in and fabric sway to a material. `g` is the garment, holding its reveal uniforms.
function hook(mat, g) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: shared.uTime, uOmega: shared.uOmega, uReveal: g.reveal, uTop: g.top, uBottom: g.bottom });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSway;
uniform float uTime;
uniform float uOmega;
varying vec3 vEaP;
varying float vEaY;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
if (aSway > 0.0) {
  // Turning drags loose fabric behind (opposite the spin); a soft flutter keeps it alive.
  vec2 r = transformed.xz;
  transformed.xz += vec2(r.y, -r.x) * uOmega * 0.09 * aSway;
  float ph = uTime * 2.1 + transformed.y * 11.0 + atan(r.y, r.x) * 3.0;
  transformed.xz += normalize(r + 1e-4) * sin(ph) * (0.004 + abs(uOmega) * 0.012) * aSway;
  transformed.y += abs(uOmega) * 0.02 * aSway * aSway;
}
vEaP = transformed;
vEaY = (modelMatrix * vec4(transformed, 1.0)).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uReveal;
uniform float uTop;
uniform float uBottom;
varying vec3 vEaP;
varying float vEaY;
float eaHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float eaNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eaHash(i), eaHash(i + vec3(1,0,0)), f.x), mix(eaHash(i + vec3(0,1,0)), eaHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(eaHash(i + vec3(0,0,1)), eaHash(i + vec3(1,0,1)), f.x), mix(eaHash(i + vec3(0,1,1)), eaHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float eaEdge = 0.0;
if (uReveal < 1.0) {
  // Drapes on from the top down, along a noisy front with a warm gold edge.
  float eaT = clamp((uTop - vEaY) / max(uTop - uBottom, 0.001), 0.0, 1.0) * 0.82 + eaNoise(vEaP * 34.0) * 0.18;
  float eaR = uReveal * 1.05;
  if (eaT > eaR) discard;
  eaEdge = 1.0 - smoothstep(0.0, 0.045, eaR - eaT);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.74, 0.34) * eaEdge * 2.4;`);
  };
  mat.customProgramCacheKey = () => 'ea-garment';
  return mat;
}

// The fabric of a piece in a colour; `texture` (the CRM agent's swatch) replaces the colour when given.
function fabric(g, material, pattern, hex, { texture = null, side = THREE.DoubleSide } = {}) {
  const f = FINISH[material] || FINISH.cotton;
  const mat = new THREE.MeshPhysicalMaterial({ color: hex, side, ...f });
  if (f.sheen) mat.sheenColor = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35);
  const normal = surfaceNormal(material, pattern);
  if (normal) {
    mat.normalMap = normal.map.clone();
    mat.normalMap.needsUpdate = true;
    mat.normalMap.repeat.set(1 / normal.tile, 1 / normal.tile);
    mat.normalScale.set(0.55, 0.55);
  }
  if (texture) {
    mat.map = texture;
    mat.color.set('#ffffff');
  } else {
    const pm = patternMap(pattern, hex);
    if (pm) {
      mat.map = pm.map.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(1 / pm.tile, 1 / pm.tile);
      mat.color.set('#ffffff');
    }
  }
  if (material === 'tulle' || pattern === 'lace') {
    const holes = holesMap(material === 'tulle' ? 'tulle' : 'lace');
    mat.alphaMap = holes.map.clone();
    mat.alphaMap.needsUpdate = true;
    mat.alphaMap.repeat.set(1 / holes.tile, 1 / holes.tile);
    mat.alphaTest = 0.5;
    mat.transparent = false;
  }
  if (pattern === 'crystal') { mat.emissive = new THREE.Color('#fff4d8'); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.25; }
  mat.userData.pattern = pattern;
  mat.userData.material = material;
  return hook(mat, g);
}
const plain = (g, hex, f) => hook(new THREE.MeshPhysicalMaterial({ color: hex, side: THREE.DoubleSide, ...f }), g);

// ---------------------------------------------------------------------------------------------------------------
// Skin weights: each vertex follows the bones nearest to it (inverse distance to each bone's segment), so cloth
// stretches smoothly across the joints. `cands` = [[boneName, factor], …]; `sway(p)` gives the flutter weight.
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3(), _q = new THREE.Vector3();
function segDist(p, a, b) {
  _ab.subVectors(b, a);
  const t = clamp(_ap.subVectors(p, a).dot(_ab) / _ab.lengthSq(), 0, 1);
  return _q.copy(a).addScaledVector(_ab, t).distanceTo(p);
}
function skin(geo, m, cands, { power = 6, sway = null } = {}) {
  const pos = geo.attributes.position, n = pos.count;
  const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4), sw = new Float32Array(n);
  const list = cands.map(([name, f]) => ({ i: m.order.indexOf(m.bones[name]), a: m.segments[name][0], b: m.segments[name][1], f }));
  const p = new THREE.Vector3(), w = new Array(list.length);
  for (let v = 0; v < n; v++) {
    p.fromBufferAttribute(pos, v);
    for (let k = 0; k < list.length; k++) w[k] = { i: list[k].i, w: list[k].f / (segDist(p, list[k].a, list[k].b) ** power + 1e-12) };
    w.sort((x, y) => y.w - x.w);
    const top = w.slice(0, 4), sum = top.reduce((s, x) => s + x.w, 0);
    top.forEach((x, k) => { idx[v * 4 + k] = x.i; wts[v * 4 + k] = x.w / sum; });
    if (sway) sw[v] = sway(p);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
  return geo;
}
// All of a piece on one bone (jewellery, hats, glasses).
const rigidTo = (geo, m, bone, sway = null) => skin(geo, m, [[bone, 1]], { sway });

// ---------------------------------------------------------------------------------------------------------------
// Shapes shared by the templates

// A torso point at angle theta (0 = back, PI = front, PI/2 = left) on section s at height y.
function torsoPoint(s, theta, y, n = 2.25) {
  const e = 2 / n, si = Math.sin(theta), c = Math.cos(theta);
  return V(s.rx * Math.sign(si) * Math.abs(si) ** e, y, c >= 0 ? -s.rzb * Math.abs(c) ** e : s.rzf * Math.abs(c) ** e);
}

// Fabric over a bust bridges the cleavage and falls straight below it.
function bustLift(body, y, theta) {
  if (!body.bust) return 0;
  const dy = (y - body.chestY) / (y > body.chestY ? 0.065 : 0.1);
  const phi = theta - Math.PI;
  if (Math.abs(phi) < 0.52) return body.bust * Math.exp(-dy * dy);
  let w = 0;
  for (const side of [-1, 1]) { const d = phi - side * 0.52; w += Math.exp(-dy * dy - (d * d) / 0.11); }
  return body.bust * Math.min(w, 1);
}

// The garment's section at y: the body plus ease above the hips; below them, a skirt that hangs from the hips around
// both legs and flares (`flare` per metre), or tapers to the legs (`pencil`).
function sectionFn(body, e, { flare = 0, pencil = false, sleeveless = false, ripple = null, legRoom: room = 0 } = {}) {
  const hip = torsoAt(body, body.hipY), scale = body.height / 1.86;
  return y => {
    const s = torsoAt(body, y);
    let out = { rx: s.rx + e, rzf: s.rzf + e, rzb: s.rzb + e };
    let legRoom = room;
    if (y < body.hipY) { // below the hips cloth hangs from them, around both legs, never following the crotch in
      const d = body.hipY - y, legR = legAt(body, clamp(d / (body.hipY - body.ankleY), 0, 1)), ease = smooth(0, 0.12 * scale, d);
      const k = (pencil ? -0.16 : flare) * ease;
      legRoom *= ease;
      out = {
        // legRoom: space for wide trousers under a coat
        rx: Math.max(hip.rx + e + k * d, body.hipX * 0.92 + legR + e + legRoom * (0.2 + d)),
        rzf: Math.max(hip.rzf + e + k * 0.8 * d, legR + e + 0.012 * scale * ease + legRoom * (0.2 + d)),
        rzb: Math.max(hip.rzb + e + k * 0.85 * d, legR + e + 0.014 * scale * ease + legRoom * (0.2 + d)),
      };
    }
    if (sleeveless && y > body.chestY) out.rx = Math.min(out.rx, body.shoulderX - 0.01 * scale + (body.shoulderY - y) * 0.25);
    if (ripple) { const r = ripple(y); out.rx += r; out.rzf += r; out.rzb += r; }
    return out;
  };
}

// A torso piece from y0 (hem) to y1 (top). Options: v = { y0: depth of the V, w: half-angle } opens a V at the
// front; scoop lowers the front top; pleats = [count, depth]; rim turns the hem under so the edge has thickness.
function torsoPiece(body, e, y0, y1, opts = {}) {
  const sec = sectionFn(body, e, opts), n = 2.25;
  const steps = Math.max(8, Math.ceil((y1 - y0) / 0.011));
  const rings = torsoRings(sec, y0, y1, { steps, n });
  if (opts.rim !== false) {
    const s = sec(y0), inset = 0.006;
    rings.unshift({ ...rings[0], c: rings[0].c.clone().setY(y0 + 0.012), rx: s.rx - inset, rzf: s.rzb - inset, rzb: s.rzf - inset, y: y0 + 0.012 });
  }
  const { v, scoop, pleats } = opts;
  return loft(rings, {
    seg: 64,
    shape: (ring, theta, p) => {
      if (ring.y === undefined) return;
      let y = ring.y;
      const phi = Math.abs(theta - Math.PI);
      if (v && phi < v.w) {
        const vy = v.y0 + (y1 - v.y0) * (phi / v.w) ** (v.curve || 1);
        if (y > vy) { y = vy; p.copy(torsoPoint(sec(y), theta, y, n)); }
      }
      if (scoop && phi < scoop.w) {
        const sy = y1 - scoop.depth * Math.cos((phi / scoop.w) * Math.PI / 2);
        if (y > sy) { y = sy; p.copy(torsoPoint(sec(y), theta, y, n)); }
      }
      p.z += bustLift(body, y, theta);
      if (pleats && y < body.hipY) {
        const k = smooth(body.hipY, body.hipY - 0.12, y), saw = Math.abs(((theta * pleats[0]) / Math.PI) % 2 - 1);
        const dir = V(p.x, 0, p.z).normalize();
        p.addScaledVector(dir, pleats[1] * k * (saw - 0.5));
      }
    },
  });
}

// Rings along a polyline (arm or leg), radius r(t) with t the distance along it as a fraction of the whole.
function pathRings(points, r, { t0 = 0, t1 = 1, step = 0.012, n = 2, front = V(0, 0, 1) } = {}) {
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lens[lens.length - 1], rings = [];
  const steps = Math.max(4, Math.ceil(((t1 - t0) * total) / step));
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (t1 - t0) * (i / steps), d = t * total;
    let k = 1;
    while (k < points.length - 1 && lens[k] < d) k++;
    const a = points[k - 1], b = points[k], u = (d - lens[k - 1]) / (lens[k] - lens[k - 1]);
    const one = limbRings(a, b, r(t), { steps: 1, n, front })[0];
    one.c = new THREE.Vector3().lerpVectors(a, b, clamp(u, 0, 1));
    one.t = t;
    rings.push(one);
  }
  return rings;
}
function withRim(rings, inset, at = 'end') {
  const ref = at === 'end' ? rings[rings.length - 1] : rings[0], prev = at === 'end' ? rings[rings.length - 2] : rings[1];
  const back = new THREE.Vector3().subVectors(prev.c, ref.c).normalize().multiplyScalar(0.012);
  const rim = { ...ref, c: ref.c.clone().add(back), rx: ref.rx - inset, rzf: ref.rzf - inset, rzb: ref.rzb - inset };
  return at === 'end' ? [...rings, rim] : [rim, ...rings];
}

// Whole-arm and whole-leg geometry helpers (t over the full limb, as in body.js).
function armPath(m, s, startBack = 0.03) {
  const j = m.joints, dir = j[`armDir${s}`];
  return [j[`upperArm${s}`].clone().addScaledVector(dir, -startBack), j[`foreArm${s}`], j[`hand${s}`]];
}
function armT(m, s, d) { const b = m.body; return d / (b.upperArm + b.foreArm + 0.03); }
function legPath(m, s, up = 0.07) {
  const j = m.joints, hip = j[`thigh${s}`], knee = j[`shin${s}`];
  return [hip.clone().addScaledVector(new THREE.Vector3().subVectors(hip, knee).normalize(), up), knee, j[`foot${s}`]];
}

function sleeve(m, s, e, end, { flare = 0, ripple = null, cuff = 0 } = {}) {
  const b = m.body, path = armPath(m, s, 0.012), total = b.upperArm + b.foreArm + 0.012, startOff = 0.012 / total;
  const r = t => {
    const at = clamp((t - startOff) / (1 - startOff), 0, 1);
    let v = armAt(b, at) + e + flare * at;
    if (ripple) v += ripple(t * total);
    if (cuff && at > 0.9) v += cuff;
    return v;
  };
  // A rounded sleeve head covers the shoulder joint and tucks into the body of the garment.
  const rings = withRim(pathRings(path, r, { t1: clamp(end, 0.05, 1) }), 0.005);
  return loft(rings, { seg: 36, capStart: r(0) * 0.92 });
}

function trouserLeg(m, s, e, end, shape) {
  const b = m.body;
  const r = t => {
    const grow = smooth(0, 0.35, t); // extra width grows away from the hip, so the leg tops stay under the waist
    let v = legAt(b, t) + e;
    if (shape === 'wide') v += (0.014 + 0.06 * t) * grow;
    else if (shape === 'flared') v += 0.008 * grow + 0.06 * Math.max(0, t - 0.55) * 2;
    else if (shape === 'relaxed') v += 0.016 * grow;
    else if (shape === 'regular') v += (0.006 + 0.01 * t) * grow;
    const calf = smooth(0.5, 0.62, t) * (1 - smooth(0.8, 0.95, t)), knee = Math.exp(-(((t - 0.52) / 0.06) ** 2));
    return { rx: v + knee * 0.008, rzf: v * (1 - 0.06 * calf) + knee * 0.012, rzb: v * (1 + 0.12 * calf) + knee * 0.006 };
  };
  const path = legPath(m, s, 0.03);
  const rings = withRim(pathRings(path, r, { t1: clamp(end, 0.05, 1) }), 0.006);
  return loft(rings, { seg: 36 });
}

// Front closure: buttons down the centre (or two rows), or a zip.
function buttons(body, e, yTop, yBottom, { count, x = [0], r = 0.009, sec }) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? yTop : yTop - (yTop - yBottom) * (i / (count - 1));
    for (const dx of x) {
      const s = sec(y), theta = Math.PI - Math.asin(clamp(dx / s.rx, -1, 1));
      const p = torsoPoint(s, theta, y);
      p.z += bustLift(body, y, theta) + 0.003;
      geos.push(new THREE.CylinderGeometry(r, r, 0.004, 16).rotateX(Math.PI / 2).translate(p.x, p.y, p.z));
    }
  }
  return geos.length ? mergeGeometries(geos) : null;
}
function zip(body, sec, y0, y1) {
  const rings = [];
  const steps = Math.ceil((y1 - y0) / 0.01);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + (y1 - y0) * (i / steps), p = torsoPoint(sec(y), Math.PI, y);
    p.z += bustLift(body, y, Math.PI) + 0.002;
    pts.push(p);
  }
  for (const p of pts) rings.push({ c: p, ax: V(1, 0, 0), az: V(0, 0, -1), rx: 0.0045, rzf: 0.0015, rzb: 0.0015, n: 4 });
  return loft(rings, { seg: 12 });
}

// Collars and necklines.
function collar(m, kind, e, top) {
  const b = m.body, sc = b.height / 1.86, r0 = b.neckR;
  const band = (h, grow, arc = null, lean = 0) => {
    const rings = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, y = top - 0.006 + h * t;
      rings.push({ c: V(0, y, -0.006 - lean * t), ax: V(1, 0, 0), az: V(0, 0, -1), rx: r0 + grow + 0.004 * (1 - t), rzf: r0 + grow - 0.002, rzb: r0 + grow + 0.004 * (1 - t), n: 2 });
    }
    return loft(rings, { seg: 40, arc });
  };
  const leaf = (h, spread) => { // a turned-down collar leaf: from the band's top, down and out, open at the front
    const rings = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, y = top + 0.03 * sc - h * t;
      rings.push({ c: V(0, y, -0.008), ax: V(1, 0, 0), az: V(0, 0, -1), rx: r0 + 0.012 + spread * t, rzf: r0 + 0.008 + spread * t, rzb: r0 + 0.014 + spread * 0.6 * t, n: 2 });
    }
    return loft(rings, { seg: 40, arc: [-Math.PI * 0.82, Math.PI * 0.82] });
  };
  switch (kind) {
    case 'crew': return band(0.012 * sc, e + 0.004);
    case 'roll': return band(0.075 * sc, e + 0.016);
    case 'stand': return band(0.042 * sc, e + 0.012, [-Math.PI * 0.94, Math.PI * 0.94]);
    case 'polo': return mergeGeometries([band(0.028 * sc, e + 0.006), leaf(0.04 * sc, 0.03 * sc)]);
    case 'shirt': return mergeGeometries([band(0.032 * sc, e + 0.005), leaf(0.045 * sc, 0.034 * sc)]);
    case 'lapel': return band(0.03 * sc, e + 0.012, [-Math.PI * 0.6, Math.PI * 0.6], 0.004);
    case 'hood': { // hood down, folded on the upper back
      const rings = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, y = top - 0.03 * sc + 0.1 * sc * Math.sin(t * Math.PI * 0.55);
        rings.push({ c: V(0, y, -0.03 * sc - 0.02 * t), ax: V(1, 0, 0), az: V(0, 0, -1), rx: (0.13 - 0.03 * t) * sc + e, rzf: (0.09 - 0.02 * t) * sc + e, rzb: (0.12 + 0.02 * t) * sc + e, n: 2.2 });
      }
      return loft(rings, { seg: 40, arc: [-Math.PI * 0.7, Math.PI * 0.7], capEnd: 0.02 });
    }
    default: return null;
  }
}

// Lapels: a strip along each edge of a V, folded out over the chest.
function lapels(body, sec, vy, y1, w, width) {
  const geos = [];
  for (const side of [-1, 1]) {
    const pos = [], index = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N, phi = w * t, y = vy + (y1 - vy) * t;
      const lw = width * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * (t > 0.86 ? 0.45 : 1); // notch near the top
      for (const extra of [0, lw]) {
        const theta = Math.PI + side * (phi + extra), p = torsoPoint(sec(y), theta, y);
        p.z += bustLift(body, y, theta) + 0.004 + 0.003 * (extra > 0 ? 1 : 0);
        pos.push(p.x * (1 + 0.012), p.y, p.z);
      }
      if (i < N) { const a = i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: (pos.length / 3) * 2 }, (_, i) => (i % 2 ? pos[(i >> 1) * 3 + 1] : pos[(i >> 1) * 3])), 2));
    g.setIndex(index);
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

// Thin straps over the shoulders (slip dresses, swimsuits, bras).
function straps(m, e, frontY, backY) {
  const b = m.body, geos = [];
  for (const s of [-1, 1]) {
    const x = s * b.shoulderX * 0.55;
    const front = torsoPoint(torsoAt(b, frontY), Math.PI - s * 0.55, frontY), back = torsoPoint(torsoAt(b, backY), s * 0.55, backY);
    front.z += bustLift(b, frontY, Math.PI) + e;
    back.z -= e;
    const topS = torsoAt(b, b.shoulderY + 0.012);
    const over = V(x, b.shoulderY + 0.02 + e, 0);
    const pts = new THREE.CatmullRomCurve3([front, V(x, (frontY + over.y) / 2, topS.rzf + e + 0.01), over, V(x, (backY + over.y) / 2, -(topS.rzb + e + 0.01)), back]);
    geos.push(new THREE.TubeGeometry(pts, 24, 0.004, 6, false));
  }
  return geos;
}

// ---------------------------------------------------------------------------------------------------------------
// Garment assembly

function makeGarment(m, product, spec, opts) {
  const b = m.body, sc = b.height / 1.86;
  const g = {
    id: product.id, product, spec, parts: [], hangers: [], materials: {},
    reveal: { value: 0 }, top: { value: b.height }, bottom: { value: 0 },
    lift: 0, footPitch: 0, heelDrop: 0, glow: null,
  };
  const hex = opts.hex || (spec.palette && spec.palette[0]) || '#2b2b2b';
  g.materials.main = fabric(g, spec.material, spec.pattern, hex, { texture: opts.texture });
  g.add = (geo, matKey = 'main', skinOpts = null) => { if (geo) g.parts.push({ geo, matKey, skinOpts }); };
  g.sc = sc;
  return g;
}

const EASE = { 0: 0.0025, 1: 0.009, 2: 0.0145, 3: 0.021, 4: 0.025 }; // distance from the body per layer (m)
const SHAPE_EASE = { slim: 0, regular: 0.003, relaxed: 0.008, wide: 0.004, flared: 0.004, pencil: 0, puffer: 0.03 };

function hemY(b, hem) {
  const sc = b.height / 1.86, knee = b.hipY - b.thigh;
  return {
    crop: b.chestY - 0.07 * sc, waist: b.waistY - 0.01, hip: b.crotchY + 0.012 * sc, thigh: b.crotchY - 0.16 * sc,
    knee: knee + 0.03 * sc, midi: knee - 0.16 * sc, ankle: b.ankleY + 0.07 * sc,
  }[hem] || b.crotchY;
}
const TORSO_C = [['pelvis', 1], ['waist', 1], ['neck', 0.25]]; // the body of a garment follows the spine, not the arms
const SKIRT_C = f => [['pelvis', 1], ['waist', 0.6], ['thighL', f], ['thighR', f], ['shinL', f * 0.4], ['shinR', f * 0.4]];

// Torso clothing: tops, knitwear, jackets, coats, dresses, swimsuits and underwear.
function buildTorso(m, g, opts) {
  const b = m.body, s = g.spec, fit = s.fit, sc = g.sc, t = s.template;
  const e = EASE[s.layer] + (SHAPE_EASE[fit.shape] || 0) + (opts.sizeEase || 0);
  const top = b.neckY - 0.008;
  const y0 = t === 'bra' ? b.chestY - 0.075 * sc : t === 'swimsuit' ? b.crotchY - 0.03 * sc : hemY(b, fit.hem);
  const long = y0 < b.crotchY - 0.05;
  const flare = fit.shape === 'flared' ? 0.42 : fit.shape === 'wide' ? 0.2 : long ? 0.12 : 0.04;
  const quilt = fit.shape === 'puffer' ? y => 0.012 * sc * Math.abs(Math.sin((y * Math.PI) / (0.075 * sc))) : null;
  const sleeveless = fit.sleeve === 'none';
  const pieceOpts = { flare, pencil: fit.shape === 'pencil', sleeveless, ripple: quilt, legRoom: long && s.layer >= 3 ? 0.11 : 0 };
  const sec = sectionFn(b, e, pieceOpts);
  let y1 = top, v = null, scoop = null;
  if (['dress', 'swimsuit', 'bra'].includes(t)) {
    y1 = b.chestY + (t === 'bra' ? 0.045 : 0.07) * sc;
    scoop = { w: 1.2, depth: (t === 'dress' && fit.collar === 'v' ? 0.05 : 0.025) * sc };
  } else if (fit.collar === 'lapel') v = { y0: b.waistY + (t === 'coat' ? 0.08 : 0.05) * sc, w: 0.62 };
  else if (fit.collar === 'v') v = { y0: b.chestY - (t === 'waistcoat' ? 0.1 : 0.02) * sc, w: 0.55 };
  const pleats = s.pattern === 'pleated' ? [22, 0.02 * sc] : null;
  // Hems below the hips drape over the thighs a little as the legs move.
  const bodyC = long ? SKIRT_C(0.55) : y0 < b.hipY ? [...TORSO_C, ['thighL', 0.25], ['thighR', 0.25]] : TORSO_C;
  g.add(torsoPiece(b, e, y0, y1, { ...pieceOpts, v, scoop, pleats }), 'main', { cands: bodyC, power: 8, sway: p => smooth(b.hipY, y0, p.y) * (long ? 1 : 0.35) });
  if (t === 'swimsuit') g.add(legOpenings(m, e), 'main', { cands: SKIRT_C(0.8), power: 6 });

  // Sleeves
  const sleeveEnd = { short: 0.3, elbow: 0.56, long: 1.02 }[fit.sleeve];
  if (sleeveEnd) {
    const se = e * 0.85 + 0.003, flareS = fit.shape === 'relaxed' ? 0.008 : 0;
    for (const side of ['L', 'R']) {
      g.add(sleeve(m, side, se, sleeveEnd, { flare: flareS, ripple: quilt ? d => 0.01 * sc * Math.abs(Math.sin((d * Math.PI) / (0.07 * sc))) : null, cuff: fit.sleeve === 'long' && ['shirt', 'knit', 'sweatshirt', 'hoodie', 'tracksuit'].includes(t) ? 0.003 : 0 }), 'main',
        { cands: [['waist', 0.6], [`upperArm${side}`, 1], [`foreArm${side}`, 1], [`hand${side}`, 0.4]], power: 6 });
    }
  }
  // Straps for strappy pieces
  if (['dress', 'swimsuit', 'bra'].includes(t)) for (const st of straps(m, e, y1 - 0.01, y1 - 0.015)) g.add(st, 'main', { cands: [['waist', 1], ['upperArmL', 0.2], ['upperArmR', 0.2]] });
  // Collar
  const col = fit.collar === 'v' || fit.collar === 'none' ? null : collar(m, fit.collar, e, top);
  if (col) g.add(col, 'main', { cands: [['neck', 1], ['waist', 1]], power: 6 });
  if (fit.collar === 'lapel') for (const lp of lapels(b, sec, v.y0, top, v.w, t === 'coat' ? 0.5 : 0.42)) g.add(lp, 'main', { cands: [['waist', 1], ['pelvis', 0.4]], power: 8 });
  // Closure
  if (fit.closure === 'zip') g.add(zip(b, sec, y0 + 0.01, top - 0.002), 'metal', { cands: TORSO_C, power: 8 });
  else if (fit.closure === 'buttons' || fit.closure === 'double') {
    const from = v ? v.y0 : top - 0.03 * sc, small = ['shirt', 'polo'].includes(t);
    const count = small ? (t === 'polo' ? 2 : Math.max(3, Math.round((from - y0) / (0.085 * sc)))) : t === 'blazer' || t === 'suit' ? 2 : Math.max(2, Math.round((from - y0) / (0.11 * sc)));
    const bottom = small ? (t === 'polo' ? from - 0.06 * sc : y0 + 0.06 * sc) : t === 'blazer' || t === 'suit' ? from - 0.1 * sc : Math.max(y0 + 0.12 * sc, b.crotchY - 0.05);
    const x = fit.closure === 'double' ? [-0.055 * sc, 0.055 * sc] : [0];
    g.add(buttons(b, e, from - 0.012, bottom, { count: t === 'polo' ? 2 : count, x, r: small ? 0.0055 * sc : 0.011 * sc, sec }), 'button', { cands: long ? SKIRT_C(0.4) : TORSO_C, power: 8 });
  }
  g.top.value = top + 0.02;
  g.bottom.value = y0;
}

function legOpenings(m, e) { // a swimsuit's or briefs' seat: short leg cuffs so the cut reads from every angle
  const geos = [];
  for (const s of ['L', 'R']) geos.push(trouserLeg(m, s, e - 0.002, 0.06, 'slim'));
  return mergeGeometries(geos);
}

function buildBottom(m, g, opts) {
  const b = m.body, s = g.spec, fit = s.fit, sc = g.sc, t = s.template;
  // Bottoms sit a little closer than tops, so a shirt or knit falls over the waistband.
  const e = (t === 'briefs' ? EASE[0] : 0.004) + (SHAPE_EASE[fit.shape] || 0) * 0.5 + (opts.sizeEase || 0);
  if (t === 'skirt') {
    const y0 = hemY(b, fit.hem);
    const pleats = s.pattern === 'pleated' ? [24, 0.022 * sc] : null;
    g.add(torsoPiece(b, e, y0, b.waistY + 0.02 * sc, { flare: fit.shape === 'flared' ? 0.4 : 0.08, pencil: fit.shape === 'pencil', pleats }), 'main', { cands: SKIRT_C(0.6), power: 8, sway: p => smooth(b.hipY, y0, p.y) });
    g.add(torsoPiece(b, e + 0.003, b.waistY - 0.012 * sc, b.waistY + 0.026 * sc, { rim: false }), 'main', { cands: TORSO_C, power: 8 });
    g.top.value = b.waistY + 0.04;
    g.bottom.value = y0;
    return;
  }
  const end = { brief: 0.07, short: 0.27, knee: 0.47, long: 1.0 }[fit.leg] || 1;
  const topY = t === 'briefs' ? b.waistY - 0.05 * sc : b.waistY + 0.012 * sc;
  g.add(torsoPiece(b, e, b.crotchY - 0.02 * sc, topY, { rim: false }), 'main', { cands: [['pelvis', 1], ['waist', 0.4], ['thighL', 0.12], ['thighR', 0.12]], power: 8 });
  for (const side of ['L', 'R']) {
    g.add(trouserLeg(m, side, e, end, fit.shape), 'main', { cands: [['pelvis', 0.8], [`thigh${side}`, 1], [`shin${side}`, 1], [`foot${side}`, 0.25]], power: 5, sway: p => (fit.shape === 'wide' ? smooth(b.hipY - b.thigh, 0, p.y) * 0.35 : 0) });
  }
  // Crotch: closes the small gap where the two legs part.
  g.add(new THREE.SphereGeometry(1, 24, 16).scale(0.05 * sc, 0.045 * sc, 0.075 * sc).translate(0, b.crotchY - 0.004 * sc, 0), 'main', { cands: [['pelvis', 1], ['thighL', 0.5], ['thighR', 0.5]], power: 6 });
  if (t !== 'briefs' && t !== 'swim-shorts') g.add(torsoPiece(b, e + 0.0015, topY - 0.035 * sc, topY, { rim: false }), 'main', { cands: [['pelvis', 1], ['waist', 0.4]], power: 8 }); // waistband
  if (t === 'briefs') g.add(torsoPiece(b, e + 0.002, topY - 0.022 * sc, topY, { rim: false }), 'trim', { cands: [['pelvis', 1]], power: 8 });
  g.top.value = topY + 0.02;
  g.bottom.value = b.hipY - (b.hipY - b.ankleY) * end;
}

// ---------------------------------------------------------------------------------------------------------------
// Shoes: an upper around the foot, a sole, and for boots a shaft up the shin.
function buildShoes(m, g, opts) {
  const b = m.body, s = g.spec, t = s.template, sc = g.sc, name = String(g.product.name || '').toLowerCase();
  const grow = 0.0045 * sc;
  const soleT = { sneakers: 0.026, slides: 0.016, sandals: 0.012, boots: 0.016, heels: 0.006, oxfords: 0.011, loafers: 0.011 }[t] * sc;
  g.lift = soleT;
  if (t === 'heels') g.footPitch = 0.3;
  for (const side of ['L', 'R']) {
    const ankle = m.joints[`foot${side}`], cands = [[`foot${side}`, 1], [`shin${side}`, 0.08]];
    const L = b.footLen, W = b.footW;
    const covered = !['sandals', 'slides'].includes(t);
    if (covered) {
      const top = { sneakers: 1.12, boots: 1.1, oxfords: 1.02, loafers: 0.94, heels: 0.82 }[t] || 1;
      g.add(footGeometry(b, ankle, grow, { top, toe: t === 'heels' ? 1.07 : t === 'oxfords' ? 1.04 : 1 }), 'main', { cands, power: 6 });
    }
    // Sole: a flat, slightly wider slab under the foot.
    const heel = V(ankle.x, -soleT / 2, ankle.z - L * 0.2), tip = V(ankle.x, -soleT / 2, ankle.z + L * 0.8 * (t === 'heels' ? 1.07 : 1.02));
    const soleRings = limbRings(heel, tip, tt => ({ rx: W * curve([[0, 0.78], [0.3, 0.9], [0.68, 1.08], [0.88, 0.92], [1, 0.5]], tt) + grow + 0.003 * sc, rzf: soleT / 2, rzb: soleT / 2 }), { steps: 16, n: 4, front: V(0, 1, 0) });
    g.add(loft(soleRings, { seg: 28, capStart: W * 0.6, capEnd: W * 0.4 }), 'sole', { cands, power: 6 });
    if (t === 'oxfords' || t === 'loafers' || t === 'boots') { // stacked heel block
      const hb = new THREE.BoxGeometry(W * 1.5, 0.022 * sc, L * 0.24).translate(ankle.x, -soleT - 0.011 * sc, ankle.z - L * 0.08);
      g.add(hb, 'sole', { cands, power: 6 });
      g.lift = soleT + 0.022 * sc;
      g.heelDrop = 0.022 * sc;
    }
    if (t === 'heels') { // stiletto: vertical once the foot is pitched up on the ball
      const a = g.footPitch, H = V(0, 0, -L * 0.13), axis = V(0, -Math.cos(a), Math.sin(a));
      const heelTop = V(ankle.x, -0.002, ankle.z + H.z);
      // Rise of the heel above the toe when pitched by `a` about the ankle (the toe and the heel tip both touch down).
      const rise = (L * 0.78 - H.z) * Math.sin(a) - 0.004;
      const len = rise + 0.004;
      const stil = new THREE.CylinderGeometry(0.006 * sc, 0.0035 * sc, len, 12).translate(0, -len / 2, 0);
      stil.applyMatrix4(new THREE.Matrix4().makeRotationX(-a)).translate(heelTop.x, heelTop.y, heelTop.z);
      g.add(stil, 'sole', { cands, power: 6 });
      g.heelTip = heelTop.clone().addScaledVector(axis, len);
      if (s.pattern === 'crystal') g.add(new THREE.TorusGeometry(W * 0.75, 0.004, 8, 24, Math.PI).rotateY(Math.PI / 2).rotateZ(Math.PI / 2).translate(ankle.x, b.ankleY * 0.9, ankle.z - L * 0.12), 'metal', { cands, power: 6 });
    }
    if (t === 'sandals' || t === 'slides') {
      const bands = t === 'slides' ? [[0.38, 0.05]] : [[0.2, 0.012], [0.45, 0.012], [0.62, 0.01]];
      for (const [z, w] of bands) {
        const c = V(ankle.x, b.ankleY * 0.28, ankle.z - L * 0.2 + L * z);
        const ring = [];
        for (const dz of [-w / 2, w / 2]) ring.push({ c: c.clone().add(V(0, 0, dz)), ax: V(1, 0, 0), az: V(0, 1, 0), rx: W * 1.05 + grow, rzf: b.ankleY * (0.72 - z * 0.5) + grow, rzb: 0.004, n: 2.4 });
        g.add(loft(ring, { seg: 24, arc: [-Math.PI / 2, Math.PI / 2] }), 'main', { cands, power: 6 });
      }
      if (t === 'sandals') g.add(new THREE.TorusGeometry(legAt(b, 1) + 0.006, 0.004, 8, 28).rotateX(Math.PI / 2).translate(ankle.x, b.ankleY * 1.1, ankle.z), 'main', { cands, power: 6 });
    }
    if (t === 'loafers' && /horsebit|chain/.test(name)) g.add(new THREE.CylinderGeometry(0.003, 0.003, W * 1.3, 8).rotateZ(Math.PI / 2).translate(ankle.x, b.ankleY * 0.95, ankle.z + L * 0.25), 'metal', { cands, power: 6 });
    if (t === 'boots') {
      const knee = m.joints[`shin${side}`], total = b.hipY - b.ankleY;
      const height = s.fit.leg === 'knee' ? b.hipY - b.thigh - 0.05 * sc : b.ankleY + 0.15 * sc;
      const tShin = y => (b.hipY - y) / total; // whole-leg t at height y
      const pts = [V(ankle.x, b.ankleY * 0.55, ankle.z - 0.004), V(knee.x, height, knee.z)];
      const rings = withRim(limbRings(pts[0], pts[1], tt => { const y = pts[0].y + (pts[1].y - pts[0].y) * tt; const v = legAt(b, tShin(y)) + 0.009 * sc; return { rx: v, rzf: v * 0.95, rzb: v * 1.1 }; }, { steps: 14 }), 0.004);
      g.add(loft(rings, { seg: 32 }), 'main', { cands: [[`foot${side}`, 0.6], [`shin${side}`, 1], [`thigh${side}`, 0.15]], power: 6 });
    }
  }
  if (/light-up/.test(name)) g.glow = 'sole';
  g.top.value = s.fit.leg === 'knee' ? b.hipY - b.thigh : b.ankleY * 2.6;
  g.bottom.value = -0.03;
}

// ---------------------------------------------------------------------------------------------------------------
// Accessories, jewellery and bags
function buildAccessory(m, g, opts) {
  const b = m.body, s = g.spec, t = s.template, sc = g.sc, j = m.joints, name = String(g.product.name || '').toLowerCase();
  const hr = b.headR, headC = V(0, b.headY + hr[1] * 0.78, 0.012);
  const outerE = 0.03 * sc; // over whatever is worn
  switch (t) {
    case 'necklace': {
      if (/pearl|choker/.test(name)) {
        const geos = [], R = b.neckR + 0.008, y = b.neckY + 0.004, N = 26;
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; geos.push(new THREE.SphereGeometry(0.0062 * sc, 12, 8).translate(Math.sin(a) * R, y - Math.cos(a) * 0.006, Math.cos(a) * R * 1.02)); }
        g.materials.pearl = fabric(g, 'pearl', 'solid', '#f3eee4', { side: THREE.FrontSide });
        g.add(mergeGeometries(geos), 'pearl', { bone: 'neck' });
        g.add(new THREE.SphereGeometry(0.012 * sc, 16, 12).translate(0, y - 0.016 * sc, b.neckR + 0.014), 'main', { bone: 'neck' });
      } else {
        const s0 = torsoAt(b, b.neckY - 0.03), pts = [];
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2, front = Math.max(0, Math.cos(a));
          pts.push(V(Math.sin(a) * (s0.rx * 0.82 + outerE * 0.3), b.neckY - 0.03 - front * front * 0.13 * sc, Math.cos(a) >= 0 ? Math.cos(a) * (s0.rzf + 0.02 + front * 0.05 * sc) : Math.cos(a) * (s0.rzb + 0.012)));
        }
        g.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 80, 0.0022 * sc, 6, true), 'main', { bone: 'waist' });
        const low = pts[0];
        g.add(new THREE.CylinderGeometry(0.019 * sc, 0.019 * sc, 0.004, 32).rotateX(Math.PI / 2).translate(low.x, low.y - 0.022 * sc, low.z + 0.008), 'main', { bone: 'waist' });
      }
      g.top.value = b.neckY + 0.03; g.bottom.value = b.chestY;
      break;
    }
    case 'earrings': {
      for (const sx of [-1, 1]) {
        const ear = V(sx * hr[0] * 0.97, b.headY + hr[1] * 0.62, 0.006);
        if (/hoop/.test(name)) g.add(new THREE.TorusGeometry(0.016 * sc, 0.0022, 8, 32).rotateY(Math.PI / 2).translate(ear.x, ear.y - 0.016 * sc, ear.z), 'main', { bone: 'head' });
        else {
          g.add(new THREE.SphereGeometry(0.0045 * sc, 12, 8).translate(ear.x, ear.y, ear.z), 'main', { bone: 'head' });
          g.add(new THREE.OctahedronGeometry(0.009 * sc).scale(0.8, 1.6, 0.8).translate(ear.x, ear.y - 0.022 * sc, ear.z), 'crystal', { bone: 'head' });
        }
      }
      g.top.value = b.headY + hr[1]; g.bottom.value = b.headY;
      break;
    }
    case 'sunglasses': {
      const ey = headC.y + hr[1] * 0.05, ez = headC.z + hr[2] * 0.93, k = hr[0] / 0.082, cat = /cat/.test(name);
      for (const sx of [-1, 1]) {
        const lens = new THREE.SphereGeometry(1, 24, 16).scale(0.026 * k, (cat ? 0.018 : 0.021) * k, 0.005).rotateZ(cat ? sx * -0.18 : 0).translate(sx * 0.031 * k, ey, ez + 0.004);
        g.add(lens, 'lens', { bone: 'head' });
        g.add(new THREE.TorusGeometry(1, 0.08, 6, 32).scale(0.027 * k, (cat ? 0.019 : 0.022) * k, 1).rotateZ(cat ? sx * -0.18 : 0).translate(sx * 0.031 * k, ey, ez + 0.005), 'main', { bone: 'head' });
        const temple = new THREE.CylinderGeometry(0.0018, 0.0018, hr[2] * 1.05, 6).rotateX(Math.PI / 2).translate(sx * hr[0] * 0.98, ey + 0.004, headC.z + hr[2] * 0.4);
        g.add(temple, 'main', { bone: 'head' });
      }
      g.add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.014 * k, 6).rotateZ(Math.PI / 2).translate(0, ey + 0.006, ez + 0.006), 'main', { bone: 'head' });
      g.top.value = ey + 0.04; g.bottom.value = ey - 0.04;
      break;
    }
    case 'cap': {
      const crown = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2).scale(hr[0] * 1.1, hr[1] * 0.78, hr[2] * 1.12).translate(headC.x, headC.y + hr[1] * 0.2, headC.z - 0.004);
      g.add(crown, 'main', { bone: 'head' });
      g.add(new THREE.CylinderGeometry(hr[0] * 1.15, hr[0] * 1.15, 0.006, 32, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 0.95).rotateX(0.12).translate(headC.x, headC.y + hr[1] * 0.22, headC.z + hr[2] * 0.62), 'main', { bone: 'head' });
      g.add(new THREE.SphereGeometry(0.008, 10, 6).translate(headC.x, headC.y + hr[1] * 0.98, headC.z - 0.004), 'main', { bone: 'head' });
      g.top.value = headC.y + hr[1]; g.bottom.value = headC.y;
      break;
    }
    case 'fedora': {
      const base = headC.y + hr[1] * 0.3;
      const crownRings = [];
      for (let i = 0; i <= 8; i++) { const tt = i / 8; crownRings.push({ c: V(0, base + tt * 0.11 * sc, headC.z - 0.004), ax: V(1, 0, 0), az: V(0, 0, -1), rx: hr[0] * (1.12 - 0.12 * tt) + (tt > 0.85 ? -0.01 : 0), rzf: hr[2] * (1.12 - 0.15 * tt), rzb: hr[2] * (1.12 - 0.12 * tt), n: 2.4 }); }
      g.add(loft(crownRings, { seg: 40, capEnd: 0.012 }), 'main', { bone: 'head' });
      g.add(new THREE.CylinderGeometry(hr[0] * 2.05, hr[0] * 2.05, 0.005, 48).scale(1, 1, 1.05).translate(0, base + 0.004, headC.z - 0.004), 'main', { bone: 'head' });
      g.add(new THREE.CylinderGeometry(hr[0] * 1.13, hr[0] * 1.13, 0.02 * sc, 40, 1, true).translate(0, base + 0.014 * sc, headC.z - 0.004), 'trim', { bone: 'head' });
      g.top.value = base + 0.12; g.bottom.value = base;
      break;
    }
    case 'gloves': {
      for (const side of ['L', 'R']) {
        const wrist = j[`hand${side}`], end = j[`handEnd${side}`], dir = j[`armDir${side}`], hrr = armAt(b, 1) + 0.003;
        const sx = side === 'L' ? 1 : -1;
        g.add(loft(limbRings(wrist.clone().addScaledVector(dir, -0.07 * sc), end, tt => { const hand = Math.max(0, (tt - 0.28) / 0.72); return { rx: tt < 0.28 ? armAt(b, 0.93 + tt * 0.25) + 0.005 : hrr * curve([[0, 0.95], [0.35, 1.55], [0.7, 1.35], [1, 0.8]], hand) + 0.003, rzf: tt < 0.28 ? armAt(b, 0.93) + 0.005 : hrr * curve([[0, 0.85], [0.4, 0.62], [1, 0.4]], hand) + 0.003, rzb: tt < 0.28 ? armAt(b, 0.93) + 0.005 : hrr * curve([[0, 0.85], [0.4, 0.62], [1, 0.4]], hand) + 0.003 }; }, { steps: 16, n: 2.3, front: V(sx, 0, 0) }), { seg: 28, capEnd: hrr * 0.7 }), 'main', { cands: [[`hand${side}`, 1], [`foreArm${side}`, 0.6]], power: 6 });
        const thumbA = wrist.clone().addScaledVector(dir, b.hand * 0.22).add(V(0, 0, hrr * 0.9)), thumbB = thumbA.clone().addScaledVector(dir, b.hand * 0.42).add(V(0, 0, hrr * 0.35));
        g.add(loft(limbRings(thumbA, thumbB, hrr * 0.38, { steps: 4 }), { seg: 14, capStart: hrr * 0.32, capEnd: hrr * 0.32 }), 'main', { bone: `hand${side}` });
      }
      g.top.value = j.handL.y + 0.08; g.bottom.value = j.handEndL.y - 0.02;
      break;
    }
    case 'watch': case 'bracelet': case 'cufflinks': {
      const sides = t === 'cufflinks' ? ['L', 'R'] : t === 'watch' ? ['L'] : ['R'];
      for (const side of sides) {
        const sx = side === 'L' ? 1 : -1, dir = j[`armDir${side}`], at = j[`hand${side}`].clone().addScaledVector(dir, -0.035 * sc);
        const r = armAt(b, 0.96) + (t === 'cufflinks' ? 0.012 : 0.006) * sc;
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
        if (t === 'cufflinks') {
          g.add(new THREE.CylinderGeometry(0.0065 * sc, 0.0065 * sc, 0.004, 20).rotateX(Math.PI / 2).translate(at.x, at.y, at.z + r), 'main', { bone: `foreArm${side}` });
          continue;
        }
        const band = new THREE.TorusGeometry(r, (t === 'watch' ? 0.0045 : /leather|wrap/.test(name) ? 0.0035 : 0.003) * sc, 8, 40).scale(0.82, 1, 1).rotateX(Math.PI / 2).applyQuaternion(q).translate(at.x, at.y, at.z);
        g.add(band, 'main', { bone: `foreArm${side}` });
        if (t === 'bracelet' && /wrap/.test(name)) g.add(band.clone().translate(dir.x * 0.012, dir.y * 0.012, dir.z * 0.012), 'main', { bone: `foreArm${side}` });
        if (t === 'watch') {
          const face = new THREE.CylinderGeometry(0.019 * sc, 0.019 * sc, 0.009, 36).rotateZ(Math.PI / 2).translate(at.x + sx * (r + 0.003), at.y, at.z);
          g.add(face, 'main', { bone: `foreArm${side}` });
          g.add(new THREE.CylinderGeometry(0.016 * sc, 0.016 * sc, 0.002, 36).rotateZ(Math.PI / 2).translate(at.x + sx * (r + 0.0081), at.y, at.z), 'dial', { bone: `foreArm${side}` });
        }
      }
      const yy = j.handL.y;
      g.top.value = yy + 0.06; g.bottom.value = yy - 0.06;
      break;
    }
    case 'ring': {
      const side = 'R', sx = -1, dir = j.armDirR, p = j.handR.clone().addScaledVector(dir, b.hand * 0.68);
      const r = armAt(b, 1) * 0.42;
      g.add(new THREE.TorusGeometry(0.0085 * sc, 0.0022, 8, 24).rotateY(Math.PI / 2).translate(p.x + sx * r * 1.05, p.y, p.z + 0.004), 'main', { bone: `hand${side}` });
      g.add(new THREE.BoxGeometry(0.004, 0.009, 0.009).translate(p.x + sx * (r * 1.05 + 0.009), p.y, p.z + 0.004), s.pattern === 'crystal' ? 'crystal' : 'main', { bone: `hand${side}` });
      g.top.value = p.y + 0.03; g.bottom.value = p.y - 0.03;
      break;
    }
    case 'belt': {
      const y = b.waistY - 0.032 * sc, e = 0.011; // on the trousers' waistband, under shirts and jackets
      g.add(torsoPiece(b, e, y - 0.017 * sc, y + 0.017 * sc, { rim: false }), 'main', { cands: [['pelvis', 1], ['waist', 0.3]], power: 8 });
      const s0 = torsoAt(b, y);
      g.add(new THREE.BoxGeometry(0.05 * sc, 0.038 * sc, 0.006).translate(0, y, s0.rzf + e + 0.006), 'metal', { bone: 'pelvis' });
      g.top.value = y + 0.03; g.bottom.value = y - 0.03;
      break;
    }
    case 'tie': {
      const pos = [], index = [], uvs = [], N = 30, yTop = b.neckY - 0.012, yBot = b.waistY - 0.02 * sc;
      for (let i = 0; i <= N; i++) {
        const tt = i / N, y = yTop - (yTop - yBot) * tt;
        const half = (0.016 + 0.026 * tt) * sc * (tt > 0.95 ? (1 - tt) / 0.05 : 1);
        const sec = torsoAt(b, y), z = sec.rzf + EASE[1] + 0.006 + bustLift(b, y, Math.PI);
        pos.push(-half, y, z, half, y, z);
        uvs.push(0, tt * 0.5, half * 2, tt * 0.5);
        if (i < N) { const a = i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const blade = new THREE.BufferGeometry();
      blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      blade.setIndex(index);
      blade.computeVertexNormals();
      g.add(blade, 'main', { cands: [['waist', 1], ['pelvis', 0.3]], power: 8, sway: p => smooth(b.chestY, yBot, p.y) * 0.3 });
      g.add(new THREE.SphereGeometry(1, 16, 12).scale(0.016 * sc, 0.016 * sc, 0.01).translate(0, yTop + 0.004, torsoAt(b, yTop).rzf + 0.016), 'main', { bone: 'waist' });
      g.top.value = yTop + 0.02; g.bottom.value = yBot;
      break;
    }
    case 'scarf': {
      const long = /cashmere|logo/.test(name), y = b.neckY - 0.01, R = b.neckR + 0.03 * sc;
      g.add(new THREE.TorusGeometry(R, 0.024 * sc, 14, 40).scale(1, 1, 0.9).rotateX(Math.PI / 2).translate(0, y, -0.004), 'main', { cands: [['neck', 1], ['waist', 1]], power: 6 });
      const endLen = (long ? 0.42 : 0.16) * sc;
      for (const sx of [-1, 1]) {
        const x0 = sx * 0.045 * sc, len = endLen * (sx > 0 ? 1 : 0.86), pos = [], index = [], uvs = [], N = 18;
        for (let i = 0; i <= N; i++) {
          const tt = i / N, yy = y - 0.02 - len * tt, sec = torsoAt(b, yy), z = sec.rzf + EASE[3] + 0.018 + bustLift(b, yy, Math.PI) + 0.01 * tt;
          const w = 0.03 * sc + 0.01 * tt;
          pos.push(x0 - w, yy, z, x0 + w, yy, z + 0.002);
          uvs.push(0, len * tt, w * 2, len * tt);
          if (i < N) { const a = i * 2; index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const panel = new THREE.BufferGeometry();
        panel.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        panel.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        panel.setIndex(index);
        panel.computeVertexNormals();
        g.add(panel, 'main', { cands: [['waist', 1], ['neck', 0.5]], power: 6, sway: p => smooth(y, y - len, p.y) * 0.9 });
      }
      g.top.value = y + 0.04; g.bottom.value = y - endLen;
      break;
    }
    case 'backpack': {
      const k = (/mini/.test(name) ? 0.72 : 1) * sc, out = EASE[3] + 0.012;
      const y1 = b.shoulderY - 0.06 * sc, y0 = y1 - 0.36 * k, zc = -(torsoAt(b, b.chestY).rzb + 0.065 * k + out);
      const rings = [];
      for (let i = 0; i <= 8; i++) { const tt = i / 8; rings.push({ c: V(0, y0 + (y1 - y0) * tt, zc), ax: V(1, 0, 0), az: V(0, 0, -1), rx: 0.15 * k * (1 - 0.1 * tt), rzf: 0.06 * k, rzb: 0.06 * k, n: 5 }); }
      g.add(loft(rings, { seg: 40, capStart: 0.03 * k, capEnd: 0.05 * k }), 'main', { bone: 'waist' });
      for (const sx of [-1, 1]) {
        const top = torsoAt(b, b.shoulderY - 0.03 * sc), chest = torsoAt(b, b.chestY), x = sx * b.shoulderX * 0.52;
        const pts = [V(sx * 0.07 * k, y1 - 0.02 * k, zc + 0.05 * k), V(x, b.shoulderY + 0.012 * sc + out, -top.rzb * 0.4), V(x, b.shoulderY + 0.012 * sc + out, top.rzf * 0.4), V(sx * b.shoulderX * 0.62, b.chestY + 0.05 * sc, chest.rzf + out + bustLift(b, b.chestY + 0.05 * sc, Math.PI - sx * 0.6)), V(sx * chest.rx * 0.98 + sx * out, b.chestY - 0.08 * sc, 0), V(sx * 0.11 * k, y0 + 0.04 * k, zc + 0.05 * k)];
        g.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.008 * sc, 6, false), 'trim', { cands: [['waist', 1], [`upperArm${sx > 0 ? 'L' : 'R'}`, 0.12]], power: 6 });
      }
      g.top.value = y1 + 0.05; g.bottom.value = y0;
      break;
    }
    case 'handbag': case 'briefcase': case 'wallet': {
      const side = t === 'briefcase' ? 'R' : 'L', dir = j[`armDir${side}`];
      const grip = j[`hand${side}`].clone().addScaledVector(dir, b.hand * 0.5);
      const k = Math.min(1, b.height / 1.7);
      const geos = [];
      if (t === 'wallet') {
        geos.push([new THREE.BoxGeometry(0.02, 0.095 * k, 0.11 * k).translate(0, -0.01, 0.045), 'main']);
        g.hangers.push({ bone: `hand${side}`, grip, parts: geos, hang: false });
      } else {
        const W = (t === 'briefcase' ? 0.4 : /chain|shoulder/.test(name) ? 0.24 : 0.28) * k, H = (t === 'briefcase' ? 0.29 : 0.2) * k, D = (t === 'briefcase' ? 0.075 : 0.11) * k;
        const handleH = (/chain|shoulder/.test(name) ? 0.22 : t === 'briefcase' ? 0.06 : 0.11) * k;
        const rings = [];
        for (let i = 0; i <= 10; i++) { const tt = i / 10; rings.push({ c: V(0, -handleH - H + H * tt, 0), ax: V(0, 0, 1), az: V(1, 0, 0), rx: (W / 2) * (1 - 0.08 * tt), rzf: (D / 2) * (1 - 0.15 * tt), rzb: (D / 2) * (1 - 0.15 * tt), n: 6 }); }
        geos.push([loft(rings, { seg: 48, capStart: 0.012, capEnd: 0.012 }), 'main']);
        if (/chain|shoulder/.test(name)) {
          const pts = [V(0, -handleH, -W * 0.36), V(0, -handleH * 0.4, -W * 0.18), V(0, 0, 0), V(0, -handleH * 0.4, W * 0.18), V(0, -handleH, W * 0.36)];
          geos.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.003, 6, false), 'metal']);
        } else {
          geos.push([new THREE.TorusGeometry(Math.min(handleH * 0.95, W * 0.32), 0.006 * k, 10, 32, Math.PI).rotateY(Math.PI / 2).scale(1, handleH / Math.min(handleH * 0.95, W * 0.32), 1).translate(0, -handleH, 0), 'trim']);
        }
        geos.push([new THREE.BoxGeometry(D * 0.2, H * 0.12, W * 0.12).translate(D / 2 + 0.002, -handleH - H * 0.35, 0), 'metal']); // clasp
        g.hangers.push({ bone: `hand${side}`, grip, parts: geos, hang: true });
      }
      g.top.value = grip.y + 0.05; g.bottom.value = grip.y - 0.6;
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Public: build a garment for a product on this mannequin. Returns an object with `meshes` (SkinnedMeshes and
// hanging pivots to add), its materials (colour changes), and fit facts the fitting room uses (sole lift, heel pitch).
export function buildGarment(m, product, opts = {}) {
  const spec = product.wearable;
  if (!spec) return null;
  const g = makeGarment(m, product, spec, opts);
  const hex = opts.hex || '#2b2b2b', name = opts.colorName || '';
  const group = spec.group;
  g.materials.main = mainMaterial(g, hex, name, opts.texture);
  const darkHex = new THREE.Color(hex).multiplyScalar(0.55).getHexString();
  g.materials.trim = plain(g, `#${darkHex}`, { roughness: 0.6 });
  g.materials.metal = plain(g, METAL.gold, { roughness: 0.22, metalness: 1 });
  g.materials.button = plain(g, new THREE.Color(hex).getHSL({}).l > 0.6 ? '#e9e4d8' : '#1c1915', { roughness: 0.3, clearcoat: 0.8 });
  g.materials.sole = plain(g, spec.template === 'sneakers' ? (new THREE.Color(hex).getHSL({}).l > 0.85 ? '#ebe7dd' : '#f4f2ec') : '#24190f', { roughness: 0.65 });
  g.materials.lens = plain(g, '#0d0d10', { roughness: 0.04, metalness: 0.2, clearcoat: 1, opacity: 0.92, transparent: true });
  g.materials.dial = plain(g, '#0b0c10', { roughness: 0.15, clearcoat: 1 });
  g.materials.crystal = plain(g, '#ffffff', { roughness: 0, metalness: 0, transmission: 0.6, ior: 2.2, thickness: 0.01, iridescence: 0.4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12 });
  if (g.glow) g.materials.sole.emissive = new THREE.Color('#ff3d9a');

  if (group === 'clothing') {
    if (['trousers', 'jeans', 'shorts', 'skirt', 'briefs', 'swim-shorts'].includes(spec.template)) buildBottom(m, g, opts);
    else if (spec.template === 'suit' || spec.template === 'tracksuit') {
      const top = { ...spec, template: spec.template === 'suit' ? 'blazer' : 'jacket' };
      g.spec = top; buildTorso(m, g, opts);
      const [t1, b1] = [g.top.value, g.bottom.value];
      g.spec = { ...spec, template: 'trousers', fit: { ...spec.fit, leg: 'long', shape: spec.template === 'suit' ? 'slim' : 'relaxed' } };
      buildBottom(m, g, opts);
      g.spec = spec; g.top.value = t1; g.bottom.value = Math.min(b1, g.bottom.value);
    } else buildTorso(m, g, opts);
  } else if (group === 'shoes') buildShoes(m, g, opts);
  else buildAccessory(m, g, opts);

  // Turn parts into meshes: skinned pieces share the mannequin's skeleton; hanging pieces swing from a pivot.
  const identity = new THREE.Matrix4();
  g.meshes = [];
  const byMat = new Map();
  for (const part of g.parts) {
    const o = part.skinOpts || {};
    if (!part.geo.attributes.uv) part.geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(part.geo.attributes.position.count * 2), 2));
    if (o.bone) rigidTo(part.geo, m, o.bone, o.sway);
    else skin(part.geo, m, o.cands || TORSO_C, { power: o.power || 6, sway: o.sway });
    if (!part.geo.attributes.normal) part.geo.computeVertexNormals();
    if (!byMat.has(part.matKey)) byMat.set(part.matKey, []);
    byMat.get(part.matKey).push(part.geo);
  }
  for (const [key, geos] of byMat) {
    const keep = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aSway'];
    for (const geo of geos) for (const a of Object.keys(geo.attributes)) if (!keep.includes(a)) geo.deleteAttribute(a);
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    const mesh = new THREE.SkinnedMesh(merged, g.materials[key] || g.materials.main);
    mesh.bind(m.skeleton, identity);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.garment = g;
    g.meshes.push(mesh);
  }
  for (const h of g.hangers) {
    const bone = m.bones[h.bone], pivot = new THREE.Group();
    pivot.position.copy(h.grip).applyMatrix4(m.skeleton.boneInverses[m.order.indexOf(bone)]);
    for (const [geo, key] of h.parts) {
      const mesh = new THREE.Mesh(geo, g.materials[key] || g.materials.main);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.garment = g;
      pivot.add(mesh);
    }
    pivot.userData.hang = h.hang;
    pivot.userData.bone = bone;
    pivot.userData.garment = g;
    g.meshes.push(pivot);
    h.pivot = pivot;
  }

  g.setColor = (newHex, colorName, texture = null) => {
    const fresh = mainMaterial(g, newHex, colorName, texture);
    for (const mesh of g.meshes) mesh.traverse(o => { if (o.isMesh && o.material === g.materials.main) o.material = fresh; });
    g.materials.main.dispose();
    g.materials.main = fresh;
  };
  g.dispose = () => {
    for (const mesh of g.meshes) mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    for (const mat of Object.values(g.materials)) mat.dispose();
  };
  return g;
}

// The piece's main material in a colour: jewellery and watches are metal in Gold / Silver / Rose Gold (other colours
// are enamel or onyx); sunglasses are acetate or metal; clothing, shoes and bags are their fabric.
function mainMaterial(g, hex, colorName, texture) {
  const s = g.spec, metal = metalHex(colorName, null);
  const metalPiece = (s.group === 'jewellery' || ['watch', 'cufflinks'].includes(s.template)) && !['leather', 'pearl'].includes(s.material);
  if (metalPiece) return metal ? fabric(g, s.material === 'steel' ? 'steel' : 'gold', 'solid', metal, { side: THREE.FrontSide }) : fabric(g, 'patent', 'solid', hex, { side: THREE.FrontSide });
  if (s.template === 'sunglasses') return metal ? fabric(g, 'gold', 'solid', metal) : fabric(g, 'acetate', 'solid', hex);
  return fabric(g, s.material, s.pattern, hex, { texture });
}
