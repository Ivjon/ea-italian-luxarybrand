// The mannequin's body: proportions for man, woman and child, the skeleton the poses move, and the glossy
// segmented body built from lofted cross-sections. Garments (garments.js) are fitted to the same measurements.
// Units are metres, Y is up, the mannequin faces +Z, its left side is +X.
import * as THREE from './vendor/three.module.min.js';

// Torso cross-sections: [y, half-width, half-depth front, half-depth back]. Joint heights and limb radii along the
// limb (0 = top joint, 1 = end). Women's busts are added on top of the sections (bust).
export const BODIES = {
  man: {
    label: 'Man', height: 1.86, headR: [0.082, 0.112, 0.098], neckR: 0.056,
    crotchY: 0.905, hipY: 0.955, waistY: 1.115, chestY: 1.32, shoulderY: 1.475, neckY: 1.55, headY: 1.63,
    shoulderX: 0.198, hipX: 0.092, upperArm: 0.305, foreArm: 0.268, hand: 0.185, thigh: 0.455, shin: 0.445, ankleY: 0.072,
    footLen: 0.255, footW: 0.047, armSpread: 7,
    torso: [[0.875, 0.06, 0.05, 0.06], [0.905, 0.135, 0.085, 0.105], [0.955, 0.172, 0.095, 0.122], [1.02, 0.168, 0.095, 0.112], [1.115, 0.148, 0.098, 0.095], [1.21, 0.16, 0.112, 0.1], [1.32, 0.178, 0.122, 0.104], [1.41, 0.19, 0.11, 0.1], [1.475, 0.19, 0.085, 0.085], [1.515, 0.13, 0.07, 0.072], [1.55, 0.062, 0.058, 0.058]],
    arm: [[0, 0.054], [0.25, 0.049], [0.52, 0.041], [0.56, 0.039], [0.7, 0.04], [1, 0.027]],
    leg: [[0, 0.088], [0.25, 0.08], [0.5, 0.065], [0.53, 0.05], [0.66, 0.056], [0.8, 0.046], [1, 0.033]],
  },
  woman: {
    label: 'Woman', height: 1.78, headR: [0.076, 0.104, 0.092], neckR: 0.046, bust: 0.04,
    crotchY: 0.865, hipY: 0.925, waistY: 1.075, chestY: 1.265, shoulderY: 1.415, neckY: 1.49, headY: 1.565,
    shoulderX: 0.172, hipX: 0.09, upperArm: 0.285, foreArm: 0.245, hand: 0.168, thigh: 0.445, shin: 0.418, ankleY: 0.068,
    footLen: 0.232, footW: 0.04, armSpread: 8,
    torso: [[0.835, 0.06, 0.05, 0.06], [0.865, 0.14, 0.085, 0.11], [0.925, 0.178, 0.095, 0.13], [0.99, 0.17, 0.092, 0.115], [1.075, 0.122, 0.082, 0.085], [1.16, 0.135, 0.09, 0.088], [1.265, 0.148, 0.1, 0.092], [1.35, 0.158, 0.09, 0.088], [1.415, 0.165, 0.075, 0.075], [1.455, 0.11, 0.06, 0.062], [1.49, 0.052, 0.048, 0.048]],
    arm: [[0, 0.045], [0.25, 0.04], [0.52, 0.033], [0.56, 0.032], [0.7, 0.033], [1, 0.023]],
    leg: [[0, 0.09], [0.25, 0.078], [0.5, 0.058], [0.53, 0.046], [0.66, 0.05], [0.8, 0.04], [1, 0.029]],
  },
  kid: {
    label: 'Kids', height: 1.25, headR: [0.078, 0.1, 0.09], neckR: 0.036,
    crotchY: 0.57, hipY: 0.615, waistY: 0.73, chestY: 0.85, shoulderY: 0.945, neckY: 0.995, headY: 1.06,
    shoulderX: 0.128, hipX: 0.062, upperArm: 0.195, foreArm: 0.17, hand: 0.12, thigh: 0.29, shin: 0.278, ankleY: 0.047,
    footLen: 0.17, footW: 0.032, armSpread: 9,
    torso: [[0.545, 0.04, 0.035, 0.04], [0.57, 0.09, 0.065, 0.075], [0.615, 0.112, 0.072, 0.082], [0.67, 0.112, 0.074, 0.076], [0.73, 0.106, 0.076, 0.07], [0.79, 0.11, 0.08, 0.072], [0.85, 0.118, 0.082, 0.074], [0.91, 0.124, 0.074, 0.07], [0.945, 0.124, 0.06, 0.06], [0.972, 0.085, 0.048, 0.05], [0.995, 0.042, 0.038, 0.038]],
    arm: [[0, 0.036], [0.25, 0.032], [0.52, 0.027], [0.56, 0.026], [0.7, 0.027], [1, 0.02]],
    leg: [[0, 0.06], [0.25, 0.054], [0.5, 0.042], [0.53, 0.034], [0.66, 0.038], [0.8, 0.032], [1, 0.024]],
  },
};

