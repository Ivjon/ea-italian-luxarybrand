// The CRM's wearable agent: makes a product wearable on the store's 3D mannequin.
//  1. Cleans the cover photo in the browser: removes the studio background, keeps the piece, crops it.
//  2. Takes the piece's colours and, when the cloth has texture, a fabric swatch from its middle.
//  3. Uploads both and asks the server (POST /api/crm/wearable/agent), which fits the garment template from the
//     product's fields and, when AI is set up (ANTHROPIC_API_KEY), from Claude reading the cleaned photo.
// The editor card shows each step, a live 3D preview, and lets the manager correct the cut by hand.
// Used by admin.js: EA_WEAR.card(product) / EA_WEAR.mount(product, { onSaved }) / EA_WEAR.runAll(products, onStep).
(() => {
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let meta = null; // templates, fit choices and AI status from the server
  let room = null;

  async function api(url, opts = {}) {
    const r = await fetch(url, opts);
    if (r.status === 401) { location.replace('/account'); throw new Error('Please sign in again.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Something went wrong.');
    return d;
  }
  const json = (url, method, body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const getMeta = async () => (meta = meta || (await api('/api/crm/wearable/status')));

  // ------------------------------------------------------------------------------------------- photo cleaning
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The cover photo could not be read.'));
      img.src = src;
    });
  }

  // Background = everything connected to the border that is close to the border's colour (studio white, beige
  // paper). The piece = the largest remaining shapes (two shoes count as one piece).
  function cleanPhoto(img) {
    const max = 768, k = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const W = Math.max(1, Math.round((img.naturalWidth || img.width) * k)), H = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H), px = data.data, N = W * H;

    // Border colour (median of the edge pixels)
    const edge = [];
    for (let x = 0; x < W; x++) edge.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) edge.push(y * W, y * W + W - 1);
    const med = ch => { const v = edge.map(i => px[i * 4 + ch]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const bg = [med(0), med(1), med(2)];
    const near = i => px[i * 4 + 3] < 16 || Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]) < 34;

    // Flood fill from the border
    const isBg = new Uint8Array(N), stack = [];
    for (const i of edge) if (!isBg[i] && near(i)) { isBg[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !isBg[j] && near(j)) { isBg[j] = 1; stack.push(j); }
      }
    }
    // Largest shapes of what is left
    const label = new Int32Array(N).fill(-1), sizes = [];
    for (let i = 0; i < N; i++) {
      if (isBg[i] || label[i] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      label[i] = id; stack.push(i);
      while (stack.length) {
        const p = stack.pop(), x = p % W, y = (p / W) | 0;
        n++;
        for (const j of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (j >= 0 && !isBg[j] && label[j] < 0) { label[j] = id; stack.push(j); }
        }
      }
      sizes.push(n);
    }
    if (!sizes.length) throw new Error('No piece found in the photo: it looks like an empty background.');
    const biggest = Math.max(...sizes), keep = new Set(sizes.map((n, id) => (n >= biggest * 0.25 ? id : -1)).filter(id => id >= 0));
    const mask = new Uint8Array(N);
    let x0 = W, y0 = H, x1 = 0, y1 = 0, count = 0;
    for (let i = 0; i < N; i++) {
      if (!keep.has(label[i])) continue;
      mask[i] = 1;
      const x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      count++;
    }

    // Cleaned photo: the piece on transparency, cropped with a small margin, edges softened by a pixel.
    const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04), cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    const octx = out.getContext('2d'), od = octx.createImageData(cw, ch);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let edgeN = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j < 0 || j >= N || !mask[j]) edgeN++;
      const o = ((y - y0 + pad) * cw + (x - x0 + pad)) * 4;
      od.data.set([px[i * 4], px[i * 4 + 1], px[i * 4 + 2], edgeN ? 150 : 255], o);
    }
    octx.putImageData(od, 0, 0);

    // Colours: a small k-means over the piece's pixels, most common first.
    const samples = [];
    const step = Math.max(1, Math.floor(count / 6000));
    for (let i = 0, n = 0; i < N; i++) if (mask[i] && n++ % step === 0) samples.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
    let centres = [0, 0.33, 0.66, 0.99].map(f => samples[Math.floor(f * (samples.length - 1))].slice());
    let groups = [];
    for (let it = 0; it < 8; it++) {
      groups = centres.map(() => []);
      for (const s of samples) {
        let best = 0, bd = Infinity;
        centres.forEach((c2, k2) => { const d = (s[0] - c2[0]) ** 2 + (s[1] - c2[1]) ** 2 + (s[2] - c2[2]) ** 2; if (d < bd) { bd = d; best = k2; } });
        groups[best].push(s);
      }
      centres = groups.map((g, k2) => (g.length ? [0, 1, 2].map(ch2 => g.reduce((a, s) => a + s[ch2], 0) / g.length) : centres[k2]));
    }
    const hex = c2 => '#' + c2.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const palette = [];
    centres.map((c2, k2) => ({ c: c2, n: groups[k2].length })).filter(x => x.n > samples.length * 0.06).sort((a, b) => b.n - a.n)
      .forEach(({ c: c2 }) => { if (!palette.some(p => Math.hypot(...[0, 1, 2].map(ch2 => parseInt(p.slice(1 + ch2 * 2, 3 + ch2 * 2), 16) - c2[ch2])) < 28)) palette.push(hex(c2)); });

    // Fabric swatch: the calmest square of solid cloth (fewest edges: no buttons, belts or seams), kept only if
    // the cloth has texture of its own; plain cloth is drawn from its colour instead.
    const W1 = W + 1, inM = new Uint32Array(W1 * (H + 1)), inG = new Float64Array(W1 * (H + 1));
    const lum = i => 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    for (let y = 1; y <= H; y++) {
      let rowM = 0, rowG = 0;
      for (let x = 1; x <= W; x++) {
        const i = (y - 1) * W + x - 1;
        rowM += mask[i];
        rowG += x < W && y < H ? Math.abs(lum(i + 1) - lum(i)) + Math.abs(lum(i + W) - lum(i)) : 0;
        inM[y * W1 + x] = inM[(y - 1) * W1 + x] + rowM;
        inG[y * W1 + x] = inG[(y - 1) * W1 + x] + rowG;
      }
    }
    const box = (A, x, y, sz) => A[(y + sz) * W1 + x + sz] - A[y * W1 + x + sz] - A[(y + sz) * W1 + x] + A[y * W1 + x];
    const side = Math.round(Math.max(x1 - x0, y1 - y0) * 0.16);
    let best = null;
    if (side >= 24) {
      for (let y = y0; y + side <= y1; y += Math.max(2, side >> 2)) for (let x = x0; x + side <= x1; x += Math.max(2, side >> 2)) {
        if (box(inM, x, y, side) !== side * side) continue;
        const score = box(inG, x, y, side) / (side * side);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    let swatch = null;
    if (best) {
      let sum = 0, sum2 = 0, n = 0;
      for (let y = best.y; y < best.y + side; y++) for (let x = best.x; x < best.x + side; x++) { const l = lum(y * W + x); sum += l; sum2 += l * l; n++; }
      if (Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2)) > 4) {
        swatch = document.createElement('canvas');
        swatch.width = swatch.height = 256;
        swatch.getContext('2d').drawImage(c, best.x, best.y, side, side, 0, 0, 256, 256);
      }
    }
    return { cleaned: out, palette: palette.slice(0, 4), swatch, coverage: count / N };
  }

  const toBlob = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  async function upload(canvas) {
    const blob = await toBlob(canvas);
    const r = await api('/api/crm/uploads', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    return r.src;
  }

  // The whole agent for one product. `step(text, state)` reports progress. Returns { product, ai }.
  async function run(product, step = () => {}) {
    const m = await getMeta();
    step('Reading the cover photo', 'run');
    const img = await loadImage(product.image);
    step('Removing the background', 'run');
    const res = cleanPhoto(img);
    step(`Found the piece (${Math.round(res.coverage * 100)}% of the photo) and ${res.palette.length} colour${res.palette.length === 1 ? '' : 's'}`, 'ok');
    step(res.swatch ? 'Uploading the cleaned photo and the fabric swatch' : 'Uploading the cleaned photo (plain cloth, no swatch needed)', 'run');
    const [cleanImage, texture] = await Promise.all([upload(res.cleaned), res.swatch ? upload(res.swatch) : Promise.resolve('')]);
    step(m.ai ? `Asking ${m.model} for the cut, material and pattern` : 'Fitting the cut from the product details (AI vision is off)', 'run');
    const out = await json('/api/crm/wearable/agent', 'POST', { id: product.id, cleanImage, texture, palette: res.palette });
    if (out.ai.error) step(`AI: ${out.ai.error}`, 'warn');
    step(`Ready: ${out.product.wearable.template}, ${out.product.wearable.material}${out.ai.used ? ' (AI)' : ''}`, 'ok');
    return out;
  }

  // ------------------------------------------------------------------------------------------- editor card
  const LABELS = { hem: 'Length', sleeve: 'Sleeves', leg: 'Legs', shape: 'Shape', collar: 'Collar', closure: 'Closure' };
  const SOURCE = { ai: 'Fitted by AI', rules: 'Fitted from the details', manual: 'Corrected by hand' };

  function card(p) {
    if (!p || !p.id) return '<div class="ed-card ed-wear"><h3>3D try-on</h3><p class="ed-hint">Save the product first. The wearable agent then cleans its photo and fits it on the store\'s 3D mannequin.</p></div>';
    return `<div class="ed-card ed-wear" id="edWear"><h3>3D try-on</h3><p class="wear-src" id="wearSrc"></p><div class="wear-room" id="wearRoom"></div>
<div class="wear-assets" id="wearAssets"></div><ol class="wear-log" id="wearLog" hidden></ol>
<button type="button" class="ed-save" id="wearRun">Run the wearable agent</button><p class="ed-hint" id="wearAi"></p>
<details class="wear-fix"><summary>Correct the fit</summary><form id="wearForm"></form></details></div>`;
  }

  async function mount(p, { onSaved } = {}) {
    const box = $('#edWear');
    if (!box) return;
    const m = await getMeta().catch(() => null);
    if (!m) return;
    $('#wearAi').textContent = m.ai ? `AI vision is on (${m.model}).` : `AI vision is off. ${m.reason || ''} The agent still cleans the photo and fits the cut from the product details.`;
    paint(p, m);
    // 3D preview (the store's fitting room, CRM mode)
    try {
      const mod = await import('/fitting/fitting.js');
      if (room) room.dispose();
      const roomEl = $('#wearRoom');
      if (!roomEl) return;
      room = mod.mountFitting(roomEl, { products: [p], mode: 'crm', t: s => s });
      room.wear(p, { colorIndex: 0 });
    } catch (err) {
      console.error(err);
    }
    $('#wearRun').addEventListener('click', async () => {
      const btn = $('#wearRun'), log = $('#wearLog');
      btn.disabled = true;
      btn.textContent = 'Working…';
      log.hidden = false;
      log.innerHTML = '';
      const step = (text, state) => {
        const last = log.lastElementChild;
        if (last && last.dataset.state === 'run') last.dataset.state = 'ok';
        log.insertAdjacentHTML('beforeend', `<li data-state="${state}">${esc(text)}</li>`);
      };
      try {
        const out = await run(p, step);
        Object.assign(p, out.product);
        refresh(p);
        if (onSaved) onSaved(out.product);
      } catch (err) {
        step(err.message, 'warn');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Run the wearable agent';
      }
    });
    $('#wearForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target), fit = {};
      for (const k of Object.keys(m.fit)) fit[k] = f.get(k);
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const saved = await json('/api/crm/wearable', 'PUT', { id: p.id, wearable: { template: f.get('template'), material: f.get('material'), pattern: f.get('pattern'), fit } });
        Object.assign(p, saved);
        refresh(p);
        if (onSaved) onSaved(saved);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
    if (mount.autoRun === p.id) { mount.autoRun = null; $('#wearRun').click(); }
  }

  function paint(p, m) {
    const w = p.wearable || {};
    $('#wearSrc').innerHTML = w.template ? `<b>${esc(SOURCE[w.source] || 'Fitted')}</b> · ${esc(w.template)} · ${esc(w.material)}${w.pattern && w.pattern !== 'solid' ? ` · ${esc(w.pattern)}` : ''}${w.confidence !== undefined ? ` · ${Math.round(w.confidence * 100)}% sure` : ''}` : 'Not fitted yet';
    $('#wearAssets').innerHTML = w.cleanImage || (w.palette && w.palette.length) ? `${w.cleanImage ? `<figure><img src="${esc(w.cleanImage)}" alt=""><figcaption>Cleaned</figcaption></figure>` : ''}${w.texture ? `<figure><img src="${esc(w.texture)}" alt=""><figcaption>Fabric</figcaption></figure>` : ''}${(w.palette || []).length ? `<div class="wear-palette">${w.palette.map(h => `<span style="background:${esc(h)}" title="${esc(h)}"></span>`).join('')}</div>` : ''}${w.notes ? `<p class="ed-hint">${esc(w.notes)}</p>` : ''}` : '';
    const opt = (name, list, cur) => `<label>${esc(name === 'template' ? 'Garment' : name === 'material' ? 'Material' : name === 'pattern' ? 'Pattern' : LABELS[name])}<select name="${name}">${list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    $('#wearForm').innerHTML = opt('template', Object.keys(m.templates), w.template) + Object.entries(m.fit).map(([k, list]) => opt(k, list, (w.fit || {})[k])).join('') + opt('material', m.materials, w.material) + opt('pattern', m.patterns, w.pattern) + '<button type="submit" class="ed-ghost">Save the fit</button>';
  }

  function refresh(p) {
    if (meta) paint(p, meta);
    if (room) { room.products = [p]; room.takeOff(p.id, { quiet: true }); room.wear(p, { colorIndex: 0 }); }
  }

  // Every product, one after the other (Products > Make all wearable).
  async function runAll(products, onStep) {
    let done = 0, failed = 0;
    for (const p of products) {
      onStep(`${done + failed + 1} of ${products.length}: ${p.name}`);
      try { await run(p); done++; } catch (err) { failed++; console.warn(p.id, err); }
    }
    return { done, failed };
  }

  window.EA_WEAR = { card, mount, runAll, run, dispose: () => { if (room) { room.dispose(); room = null; } } };
})();
