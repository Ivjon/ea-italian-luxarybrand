// The 3D fitting room: a glossy black mannequin (man, woman or child) on white, which turns, poses and wears any
// piece in the store. Mounted on the product page (app.js) and in the CRM's wearable agent (admin/wearable-agent.js).
//
//   const room = await mountFitting(element, { products, t, mode: 'store' | 'crm', onOpenProduct });
//   room.wear(product, { colorIndex, size }); room.setBody('woman'); room.setPose('walk'); room.dispose();
//
// Drag empty space to turn the mannequin (it keeps turning slowly when left alone); drag an arm, a leg, the head or
// the torso to pose it. Pinch or the +/− buttons zoom (the mouse wheel zooms in full screen, so the page still scrolls).
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { buildMannequin, BODIES } from './body.js';
import { buildGarment, shared } from './garments.js';
import { POSES, LIMITS, poseQuats, clampBone } from './poses.js';
import { dotTexture, contactShadowTexture } from './textures.js';

const KINDS = ['man', 'woman', 'kid'];
const GROUPS = [['all', 'All'], ['clothing', 'Clothing'], ['shoes', 'Shoes'], ['bags', 'Bags'], ['jewellery', 'Jewellery'], ['accessories', 'Accessories']];
const LETTER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SMALL = ['ring', 'earrings', 'watch', 'bracelet', 'cufflinks', 'sunglasses'];
const BASE_TOP = 0.018;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The mannequin that suits a product (Kids pieces on the child, and so on); null for unisex pieces.
export const kindFor = p => ({ Kids: 'kid', Women: 'woman', Men: 'man' }[p && p.category] || null);

export function mountFitting(container, opts = {}) {
  return new FittingRoom(container, opts);
}

// Looser or closer fit for the size chosen on the product page (M is the mannequin's size).
function sizeEase(size) {
  const i = LETTER.indexOf(String(size || '').toUpperCase());
  return i < 0 ? 0 : THREE.MathUtils.clamp((i - 3) * 0.006, -0.012, 0.03);
}

const ICONS = {
  turn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M17.5 3.5v3.2h-3.2M6.5 20.5v-3.2h3.2"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  hanger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5a2 2 0 1 1 2-2M12 7.5v2L3 16.5h18L12 9.5"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 1 0 2.1-5M5 4v4h4"/></svg>',
};