// Catmull-Rom through [t, value] points (clamped at the ends): smooth curves from a handful of numbers.
export function curve(points, t) {
  if (t <= points[0][0]) return points[0][1];
  const last = points.length - 1;
  if (t >= points[last][0]) return points[last][1];
  let i = 0;
  while (i < last - 1 && t > points[i + 1][0]) i++;
  const p0 = points[Math.max(i - 1, 0)][1], p1 = points[i][1], p2 = points[i + 1][1], p3 = points[Math.min(i + 2, last)][1];
  const u = (t - points[i][0]) / (points[i + 1][0] - points[i][0]), u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

// The body's torso section at height y: { rx, rzf, rzb } (half-width, half-depth to the front and to the back).
export function torsoAt(body, y) {
  const col = k => body.torso.map(s => [s[0], s[k]]);
  return { rx: curve(col(1), y), rzf: curve(col(2), y), rzb: curve(col(3), y) };
}
export const armAt = (body, t) => curve(body.arm, t); // t over the whole arm: upper arm 0–0.53, forearm to 1
export const legAt = (body, t) => curve(body.leg, t); // t over the whole leg: thigh 0–0.51, shin to 1

// Rest-pose joints (in the mannequin's own space) and limb directions.
export function joints(body) {
  const a = THREE.MathUtils.degToRad(body.armSpread);
  const j = {
    pelvis: new THREE.Vector3(0, body.hipY + 0.04, 0),
    waist: new THREE.Vector3(0, body.waistY, 0),
    neck: new THREE.Vector3(0, body.neckY - 0.01, 0),
    head: new THREE.Vector3(0, body.headY, 0.004),
  };
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    const armDir = new THREE.Vector3(s * Math.sin(a), -Math.cos(a), 0);
    j[`upperArm${side}`] = new THREE.Vector3(s * body.shoulderX, body.shoulderY - 0.022, -0.004);
    j[`foreArm${side}`] = j[`upperArm${side}`].clone().addScaledVector(armDir, body.upperArm);
    j[`hand${side}`] = j[`foreArm${side}`].clone().addScaledVector(armDir, body.foreArm);
    j[`handEnd${side}`] = j[`hand${side}`].clone().addScaledVector(armDir, body.hand);
    j[`armDir${side}`] = armDir;
    j[`thigh${side}`] = new THREE.Vector3(s * body.hipX, body.hipY, 0);
    j[`shin${side}`] = new THREE.Vector3(s * body.hipX * 0.92, body.hipY - body.thigh, 0.004);
    j[`foot${side}`] = new THREE.Vector3(s * body.hipX * 0.86, body.ankleY, -0.004);
  }
  return j;
}

// Bone tree: name -> parent. Each bone sits at its joint; its segment runs to its child joint (used for skin weights).
export const BONES = [
  ['pelvis', null], ['waist', 'pelvis'], ['neck', 'waist'], ['head', 'neck'],
  ['upperArmL', 'waist'], ['foreArmL', 'upperArmL'], ['handL', 'foreArmL'],
  ['upperArmR', 'waist'], ['foreArmR', 'upperArmR'], ['handR', 'foreArmR'],
  ['thighL', 'pelvis'], ['shinL', 'thighL'], ['footL', 'shinL'],
  ['thighR', 'pelvis'], ['shinR', 'thighR'], ['footR', 'shinR'],
];

// Segment (start, end) of each bone in the rest pose, for skin weights and for picking.
export function segments(body, j) {
  const seg = {
    pelvis: [new THREE.Vector3(0, body.crotchY + 0.02, 0), j.waist],
    waist: [j.waist, new THREE.Vector3(0, body.shoulderY, 0)],
    neck: [j.neck, j.head],
    head: [j.head, new THREE.Vector3(0, body.headY + body.headR[1] * 1.6, 0)],
  };
  for (const s of ['L', 'R']) {
    seg[`upperArm${s}`] = [j[`upperArm${s}`], j[`foreArm${s}`]];
    seg[`foreArm${s}`] = [j[`foreArm${s}`], j[`hand${s}`]];
    seg[`hand${s}`] = [j[`hand${s}`], j[`handEnd${s}`]];
    seg[`thigh${s}`] = [j[`thigh${s}`], j[`shin${s}`]];
    seg[`shin${s}`] = [j[`shin${s}`], j[`foot${s}`]];
    seg[`foot${s}`] = [j[`foot${s}`], j[`foot${s}`].clone().add(new THREE.Vector3(0, -body.ankleY * 0.6, body.footLen * 0.62))];
  }
  return seg;
}

// ---------------------------------------------------------------------------------------------------------------
// Loft: a tube through a list of rings. Each ring has a centre, two axes (side `ax`, front `az`), half-sizes
// (rx, rzf front, rzb back) and a squareness `n` (2 = ellipse, higher = rounded box). UVs are in metres (u around,
// v along), so fabric textures keep the same scale on every piece. `shape(ring, theta, p)` may move a point.
// Optional rounded caps close the ends.
const _p = new THREE.Vector3();
export function loft(rings, { seg = 40, capStart = 0, capEnd = 0, shape = null, arc = null } = {}) {
  const all = [...rings];
  const capRings = (ring, len, dirSign, count = 5) => {
    const out = [];
    const axis = new THREE.Vector3().crossVectors(ring.ax, ring.az).normalize().multiplyScalar(dirSign);
    for (let i = 1; i <= count; i++) {
      const phi = (i / count) * Math.PI / 2, k = Math.cos(phi);
      out.push({ ...ring, c: ring.c.clone().addScaledVector(axis, Math.sin(phi) * len), rx: ring.rx * k + 1e-4, rzf: ring.rzf * k + 1e-4, rzb: ring.rzb * k + 1e-4, cap: true });
    }
    return out;
  };
  // Rings run from start to end; a cap's direction is along the loft (ax × az points along the loft for our axes).
  if (capStart) all.unshift(...capRings(rings[0], capStart, -1).reverse());
  if (capEnd) all.push(...capRings(rings[rings.length - 1], capEnd, 1));

  const cols = seg + 1, pos = new Float32Array(all.length * cols * 3), uv = new Float32Array(all.length * cols * 2);
  let along = 0;
  all.forEach((ring, r) => {
    if (r) along += ring.c.distanceTo(all[r - 1].c);
    const n = ring.n || 2, e = 2 / n, circ = Math.PI * (ring.rx + (ring.rzf + ring.rzb) / 2);
    for (let k = 0; k < cols; k++) {
      const theta = arc ? arc[0] + (arc[1] - arc[0]) * (k / seg) : (k / seg) * Math.PI * 2, s = Math.sin(theta), c = Math.cos(theta);
      const x = ring.rx * Math.sign(s) * Math.abs(s) ** e, z = (c >= 0 ? ring.rzf : ring.rzb) * Math.sign(c) * Math.abs(c) ** e;
      _p.copy(ring.c).addScaledVector(ring.ax, x).addScaledVector(ring.az, z);
      if (shape) shape(ring, theta, _p, r, all.length);
      const i = r * cols + k;
      pos.set([_p.x, _p.y, _p.z], i * 3);
      uv.set([(arc ? (arc[1] - arc[0]) / (Math.PI * 2) : 1) * (k / seg) * circ, along], i * 2);
    }
  });
  const index = [];
  for (let r = 0; r < all.length - 1; r++) {
    for (let k = 0; k < seg; k++) {
      const a = r * cols + k, b = a + 1, c = a + cols, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // The seam column is duplicated for the UVs: give both copies the same normal so no seam shows in the gloss.
  const nrm = g.attributes.normal;
  for (let r = 0; r < (arc ? 0 : all.length); r++) {
    const a = r * cols, b = a + seg;
    _p.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, _p.x, _p.y, _p.z);
    nrm.setXYZ(b, _p.x, _p.y, _p.z);
  }
  g.userData.rings = all.length;
  g.userData.cols = cols;
  return g;
}

// Rings along a straight segment from a to b, radius r(t) (a number or {rx, rzf, rzb}).
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);
export function limbRings(a, b, r, { steps = 14, t0 = 0, t1 = 1, n = 2, front = FWD } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const ax = new THREE.Vector3().crossVectors(dir, front);
  if (ax.lengthSq() < 1e-6) ax.crossVectors(dir, UP);
  ax.normalize();
  // az faces `front`; ax × az must point along the loft (faces wind outward, caps go the right way).
  const az = new THREE.Vector3().crossVectors(dir, ax).normalize().negate();
  if (az.dot(front) < 0) az.negate();
  if (new THREE.Vector3().crossVectors(ax, az).dot(dir) < 0) ax.negate();
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + (t1 - t0) * (i / steps), v = typeof r === 'function' ? r(t) : r;
    const rr = typeof v === 'number' ? { rx: v, rzf: v, rzb: v } : v;
    rings.push({ c: new THREE.Vector3().lerpVectors(a, b, t), ax, az, ...rr, n, t });
  }
  return rings;
}