class FittingRoom {
  constructor(el, { products = [], t = s => s, mode = 'store', onOpenProduct = null, storageKey = 'ea-fitting' } = {}) {
    this.el = el;
    this.products = products;
    this.t = (s, v) => (v ? Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, x), t(s)) : t(s));
    this.mode = mode;
    this.onOpenProduct = onOpenProduct;
    this.storageKey = storageKey;
    this.outfit = new Map(); // product id -> { product, colorIndex, size, garment }
    this.leaving = []; // garments fading out
    this.textures = new Map();
    this.kind = 'man';
    this.poseName = 'stand';
    this.yaw = -0.35;
    this.pitch = 0.08;
    this.zoom = 1;
    this.focusY = null;
    this.autoTurn = !reducedMotion();
    this.idleSince = performance.now();
    this.yawVel = 0;
    this.omega = 0;
    this.clock = new THREE.Clock();
    this.pointers = new Map();
    this.sparks = [];
    this.running = false;
    this.visible = true;
    this.disposed = false;
    this.restore();
    this.buildDom();
    try {
      this.initThree();
    } catch (err) {
      console.error(err);
      this.ui.innerHTML = `<p class="fit-error">${esc(this.t('Your browser cannot show the 3D fitting room. Try another browser, or turn on hardware acceleration.'))}</p>`;
      this.failed = true;
      return;
    }
    this.setBody(this.kind, { quiet: true });
    this.bindEvents();
    this.start();
  }

  // ------------------------------------------------------------------------------------------------- persistence
  restore() {
    if (this.mode !== 'store') return;
    try {
      const s = JSON.parse(sessionStorage.getItem(this.storageKey) || 'null');
      if (!s) return;
      if (KINDS.includes(s.kind)) this.kind = s.kind;
      if (POSES[s.pose]) this.poseName = s.pose;
      this.saved = Array.isArray(s.items) ? s.items : [];
      this.kindChosen = !!s.kindChosen;
    } catch {}
  }
  persist() {
    if (this.mode !== 'store') return;
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify({ kind: this.kind, kindChosen: this.kindChosen, pose: this.poseName, items: [...this.outfit.values()].map(x => ({ id: x.product.id, colorIndex: x.colorIndex, size: x.size })) }));
    } catch {}
  }

  // ------------------------------------------------------------------------------------------------- DOM
  buildDom() {
    const t = this.t;
    this.el.classList.add('fit');
    this.el.innerHTML = `<div class="fit-canvas" tabindex="0" role="img" aria-label="${esc(t('3D mannequin. Drag to turn it, drag a limb to pose it.'))}"></div>
<div class="fit-ui">
  <div class="fit-top">
    <div class="fit-seg" role="group" aria-label="${esc(t('Mannequin'))}">${KINDS.map(k => `<button type="button" data-kind="${k}">${esc(t(BODIES[k].label))}</button>`).join('')}</div>
    <div class="fit-tools">
      <button type="button" class="fit-icon" data-act="turn" aria-pressed="true" aria-label="${esc(t('Turn slowly'))}" title="${esc(t('Turn slowly'))}">${ICONS.turn}</button>
      <button type="button" class="fit-icon" data-act="reset" aria-label="${esc(t('Reset view and pose'))}" title="${esc(t('Reset view and pose'))}">${ICONS.reset}</button>
      <button type="button" class="fit-icon" data-act="full" aria-pressed="false" aria-label="${esc(t('Full screen'))}" title="${esc(t('Full screen'))}">${ICONS.full}</button>
    </div>
  </div>
  <div class="fit-zoom"><button type="button" class="fit-icon" data-act="zoom-in" aria-label="${esc(t('Zoom in'))}">${ICONS.plus}</button><button type="button" class="fit-icon" data-act="zoom-out" aria-label="${esc(t('Zoom out'))}">${ICONS.minus}</button></div>
  <div class="fit-bottom">
    <div class="fit-poses" role="group" aria-label="${esc(t('Pose'))}">${Object.entries(POSES).map(([k, p]) => `<button type="button" data-pose="${k}">${esc(t(p.label))}</button>`).join('')}</div>
    ${this.mode === 'store' ? `<button type="button" class="fit-outfit-btn" data-act="outfit" aria-expanded="false">${ICONS.hanger}<span>${esc(t('Outfit'))}</span><b class="fit-count">0</b></button>` : ''}
  </div>
  <p class="fit-hint" aria-hidden="true"></p>
  <p class="fit-status" role="status"></p>
  ${this.mode === 'store' ? `<aside class="fit-drawer" aria-label="${esc(t('Outfit'))}" hidden>
    <div class="fit-drawer-head"><h3>${esc(t('Your look'))}</h3><button type="button" class="fit-icon" data-act="outfit-close" aria-label="${esc(t('Close'))}">${ICONS.close}</button></div>
    <ul class="fit-worn"></ul>
    <div class="fit-add">
      <h4>${esc(t('Add pieces'))}</h4>
      <input type="search" class="fit-search" placeholder="${esc(t('Search the store'))}" aria-label="${esc(t('Search the store'))}" autocomplete="off">
      <div class="fit-tabs" role="group">${GROUPS.map(([k, l], i) => `<button type="button" data-group="${k}" aria-pressed="${i === 0}">${esc(t(l))}</button>`).join('')}</div>
      <div class="fit-grid"></div>
    </div>
    <button type="button" class="fit-clear" data-act="clear">${esc(t('Take everything off'))}</button>
  </aside>` : ''}
  <div class="fit-loading"><span></span>${esc(t('Dressing the mannequin…'))}</div>
</div>`;
    this.canvasBox = this.el.querySelector('.fit-canvas');
    this.ui = this.el.querySelector('.fit-ui');
    this.status = this.el.querySelector('.fit-status');
    this.hint = this.el.querySelector('.fit-hint');
    this.group = 'all';
    this.query = '';
    this.syncHint();
  }

  syncHint() {
    const coarse = matchMedia('(pointer: coarse)').matches, full = this.el.classList.contains('fit-full');
    this.hint.textContent = coarse && !full ? this.t('Swipe to turn · open full screen to pose') : this.t('Drag to turn · drag a limb to pose');
  }

  announce(text) {
    this.status.textContent = text;
  }

  // ------------------------------------------------------------------------------------------------- three.js
  initThree() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setClearColor(0xffffff, 1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.02;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.canvasBox.append(r.domElement);
    r.domElement.style.touchAction = 'pan-y';

    const scene = (this.scene = new THREE.Scene());
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(2.2, 4.4, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 2.3, bottom: -0.3, near: 0.5, far: 12 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 3.2);
    rim.position.set(-2.6, 3.2, -3.4);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xfff2e2, 1.3);
    rim2.position.set(3.2, 1.6, -2.2);
    scene.add(rim2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e5dc, 0.55));

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, depthWrite: false }));
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.001;
    scene.add(contact);

    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.2, sheenColor: new THREE.Color(0x444444) });
    this.turntable = new THREE.Group();
    scene.add(this.turntable);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.355, BASE_TOP, 72), this.bodyMat);
    base.position.y = BASE_TOP / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    this.turntable.add(base);

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
    this.target = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.camDist = 5;
    this.raycaster = new THREE.Raycaster();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvasBox);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.start(); });
    this.io.observe(this.el);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvasBox.clientWidth), h = Math.max(1, this.canvasBox.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  // Camera distance that fits the whole mannequin (taller on phones, where the view is narrow).
  fitDistance() {
    const H = this.m ? this.m.body.height : 1.86, tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const byHeight = (H * 0.58) / tanH, byWidth = (0.5 * Math.max(H, 1.4) / 1.86) / (tanH * this.camera.aspect);
    return Math.max(byHeight, byWidth);
  }

  // ------------------------------------------------------------------------------------------------- mannequin
  setBody(kind, { quiet = false, chosen = false } = {}) {
    if (!KINDS.includes(kind) || this.failed) return;
    if (chosen) this.kindChosen = true;
    this.kind = kind;
    if (this.m) {
      this.turntable.remove(this.m.root);
      for (const mesh of this.m.meshes) mesh.geometry.dispose();
      for (const item of this.outfit.values()) if (item.garment) { this.detach(item.garment); item.garment.dispose(); item.garment = null; }
    }
    this.m = buildMannequin(kind, this.bodyMat);
    this.turntable.add(this.m.root);
    const j = this.m.joints, L = this.m.body.footLen;
    this.markers = {};
    for (const s of ['L', 'R']) {
      const a = j[`foot${s}`], bone = this.m.bones[`foot${s}`], inv = this.m.skeleton.boneInverses[this.m.order.indexOf(bone)];
      this.markers[s] = { bone, rest: [new THREE.Vector3(a.x, 0, a.z + L * 0.6), new THREE.Vector3(a.x, 0, a.z - L * 0.17), new THREE.Vector3(a.x, 0.004, a.z + L * 0.78)], inv };
    }
    this.pose = poseQuats(this.m, this.poseName);
    this.tween = null;
    this.target.set(0, this.m.body.height * 0.5, 0);
    this.camTarget.copy(this.target);
    this.camDist = this.fitDistance() / this.zoom;
    for (const item of this.outfit.values()) this.dress(item, { animate: false });
    this.el.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
    this.el.querySelectorAll('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === this.poseName)));
    if (!quiet) this.announce(this.t('{k} mannequin', { k: this.t(BODIES[kind].label) }));
    this.persist();
    this.kick();
  }

  setPose(name) {
    if (!POSES[name] || !this.m) return;
    this.poseName = name;
    const to = poseQuats(this.m, name), from = {};
    for (const k of Object.keys(to)) from[k] = this.pose[k].clone();
    this.tween = { from, to, t: 0, dur: reducedMotion() ? 0.01 : 0.7 };
    this.el.querySelectorAll('[data-pose]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === name)));
    this.announce(this.t('Pose: {p}', { p: this.t(POSES[name].label) }));
    this.persist();
    this.kick();
  }

  // ------------------------------------------------------------------------------------------------- outfit
  productById(id) {
    return this.products.find(p => p.id === id);
  }

  // Puts a piece on (replacing whatever holds the same place on the body). Re-wearing a worn piece changes its colour
  // or size. `kind`: choose the mannequin that suits the piece the first time.
  wear(product, { colorIndex = 0, size = '', suggestBody = true } = {}) {
    if (this.failed || !product || !product.wearable) return;
    if (this.saved) { // the look from earlier in the visit comes back with the first piece
      const saved = this.saved;
      this.saved = null;
      for (const s of saved) { const p = this.productById(s.id); if (p && p.id !== product.id) this.wear(p, { colorIndex: s.colorIndex, size: s.size, suggestBody: false }); }
    }
    const want = kindFor(product);
    if (suggestBody && want && want !== this.kind && !this.kindChosen && this.outfit.size === 0) this.setBody(want, { quiet: true });
    const existing = this.outfit.get(product.id);
    if (existing) {
      const resize = existing.size !== size;
      existing.colorIndex = colorIndex;
      existing.size = size;
      if (resize) { this.detach(existing.garment, true); existing.garment = null; this.dress(existing, { animate: false }); }
      else this.applyColor(existing);
      this.persist();
      return;
    }
    const slots = product.wearable.slots || [];
    for (const [id, item] of this.outfit) if ((item.product.wearable.slots || []).some(s => slots.includes(s))) this.takeOff(id, { quiet: true });
    const first = this.outfit.size === 0, item = { product, colorIndex, size, garment: null };
    this.outfit.set(product.id, item);
    this.dress(item, { animate: true });
    if (first && SMALL.includes(product.wearable.template) && this.focusY === null) this.focus(item.garment); // a ring on its own: zoom in
    this.announce(this.t('Wearing {name}', { name: product.name }));
    this.syncOutfit();
    this.persist();
  }

  takeOff(id, { quiet = false } = {}) {
    const item = this.outfit.get(id);
    if (!item) return;
    this.outfit.delete(id);
    if (item.garment) this.detach(item.garment, true);
    if (!quiet) this.announce(this.t('Took off {name}', { name: item.product.name }));
    this.syncOutfit();
    this.persist();
  }

  clear() {
    for (const id of [...this.outfit.keys()]) this.takeOff(id, { quiet: true });
    this.announce(this.t('The mannequin is bare'));
  }

  colorOf(item) {
    const colors = item.product.colors || [], c = colors[item.colorIndex] || colors[0] || {};
    const spec = item.product.wearable;
    return { hex: c.hex || (spec.palette && spec.palette[0]) || '#2b2b2b', name: c.name || '' };
  }

  // The agent's fabric swatch is the main colour's real cloth: used when that colour is chosen.
  textureFor(item) {
    const src = item.product.wearable.texture;
    if (!src || item.colorIndex !== 0) return null;
    if (!this.textures.has(src)) {
      const tex = new THREE.TextureLoader().load(src, () => { this.applyColor(item); this.kick(); });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(1 / 0.22, 1 / 0.22);
      tex.anisotropy = 4;
      this.textures.set(src, tex);
      return null;
    }
    const tex = this.textures.get(src);
    return tex.image ? tex : null;
  }

  dress(item, { animate }) {
    const { hex, name } = this.colorOf(item);
    let g;
    try {
      g = buildGarment(this.m, item.product, { hex, colorName: name, sizeEase: sizeEase(item.size), texture: this.textureFor(item) });
    } catch (err) {
      console.error('Could not dress', item.product.id, err);
      return;
    }
    if (!g) return;
    item.garment = g;
    for (const mesh of g.meshes) {
      if (mesh.userData.hang !== undefined) mesh.userData.bone.add(mesh);
      else this.m.root.add(mesh);
    }
    g.reveal.value = animate && !reducedMotion() ? 0 : 1;
    g.fading = animate && !reducedMotion() ? 1 : 0;
    if (g.fading) this.sparkle(g);
    this.kick();
  }

  applyColor(item) {
    if (!item.garment) return;
    const { hex, name } = this.colorOf(item);
    item.garment.setColor(hex, name, this.textureFor(item));
    this.kick();
  }

  detach(g, animate = false) {
    if (!g) return;
    if (animate && !reducedMotion()) {
      g.fading = -1;
      this.leaving.push(g);
    } else this.removeMeshes(g);
    this.kick();
  }
  removeMeshes(g) {
    for (const mesh of g.meshes) mesh.removeFromParent();
    g.dispose();
  }

  // ------------------------------------------------------------------------------------------------- effects
  sparkle(g) {
    const N = 150, pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * Math.PI * 2, r: 0.18 + Math.random() * 0.22, y: Math.random(), s: 0.6 + Math.random() * 0.8 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.022, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd28a, opacity: 1 });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.sparks.push({ pts, seeds, t: 0, top: g.top.value, bottom: g.bottom.value });
  }
  updateSparks(dt) {
    for (const s of [...this.sparks]) {
      s.t += dt;
      const k = s.t / 1.5, pos = s.pts.geometry.attributes.position;
      s.seeds.forEach((d, i) => {
        const a = d.a + s.t * 2.4 * d.s, y = s.top - (s.top - s.bottom) * Math.min(1, k * 1.15) * d.y - 0.04 + Math.sin(s.t * 3 + d.a) * 0.02;
        const r = d.r * (1 - 0.35 * k);
        pos.setXYZ(i, Math.cos(a) * r, y + this.m.root.position.y, Math.sin(a) * r);
      });
      pos.needsUpdate = true;
      s.pts.material.opacity = Math.max(0, 1 - k) * Math.min(1, s.t * 6);
      if (k >= 1) { this.scene.remove(s.pts); s.pts.geometry.dispose(); s.pts.material.dispose(); this.sparks.splice(this.sparks.indexOf(s), 1); }
    }
  }

  // Zoom towards a small piece (rings, earrings, watches) so it can be seen.
  focus(g) {
    if (!g) return;
    this.focusY = (g.top.value + g.bottom.value) / 2;
    this.zoom = 2.6;
  }

  // ------------------------------------------------------------------------------------------------- frame
  start() {
    if (this.running || this.disposed || this.failed) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (this.disposed || !this.el.isConnected || !this.visible || document.hidden) { this.running = false; return; }
      const busy = this.frame();
      if (busy) requestAnimationFrame(loop);
      else this.running = false;
    };
    requestAnimationFrame(loop);
  }
  kick() {
    this.idleFrames = 0;
    this.start();
  }

  frame() {
    // dt drives motion (capped, so a slow frame doesn't jump); at, real time up to 1/4 s, drives timed effects, so
    // the drape-on and pose changes take the same time on slow devices.
    const raw = this.clock.getDelta(), dt = Math.min(raw, 0.05), at = Math.min(raw, 0.25), now = performance.now();
    let busy = false;
    // Pose tween
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + at / tw.dur);
      const e = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
      for (const k of Object.keys(tw.to)) this.pose[k].slerpQuaternions(tw.from[k], tw.to[k], e);
      if (tw.t >= 1) this.tween = null;
      busy = true;
    }
    // Pitch the feet up for heels.
    let pitch = 0, lift = 0, heelTip = null;
    for (const item of this.outfit.values()) {
      const g = item.garment;
      if (!g || !g.lift) continue;
      lift = g.lift;
      if (g.footPitch) { pitch = g.footPitch; heelTip = g.heelTip; }
    }
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    for (const bone of this.m.order) {
      bone.quaternion.copy(this.pose[bone.name]);
      if (pitch && bone.name.startsWith('foot')) bone.quaternion.multiply(pitchQ);
    }
    this.m.root.updateMatrixWorld(true);
    // Stand on the base: the lowest point of either foot (or heel tip) rests on it.
    let minY = Infinity;
    const p = new THREE.Vector3();
    for (const s of ['L', 'R']) {
      const mk = this.markers[s];
      mk.rest.forEach((r, i) => {
        p.copy(i === 1 && heelTip ? new THREE.Vector3(r.x, heelTip.y, heelTip.z) : r).applyMatrix4(mk.inv).applyMatrix4(mk.bone.matrixWorld);
        const y = p.y - (i === 1 && heelTip ? 0 : lift);
        if (y < minY) minY = y;
      });
    }
    if (Number.isFinite(minY)) {
      this.m.root.position.y += BASE_TOP - minY;
      this.m.root.updateMatrixWorld(true);
    }
    // Turning: drag inertia, then the slow turntable once left alone.
    const prevYaw = this.yaw;
    if (!this.dragging) {
      if (Math.abs(this.yawVel) > 0.0005) { this.yaw += this.yawVel; this.yawVel *= 0.94; busy = true; }
      else if (this.autoTurn && now - this.idleSince > 3500) { this.yaw += dt * 0.24 * Math.min(1, (now - this.idleSince - 3500) / 1500); busy = true; }
    }
    this.turntable.rotation.y = this.yaw;
    const w = dt > 0 ? (this.yaw - prevYaw) / dt : 0;
    this.omega += (w - this.omega) * Math.min(1, dt * 4);
    if (Math.abs(this.omega) > 0.002) busy = true;
    shared.uOmega.value = this.omega;
    shared.uTime.value += dt;
    // Bags hang straight down from the hand and swing a little as the mannequin turns.
    const rigQ = this.m.root.getWorldQuaternion(new THREE.Quaternion()), boneQ = new THREE.Quaternion();
    for (const item of this.outfit.values()) for (const mesh of item.garment ? item.garment.meshes : []) {
      if (!mesh.userData.hang) continue;
      mesh.parent.getWorldQuaternion(boneQ);
      const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.clamp(-this.omega * 0.35, -0.5, 0.5));
      mesh.quaternion.copy(boneQ.invert().multiply(rigQ).multiply(swing));
    }
    // Garments fading in and out.
    for (const item of this.outfit.values()) {
      const g = item.garment;
      if (g && g.fading > 0) { g.reveal.value = Math.min(1, g.reveal.value + at / 1.1); if (g.reveal.value >= 1) g.fading = 0; busy = true; }
    }
    for (const g of [...this.leaving]) {
      g.reveal.value = Math.max(0, g.reveal.value - at / 0.55);
      if (g.reveal.value <= 0) { this.removeMeshes(g); this.leaving.splice(this.leaving.indexOf(g), 1); }
      busy = true;
    }
    if (this.sparks.length) { this.updateSparks(at); busy = true; }
    // Camera: eases towards its target framing.
    const H = this.m.body.height;
    const ty = this.focusY !== null && this.zoom > 1.2 ? this.focusY : H * 0.5;
    this.camTarget.set(0, THREE.MathUtils.lerp(H * 0.5, ty, Math.min(1, (this.zoom - 1) / 1.2)) + this.m.root.position.y * 0.5, 0);
    const dist = this.fitDistance() / this.zoom;
    const k = Math.min(1, dt * 7);
    this.target.lerp(this.camTarget, k);
    this.camDist += (dist - this.camDist) * k;
    if (this.target.distanceTo(this.camTarget) > 0.001 || Math.abs(dist - this.camDist) > 0.002) busy = true;
    this.camera.position.set(0, this.target.y + Math.sin(this.pitch) * this.camDist, Math.cos(this.pitch) * this.camDist);
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
    if (!this.ready) { this.ready = true; this.el.classList.add('fit-ready'); }
    if (this.dragging || this.pointers.size) busy = true;
    // Keep drawing a few frames after everything settles, so the last change is shown.
    if (!busy) this.idleFrames = (this.idleFrames || 0) + 1;
    else this.idleFrames = 0;
    return this.idleFrames < 3 || (this.autoTurn && !this.dragging);
  }

  // ------------------------------------------------------------------------------------------------- input
  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [...this.m.meshes];
    for (const item of this.outfit.values()) if (item.garment) for (const mesh of item.garment.meshes) if (mesh.isSkinnedMesh) targets.push(mesh);
    for (const t of targets) if (t.isSkinnedMesh) t.boundingSphere = null; // posed since the last pick
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    let bone = hit.object.userData.bone;
    if (!bone) { // a garment: the nearest bone to the point
      let best = Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), ab = new THREE.Vector3(), q = new THREE.Vector3();
      for (const bn of this.m.order) {
        const [ra, rb] = this.m.segments[bn.name], inv = this.m.skeleton.boneInverses[this.m.order.indexOf(bn)];
        a.copy(ra).applyMatrix4(inv).applyMatrix4(bn.matrixWorld);
        b.copy(rb).applyMatrix4(inv).applyMatrix4(bn.matrixWorld);
        ab.subVectors(b, a);
        const t = THREE.MathUtils.clamp(q.subVectors(hit.point, a).dot(ab) / ab.lengthSq(), 0, 1);
        const d = q.copy(a).addScaledVector(ab, t).distanceTo(hit.point);
        if (d < best) { best = d; bone = bn.name; }
      }
    }
    return { bone, point: hit.point.clone() };
  }

  bindEvents() {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', e => this.onDown(e));
    c.addEventListener('pointermove', e => this.onMove(e));
    c.addEventListener('pointerup', e => this.onUp(e));
    c.addEventListener('pointercancel', e => this.onUp(e));
    c.addEventListener('dblclick', e => this.onDouble(e));
    c.addEventListener('wheel', e => {
      if (!this.el.classList.contains('fit-full') && !e.ctrlKey) return; // the page scrolls
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    this.canvasBox.addEventListener('keydown', e => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') { this.yawVel = 0; this.yaw += k === 'ArrowLeft' ? -0.2 : 0.2; this.touch(); e.preventDefault(); }
      else if (k === '+' || k === '=') this.setZoom(this.zoom * 1.25);
      else if (k === '-') this.setZoom(this.zoom / 1.25);
      this.kick();
    });
    this.onKey = e => { if (e.key === 'Escape' && this.el.classList.contains('fit-full')) this.toggleFull(false); };
    document.addEventListener('keydown', this.onKey);
    this.ui.addEventListener('click', e => this.onClick(e));
    this.ui.addEventListener('input', e => {
      if (e.target.classList.contains('fit-search')) { this.query = e.target.value; this.renderGrid(); }
    });
  }

  touch() {
    this.idleSince = performance.now();
  }

  onDown(e) {
    this.touch();
    this.el.classList.add('fit-used');
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.renderer.domElement.setPointerCapture(e.pointerId);
    if (this.pointers.size === 2) { // pinch
      this.drag = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
      return;
    }
    const canPose = e.pointerType === 'mouse' || this.el.classList.contains('fit-full');
    const hit = canPose ? this.pick(e) : null;
    if (hit && hit.bone !== 'pelvis') {
      const bone = this.m.bones[hit.bone];
      this.drag = { kind: 'pose', bone, local: bone.worldToLocal(hit.point.clone()), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point) };
      this.tween = null;
      if (this.poseName) { this.poseName = null; this.el.querySelectorAll('[data-pose]').forEach(b => b.setAttribute('aria-pressed', 'false')); }
      this.renderer.domElement.style.cursor = 'grabbing';
    } else {
      this.drag = { kind: 'turn', x: e.clientX, y: e.clientY };
      this.yawVel = 0;
    }
    this.dragging = true;
    this.kick();
  }

  onMove(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      if (e.pointerType === 'mouse' && !this.dragging) { // hover: show what can be posed
        const now = performance.now();
        if (now - (this.lastHover || 0) > 60) { this.lastHover = now; const hit = this.pick(e); this.renderer.domElement.style.cursor = hit && hit.bone !== 'pelvis' ? 'grab' : 'ew-resize'; }
      }
      return;
    }
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    this.touch();
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.setZoom(this.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d));
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'turn') {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      this.yaw += dx * 0.011;
      this.yawVel = dx * 0.011;
      if (e.pointerType === 'mouse' || this.el.classList.contains('fit-full')) this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.12, 0.5);
    } else this.poseDrag(e);
    this.kick();
  }

  // Swings the grabbed bone so the grabbed point follows the pointer; elbows and knees only bend.
  poseDrag(e) {
    const d = this.drag, bone = d.bone, rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const target = this.raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
    if (!target) return;
    const pivot = bone.getWorldPosition(new THREE.Vector3());
    let grab = d.local.clone();
    if (grab.length() < 0.05) { // grabbed right at the joint: use the far end of the bone
      const [a, b] = this.m.segments[bone.name], inv = this.m.skeleton.boneInverses[this.m.order.indexOf(bone)];
      grab = b.clone().applyMatrix4(inv);
      void a;
    }
    const v0 = bone.localToWorld(grab.clone()).sub(pivot), v1 = target.sub(pivot);
    if (v0.lengthSq() < 1e-6 || v1.lengthSq() < 1e-6) return;
    const name = bone.name, lim = LIMITS[name] || {};
    const q = this.pose[name];
    const boneW = bone.getWorldQuaternion(new THREE.Quaternion());
    if (lim.hinge) {
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(boneW);
      const p0 = v0.clone().projectOnPlane(axis), p1 = v1.clone().projectOnPlane(axis);
      if (p0.lengthSq() < 1e-6 || p1.lengthSq() < 1e-6) return;
      const angle = Math.atan2(axis.dot(new THREE.Vector3().crossVectors(p0, p1)), p0.dot(p1));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));
      const eu = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      eu.x = THREE.MathUtils.clamp(eu.x, THREE.MathUtils.degToRad(lim.x[0]), THREE.MathUtils.degToRad(lim.x[1]));
      q.setFromEuler(eu);
    } else {
      const dq = new THREE.Quaternion().setFromUnitVectors(v0.normalize(), v1.normalize());
      const parentW = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      q.copy(parentW.invert().multiply(dq.multiply(boneW)));
      clampBone(name, q);
    }
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size) return;
    if (this.drag && this.drag.kind === 'pose') this.renderer.domElement.style.cursor = 'grab';
    this.drag = null;
    this.dragging = false;
    this.touch();
    this.kick();
  }

  onDouble(e) {
    if (this.zoom > 1.3) { this.zoom = 1; this.focusY = null; }
    else { const hit = this.pick(e); this.focusY = hit ? hit.point.y - this.m.root.position.y * 0.5 : null; this.zoom = 2.4; }
    this.kick();
  }

  setZoom(z) {
    this.zoom = THREE.MathUtils.clamp(z, 0.8, 4);
    if (this.zoom <= 1.05) this.focusY = null;
    this.kick();
  }

  toggleFull(on = !this.el.classList.contains('fit-full')) {
    this.el.classList.toggle('fit-full', on);
    document.documentElement.classList.toggle('fit-locked', on);
    this.renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
    this.el.querySelector('[data-act="full"]').setAttribute('aria-pressed', String(on));
    this.syncHint();
    requestAnimationFrame(() => this.resize());
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    this.touch();
    if (b.dataset.kind) return this.setBody(b.dataset.kind, { chosen: true });
    if (b.dataset.pose) return this.setPose(b.dataset.pose);
    if (b.dataset.group) { this.group = b.dataset.group; this.el.querySelectorAll('[data-group]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); return this.renderGrid(); }
    if (b.dataset.wear) {
      const p = this.productById(b.dataset.wear);
      if (this.outfit.has(p.id)) this.takeOff(p.id);
      else this.wear(p, { suggestBody: false });
      return this.renderGrid();
    }
    if (b.dataset.off) return this.takeOff(b.dataset.off);
    if (b.dataset.color) {
      const [id, i] = b.dataset.color.split(':'), item = this.outfit.get(id);
      if (item) { item.colorIndex = Number(i); this.applyColor(item); this.persist(); this.syncOutfit(); }
      return;
    }
    if (b.dataset.open && this.onOpenProduct) return this.onOpenProduct(b.dataset.open);
    switch (b.dataset.act) {
      case 'turn': this.autoTurn = !this.autoTurn; b.setAttribute('aria-pressed', String(this.autoTurn)); this.kick(); break;
      case 'reset': this.zoom = 1; this.focusY = null; this.pitch = 0.08; this.yaw = -0.35; this.yawVel = 0; this.setPose('stand'); break;
      case 'full': this.toggleFull(); break;
      case 'zoom-in': this.setZoom(this.zoom * 1.3); break;
      case 'zoom-out': this.setZoom(this.zoom / 1.3); break;
      case 'outfit': this.toggleDrawer(); break;
      case 'outfit-close': this.toggleDrawer(false); break;
      case 'clear': this.clear(); break;
      default: break;
    }
  }

  toggleDrawer(open) {
    const d = this.el.querySelector('.fit-drawer');
    if (!d) return;
    open = open ?? d.hidden;
    d.hidden = !open;
    this.el.querySelector('[data-act="outfit"]').setAttribute('aria-expanded', String(open));
    if (open) { this.syncOutfit(); this.renderGrid(); d.querySelector('.fit-search').focus({ preventScroll: true }); }
  }

  syncOutfit() {
    const count = this.el.querySelector('.fit-count');
    if (count) count.textContent = this.outfit.size;
    const list = this.el.querySelector('.fit-worn');
    if (!list) return;
    const t = this.t;
    list.innerHTML = [...this.outfit.values()].map(({ product: p, colorIndex }) => {
      const colors = p.colors || [];
      return `<li><img src="${esc(p.wearable.cleanImage || p.image)}" alt=""><div><small>${esc(p.brand)}</small><span>${esc(p.name)}</span>${colors.length > 1 ? `<div class="fit-swatches">${colors.map((c, i) => `<button type="button" data-color="${esc(p.id)}:${i}" aria-pressed="${i === colorIndex}" aria-label="${esc(c.name)}" title="${esc(c.name)}" style="--c:${esc(c.hex || '#ccc')}"></button>`).join('')}</div>` : ''}${this.onOpenProduct ? `<button type="button" class="fit-link" data-open="${esc(p.id)}">${esc(t('View piece'))}</button>` : ''}</div><button type="button" class="fit-icon" data-off="${esc(p.id)}" aria-label="${esc(t('Take off {name}', { name: p.name }))}">${ICONS.close}</button></li>`;
    }).join('') || `<li class="fit-empty">${esc(t('Nothing on yet. Add pieces below.'))}</li>`;
  }

  renderGrid() {
    const grid = this.el.querySelector('.fit-grid');
    if (!grid) return;
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = this.products.filter(p => p.wearable && (this.group === 'all' || p.wearable.group === this.group) && words.every(w => `${p.brand} ${p.name} ${p.type}`.toLowerCase().includes(w))).slice(0, 60);
    grid.innerHTML = rows.map(p => `<button type="button" data-wear="${esc(p.id)}" aria-pressed="${this.outfit.has(p.id)}"><img src="${esc(p.wearable.cleanImage || p.image)}" alt="" loading="lazy"><small>${esc(p.brand)}</small><span>${esc(p.name)}</span></button>`).join('') || `<p class="fit-empty">${esc(this.t('No pieces match.'))}</p>`;
  }

  dispose() {
    this.disposed = true;
    if (this.failed) return;
    document.removeEventListener('keydown', this.onKey);
    document.documentElement.classList.remove('fit-locked');
    this.resizeObserver.disconnect();
    this.io.disconnect();
    for (const item of this.outfit.values()) if (item.garment) this.removeMeshes(item.garment);
    for (const g of this.leaving) this.removeMeshes(g);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.el.innerHTML = '';
  }
}