// Rings up the torso from y0 to y1 (axis Y, side X, front Z), from a section function y -> {rx, rzf, rzb}.
export function torsoRings(sectionAt, y0, y1, { steps = 40, n = 2.25 } = {}) {
  const rings = [];
  const ax = new THREE.Vector3(1, 0, 0), az = new THREE.Vector3(0, 0, -1); // ax × az = +Y (up)
  for (let i = 0; i <= steps; i++) {
    const y = y0 + (y1 - y0) * (i / steps), s = sectionAt(y);
    // az points back here, so front/back half-depths swap.
    rings.push({ c: new THREE.Vector3(0, y, s.cz || 0), ax, az, rx: s.rx, rzf: s.rzb, rzb: s.rzf, n: s.n || n, y });
  }
  return rings;
}

// Women's bust, pushed out of the chest's front (theta = PI is the front in torsoRings, since its az points back).
export function bustShape(body) {
  if (!body.bust) return null;
  return (ring, theta, p) => {
    if (ring.y === undefined) return;
    const dy = (ring.y - body.chestY) / 0.065;
    for (const side of [-1, 1]) {
      const d = theta - (Math.PI + side * 0.52);
      const w = Math.exp(-dy * dy - (d * d) / 0.11);
      if (w > 1e-3) p.z += body.bust * w;
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The skeleton and the glossy body. Returns { root, bones, skeleton, joints, segments, body, meshes }.
export function buildMannequin(kind, material) {
  const body = BODIES[kind];
  const j = joints(body), seg = segments(body, j);
  const bones = {};
  for (const [name, parent] of BONES) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones[name] = bone;
    if (parent) {
      bone.position.subVectors(j[name], j[parent]);
      bones[parent].add(bone);
    } else bone.position.copy(j[name]);
  }
  const root = new THREE.Group();
  root.add(bones.pelvis);
  root.updateMatrixWorld(true);
  const order = BONES.map(([n]) => bones[n]);
  const skeleton = new THREE.Skeleton(order);
  skeleton.calculateInverses();

  const meshes = [];
  const add = (boneName, geometry) => {
    const bone = bones[boneName];
    geometry.applyMatrix4(skeleton.boneInverses[order.indexOf(bone)]);
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.bone = boneName;
    bone.add(m);
    meshes.push(m);
    return m;
  };
  const ball = (boneName, at, r) => add(boneName, new THREE.SphereGeometry(r, 28, 18).translate(at.x, at.y, at.z));

  // Torso in two pieces that meet at the waist, so the waist can bend.
  const bust = bustShape(body);
  const section = y => torsoAt(body, y);
  const bottom = body.torso[0][0];
  add('pelvis', loft(torsoRings(section, bottom + 0.02, body.waistY + 0.012, { steps: 22 }), { seg: 48, capStart: 0.025 }));
  add('waist', loft(torsoRings(section, body.waistY - 0.012, body.neckY, { steps: 34 }), { seg: 48, shape: bust }));
  ball('waist', new THREE.Vector3(0, body.waistY, 0), torsoAt(body, body.waistY).rx * 0.62);

  // Neck and the abstract egg head.
  add('neck', loft(limbRings(new THREE.Vector3(0, body.neckY - 0.035, -0.006), new THREE.Vector3(0, body.headY + 0.01, 0.002), body.neckR, { steps: 6 }), { seg: 32 }));
  const head = new THREE.SphereGeometry(1, 48, 36);
  head.scale(body.headR[0], body.headR[1], body.headR[2]);
  head.rotateX(-0.12);
  head.translate(0, body.headY + body.headR[1] * 0.78, 0.012);
  add('head', head);

  for (const s of ['L', 'R']) {
    const shoulder = j[`upperArm${s}`], elbow = j[`foreArm${s}`], wrist = j[`hand${s}`], handEnd = j[`handEnd${s}`];
    const ua = body.upperArm, fa = body.foreArm, total = ua + fa;
    const armR = t => armAt(body, t);
    add(`upperArm${s}`, loft(limbRings(shoulder, elbow, t => armR((t * ua) / total), { steps: 14 }), { seg: 32, capStart: armR(0) * 0.9, capEnd: armR(0.53) * 0.7 }));
    add(`foreArm${s}`, loft(limbRings(elbow, wrist, t => armR((ua + t * fa) / total), { steps: 14 }), { seg: 32, capStart: armR(0.53) * 0.6, capEnd: armR(1) * 0.6 }));
    ball(`upperArm${s}`, shoulder, armR(0) * 1.02);
    ball(`foreArm${s}`, elbow, armR(0.53) * 0.9);
    // Hand: a flattened, slightly cupped paddle with a thumb (fingers together, as on display mannequins).
    const hr = armR(1);
    add(`hand${s}`, loft(limbRings(wrist, handEnd, t => ({ rx: hr * curve([[0, 0.95], [0.35, 1.55], [0.7, 1.35], [1, 0.8]], t), rzf: hr * curve([[0, 0.85], [0.4, 0.62], [1, 0.4]], t), rzb: hr * curve([[0, 0.85], [0.4, 0.62], [1, 0.4]], t) }), { steps: 10, n: 2.4, front: new THREE.Vector3(s === 'L' ? 1 : -1, 0, 0) }), { seg: 28, capEnd: hr * 0.7 }));
    const dir = j[`armDir${s}`], thumbA = wrist.clone().addScaledVector(dir, body.hand * 0.22).add(new THREE.Vector3(0, 0, hr * 0.9));
    const thumbB = thumbA.clone().addScaledVector(dir, body.hand * 0.42).add(new THREE.Vector3(0, 0, hr * 0.35));
    add(`hand${s}`, loft(limbRings(thumbA, thumbB, hr * 0.34, { steps: 4 }), { seg: 16, capStart: hr * 0.3, capEnd: hr * 0.3 }));
    ball(`hand${s}`, wrist, hr * 0.92);

    const hip = j[`thigh${s}`], knee = j[`shin${s}`], ankle = j[`foot${s}`];
    const th = body.thigh, sh = body.hipY - body.thigh - body.ankleY, legTotal = th + sh;
    const legR = t => legAt(body, t);
    add(`thigh${s}`, loft(limbRings(hip, knee, t => legR((t * th) / legTotal), { steps: 16 }), { seg: 36, capStart: legR(0) * 0.8, capEnd: legR(0.51) * 0.75 }));
    add(`shin${s}`, loft(limbRings(knee, ankle, t => { const v = legR((th + t * sh) / legTotal); return { rx: v, rzf: v * 0.92, rzb: v * 1.12 }; }, { steps: 16 }), { seg: 36, capStart: legR(0.51) * 0.6, capEnd: legR(1) * 0.6 }));
    ball(`thigh${s}`, hip, legR(0) * 0.86);
    ball(`shin${s}`, knee, legR(0.51) * 0.86);
    add(`foot${s}`, footGeometry(body, ankle, 0));
    ball(`foot${s}`, ankle, legR(1) * 0.95);
  }
  return { root, bones, skeleton, order, joints: j, segments: seg, body, meshes, kind };
}

// A foot (or a shoe around it, with `grow`): a loft from heel to toe with a flat sole on the ground.
export function footGeometry(body, ankle, grow = 0, { lift = 0, toe = 1, top = 1 } = {}) {
  const L = body.footLen, W = body.footW, H = body.ankleY;
  const heel = new THREE.Vector3(ankle.x, H * 0.48 + lift, ankle.z - L * 0.2), tip = new THREE.Vector3(ankle.x, H * 0.36 + lift, ankle.z + L * 0.8 * toe);
  const rings = limbRings(heel, tip, t => ({
    rx: W * curve([[0, 0.72], [0.3, 0.88], [0.68, 1.05], [0.88, 0.9], [1, 0.45]], t) + grow,
    rzf: H * top * curve([[0, 0.68], [0.25, 1.05], [0.55, 0.62], [0.85, 0.4], [1, 0.25]], t) + grow, // up
    rzb: H * curve([[0, 0.48], [0.5, 0.42], [1, 0.28]], t) + grow * 0.5, // down, to a flat sole
  }), { steps: 18, n: 2.6, front: new THREE.Vector3(0, 1, 0) });
  return loft(rings, { seg: 32, capStart: W * 0.6 + grow, capEnd: W * 0.35 + grow });
}
