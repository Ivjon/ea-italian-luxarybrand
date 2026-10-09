// The wearable spec: how a CRM product is put on the 3D mannequin (frontend/fitting/). Every product gets one from
// these rules when it is saved; the CRM's wearable agent (lib/agent.js) can refine it with AI vision and adds the
// cleaned photo and fabric swatch made in the CRM. The fitting room only reads `product.wearable`.
const { HttpError } = require('./http');

const VERSION = 1;

// Garment templates the fitting room can build, with the body slots each one takes (a new piece replaces whatever
// holds one of its slots) and its layer (under < inner < mid < outer, drawn further from the body).
const TEMPLATES = {
  bra: { slots: ['under-top'], layer: 0, group: 'clothing' },
  briefs: { slots: ['under-bottom'], layer: 0, group: 'clothing' },
  swimsuit: { slots: ['under-top', 'under-bottom', 'top', 'bottom'], layer: 0, group: 'clothing' },
  'swim-shorts': { slots: ['bottom'], layer: 1, group: 'clothing' },
  tshirt: { slots: ['top'], layer: 1, group: 'clothing' },
  polo: { slots: ['top'], layer: 1, group: 'clothing' },
  shirt: { slots: ['top'], layer: 1, group: 'clothing' },
  knit: { slots: ['top'], layer: 1, group: 'clothing' },
  sweatshirt: { slots: ['top'], layer: 1, group: 'clothing' },
  hoodie: { slots: ['top'], layer: 1, group: 'clothing' },
  dress: { slots: ['top', 'bottom'], layer: 1, group: 'clothing' },
  waistcoat: { slots: ['mid'], layer: 2, group: 'clothing' },
  blazer: { slots: ['outer'], layer: 3, group: 'clothing' },
  jacket: { slots: ['outer'], layer: 3, group: 'clothing' },
  coat: { slots: ['outer'], layer: 3, group: 'clothing' },
  suit: { slots: ['outer', 'bottom'], layer: 3, group: 'clothing' },
  tracksuit: { slots: ['outer', 'bottom'], layer: 3, group: 'clothing' },
  trousers: { slots: ['bottom'], layer: 1, group: 'clothing' },
  jeans: { slots: ['bottom'], layer: 1, group: 'clothing' },
  shorts: { slots: ['bottom'], layer: 1, group: 'clothing' },
  skirt: { slots: ['bottom'], layer: 1, group: 'clothing' },
  heels: { slots: ['feet'], layer: 1, group: 'shoes' },
  sandals: { slots: ['feet'], layer: 1, group: 'shoes' },
  sneakers: { slots: ['feet'], layer: 1, group: 'shoes' },
  boots: { slots: ['feet'], layer: 1, group: 'shoes' },
  loafers: { slots: ['feet'], layer: 1, group: 'shoes' },
  oxfords: { slots: ['feet'], layer: 1, group: 'shoes' },
  slides: { slots: ['feet'], layer: 1, group: 'shoes' },
  handbag: { slots: ['hand'], layer: 4, group: 'bags' },
  briefcase: { slots: ['hand'], layer: 4, group: 'bags' },
  wallet: { slots: ['hand'], layer: 4, group: 'bags' },
  backpack: { slots: ['back'], layer: 4, group: 'bags' },
  necklace: { slots: ['neck-jewel'], layer: 4, group: 'jewellery' },
  watch: { slots: ['wrist-l'], layer: 4, group: 'jewellery' },
  bracelet: { slots: ['wrist-r'], layer: 4, group: 'jewellery' },
  ring: { slots: ['finger'], layer: 4, group: 'jewellery' },
  earrings: { slots: ['ears'], layer: 4, group: 'jewellery' },
  cufflinks: { slots: ['cuffs'], layer: 4, group: 'jewellery' },
  sunglasses: { slots: ['eyes'], layer: 4, group: 'accessories' },
  belt: { slots: ['waist'], layer: 4, group: 'accessories' },
  tie: { slots: ['neck'], layer: 2, group: 'accessories' },
  scarf: { slots: ['neck'], layer: 4, group: 'accessories' },
  cap: { slots: ['head'], layer: 4, group: 'accessories' },
  fedora: { slots: ['head'], layer: 4, group: 'accessories' },
  gloves: { slots: ['hands'], layer: 4, group: 'accessories' },
};

// Choices the agent (and the CRM's manual correction) can set; anything else is refused.
const FIT = {
  hem: ['none', 'crop', 'waist', 'hip', 'thigh', 'knee', 'midi', 'ankle'],
  sleeve: ['none', 'short', 'elbow', 'long'],
  leg: ['none', 'brief', 'short', 'knee', 'long'],
  shape: ['slim', 'regular', 'relaxed', 'wide', 'flared', 'pencil', 'puffer'],
  collar: ['none', 'crew', 'v', 'polo', 'shirt', 'lapel', 'hood', 'roll', 'stand'],
  closure: ['none', 'open', 'buttons', 'double', 'zip'],
};
const MATERIALS = ['leather', 'patent', 'suede', 'wool', 'cashmere', 'knit', 'cotton', 'denim', 'linen', 'silk', 'satin', 'technical', 'velvet', 'tulle', 'rubber', 'gold', 'silver', 'steel', 'acetate', 'pearl'];
const PATTERNS = ['solid', 'pinstripe', 'stripe', 'check', 'print', 'quilted', 'pleated', 'rib', 'pique', 'twill', 'crystal', 'lace', 'logo'];

const has = (text, ...words) => words.some(w => text.includes(w));

// The template for a product type (the CRM's types, frontend/catalog.js), using the name and gender where one type
// covers several shapes (swimwear, underwear, boots, hats).
function templateFor(p) {
  const type = String(p.type || '').toLowerCase(), name = String(p.name || '').toLowerCase(), women = p.category === 'Women';
  const byType = {
    jackets: 'jacket', coats: 'coat', blazers: 'blazer', suits: 'suit', waistcoats: 'waistcoat', shirts: 'shirt',
    'polo shirts': 'polo', 't-shirts': 'tshirt', knitwear: 'knit', sweatshirts: 'sweatshirt', hoodies: 'hoodie',
    pants: 'trousers', jeans: 'jeans', shorts: 'shorts', tracksuits: 'tracksuit', dresses: 'dress', skirts: 'skirt',
    heels: 'heels', sandals: 'sandals', sneakers: 'sneakers', boots: 'boots', loafers: 'loafers', moccasins: 'loafers',
    'lace-ups': 'oxfords', slides: 'slides', bags: 'handbag', backpacks: 'backpack', briefcases: 'briefcase',
    necklaces: 'necklace', watches: 'watch', rings: 'ring', earrings: 'earrings', bracelets: 'bracelet',
    cufflinks: 'cufflinks', sunglasses: 'sunglasses', belts: 'belt', ties: 'tie', wallets: 'wallet', scarves: 'scarf',
    gloves: 'gloves',
  };
  if (type === 'swimwear') return has(name, 'swimsuit', 'one-piece', 'bikini') || (women && !has(name, 'short')) ? 'swimsuit' : 'swim-shorts';
  if (type === 'underwear') return has(name, 'bra', 'bralette') ? 'bra' : 'briefs';
  if (type === 'hats') return has(name, 'cap', 'baseball') ? 'cap' : 'fedora';
  if (byType[type]) return byType[type];
  // Types added in the CRM later: guess from the name.
  const guesses = [['coat', 'coat'], ['jacket', 'jacket'], ['blazer', 'blazer'], ['dress', 'dress'], ['skirt', 'skirt'], ['jean', 'jeans'], ['short', 'shorts'], ['trouser', 'trousers'], ['pant', 'trousers'], ['shirt', 'shirt'], ['sweater', 'knit'], ['cardigan', 'knit'], ['hood', 'hoodie'], ['boot', 'boots'], ['sneaker', 'sneakers'], ['sandal', 'sandals'], ['heel', 'heels'], ['pump', 'heels'], ['loafer', 'loafers'], ['bag', 'handbag'], ['necklace', 'necklace'], ['watch', 'watch'], ['ring', 'ring'], ['bracelet', 'bracelet'], ['earring', 'earrings'], ['scarf', 'scarf'], ['belt', 'belt'], ['hat', 'fedora'], ['cap', 'cap'], ['glove', 'gloves'], ['sunglass', 'sunglasses']];
  const hit = guesses.find(([w]) => name.includes(w));
  return hit ? hit[1] : 'tshirt';
}

// The surface: the main fabric is the composition's first part ("Calfskin upper; rubber sole" -> calfskin), and metal
// words only count for jewellery, watches and eyewear ("Gold-Trim Swimsuit" is not gold).
function materialFor(p, template) {
  const group = TEMPLATES[template].group, metalOk = group === 'jewellery' || template === 'sunglasses';
  const main = String(p.composition || '').split(';')[0].toLowerCase(), t = `${main} ${String(p.name || '').toLowerCase()}`;
  if (has(t, 'patent')) return 'patent';
  if (has(t, 'suede')) return 'suede';
  if (has(main, 'satin')) return 'satin';
  if (has(t, 'leather', 'lambskin', 'calfskin', 'nappa')) return 'leather';
  if (has(t, 'pearl')) return 'pearl';
  if (has(t, 'acetate')) return 'acetate';
  if (metalOk) {
    if (has(t, 'steel', 'metal')) return 'steel';
    if (has(t, 'sterling')) return 'silver';
    if (has(t, 'brass', 'gold')) return 'gold';
    if (has(t, 'silver')) return 'silver';
  }
  if (has(t, 'rubber') && group === 'shoes') return 'rubber';
  if (has(t, 'tulle')) return 'tulle';
  if (has(t, 'velour', 'velvet')) return 'velvet';
  if (has(t, 'satin')) return 'satin';
  if (has(main, 'silk') || (has(t, 'silk') && !has(main, 'wool'))) return 'silk';
  if (template === 'jeans' || has(t, 'denim')) return 'denim';
  if (has(t, 'cashmere')) return template === 'knit' || template === 'scarf' ? 'cashmere' : 'wool';
  if (template === 'knit' || has(t, 'merino', 'knit')) return 'knit';
  if (has(t, 'wool', 'felt', 'crepe', 'crêpe')) return 'wool';
  if (has(t, 'linen')) return 'linen';
  if (has(t, 'cotton', 'fleece', 'piqué', 'pique')) return 'cotton';
  if (has(t, 'polyamide', 'polyester', 'nylon', 'elastane', 'jersey')) return 'technical';
  return metalOk ? 'gold' : 'cotton';
}

function patternFor(p, template) {
  const n = `${p.name || ''} ${p.description || ''}`.toLowerCase(), clothing = TEMPLATES[template].group === 'clothing';
  if (has(n, 'pinstripe')) return 'pinstripe';
  if (has(n, 'quilted', 'puffer')) return 'quilted';
  if (has(n, 'pleated') && ['skirt', 'dress'].includes(template)) return 'pleated';
  if (has(n, 'crystal')) return 'crystal';
  if (/\blace\b/.test(n) && clothing) return 'lace';
  if (has(n, 'printed', 'print', 'foulard', 'graphic')) return 'print';
  if (has(n, 'stripe')) return 'stripe';
  if (has(n, 'check', 'tartan')) return 'check';
  if (has(n, 'piqué', 'pique')) return 'pique';
  if (template === 'knit' || (clothing && has(n, 'rollneck', 'ribbed'))) return 'rib';
  if (template === 'tie' && has(n, 'knit')) return 'rib';
  if (template === 'jeans') return 'twill';
  return 'solid';
}

// Cut details per template, adjusted by words in the name.
function fitFor(p, template) {
  const n = String(p.name || '').toLowerCase(), clothing = TEMPLATES[template].group === 'clothing';
  const base = {
    bra: { hem: 'crop', sleeve: 'none', leg: 'none', shape: 'slim', collar: 'none', closure: 'none' },
    briefs: { hem: 'none', sleeve: 'none', leg: 'brief', shape: 'slim', collar: 'none', closure: 'none' },
    swimsuit: { hem: 'none', sleeve: 'none', leg: 'brief', shape: 'slim', collar: 'none', closure: 'none' },
    'swim-shorts': { hem: 'none', sleeve: 'none', leg: 'short', shape: 'regular', collar: 'none', closure: 'none' },
    tshirt: { hem: 'hip', sleeve: 'short', leg: 'none', shape: 'regular', collar: 'crew', closure: 'none' },
    polo: { hem: 'hip', sleeve: 'short', leg: 'none', shape: 'regular', collar: 'polo', closure: 'buttons' },
    shirt: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'slim', collar: 'shirt', closure: 'buttons' },
    knit: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'regular', collar: 'crew', closure: 'none' },
    sweatshirt: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'relaxed', collar: 'crew', closure: 'none' },
    hoodie: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'relaxed', collar: 'hood', closure: 'none' },
    dress: { hem: 'midi', sleeve: 'none', leg: 'none', shape: 'regular', collar: 'v', closure: 'none' },
    waistcoat: { hem: 'hip', sleeve: 'none', leg: 'none', shape: 'slim', collar: 'v', closure: 'buttons' },
    blazer: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'slim', collar: 'lapel', closure: 'buttons' },
    jacket: { hem: 'hip', sleeve: 'long', leg: 'none', shape: 'regular', collar: 'stand', closure: 'zip' },
    coat: { hem: 'knee', sleeve: 'long', leg: 'none', shape: 'regular', collar: 'lapel', closure: 'buttons' },
    suit: { hem: 'hip', sleeve: 'long', leg: 'long', shape: 'slim', collar: 'lapel', closure: 'buttons' },
    tracksuit: { hem: 'hip', sleeve: 'long', leg: 'long', shape: 'relaxed', collar: 'stand', closure: 'zip' },
    trousers: { hem: 'none', sleeve: 'none', leg: 'long', shape: 'regular', collar: 'none', closure: 'none' },
    jeans: { hem: 'none', sleeve: 'none', leg: 'long', shape: 'slim', collar: 'none', closure: 'none' },
    shorts: { hem: 'none', sleeve: 'none', leg: 'short', shape: 'regular', collar: 'none', closure: 'none' },
    skirt: { hem: 'knee', sleeve: 'none', leg: 'none', shape: 'regular', collar: 'none', closure: 'none' },
  }[template] || { hem: 'none', sleeve: 'none', leg: 'none', shape: 'regular', collar: 'none', closure: 'none' };
  const fit = { ...base };
  if (template === 'boots') fit.leg = has(n, 'knee') ? 'knee' : 'short'; // shaft height
  if (!clothing) return fit;
  if (has(n, 'wide-leg', 'wide leg', 'palazzo')) fit.shape = 'wide';
  if (has(n, 'slim')) fit.shape = 'slim';
  if (has(n, 'pencil')) fit.shape = 'pencil';
  if (has(n, 'pleated', 'tulle', 'party') && ['skirt', 'dress'].includes(template)) fit.shape = 'flared';
  if (has(n, 'puffer', 'quilted') && TEMPLATES[template].slots.includes('outer')) fit.shape = 'puffer';
  if (has(n, 'midi')) fit.hem = 'midi';
  if (has(n, 'maxi')) fit.hem = 'ankle';
  if (has(n, 'mini')) fit.hem = 'thigh';
  if (has(n, 'bermuda')) fit.leg = 'knee';
  if (has(n, 'slip dress')) fit.collar = 'v';
  if (has(n, 'rollneck', 'turtleneck')) fit.collar = 'roll';
  if (has(n, 'zip')) fit.closure = 'zip';
  if (has(n, 'double-breasted', 'double-faced')) fit.closure = 'double';
  if (has(n, 'overcoat')) fit.hem = 'knee';
  if (template === 'skirt' && fit.shape === 'regular') fit.shape = 'flared';
  if (template === 'dress' && has(n, 'party', 'tulle')) fit.hem = 'knee';
  return fit;
}

// Rule-based spec from the CRM fields alone. Assets made by the CRM agent (cleaned photo, swatch, palette) and
// anything the manager corrected by hand are kept as long as the product's photo and type have not changed.
function fromRules(p, prev) {
  const template = templateFor(p);
  const t = TEMPLATES[template];
  const spec = {
    version: VERSION,
    template,
    group: t.group,
    slots: t.slots,
    layer: t.layer,
    fit: fitFor(p, template),
    material: materialFor(p, template),
    pattern: patternFor(p, template),
    source: 'rules',
    image: p.image,
    type: p.type,
    updated: new Date().toISOString(),
  };
  if (prev && prev.image === p.image && prev.type === p.type) {
    for (const key of ['cleanImage', 'texture', 'palette', 'notes', 'confidence']) if (prev[key] !== undefined) spec[key] = prev[key];
    if (prev.source === 'ai' || prev.source === 'manual') {
      Object.assign(spec, pickSpec(prev, { strict: false }));
      spec.source = prev.source;
    }
  }
  return spec;
}

const ASSET = /^\/assets\/uploads\/[A-Za-z0-9-]+\.(png|jpg|webp)$/;
const HEX = /^#[0-9a-f]{6}$/i;

// The parts of a spec the agent or the manager may set, checked. `strict` throws on a bad value (CRM input);
// otherwise bad values are dropped (older saved specs).
function pickSpec(src, { strict = true } = {}) {
  const out = {};
  const bad = msg => { if (strict) throw new HttpError(400, msg); };
  if (src.template !== undefined) {
    if (TEMPLATES[src.template]) Object.assign(out, { template: src.template, group: TEMPLATES[src.template].group, slots: TEMPLATES[src.template].slots, layer: TEMPLATES[src.template].layer });
    else bad('Unknown garment template.');
  }
  if (src.fit && typeof src.fit === 'object') {
    out.fit = {};
    for (const [k, list] of Object.entries(FIT)) {
      if (src.fit[k] === undefined) continue;
      if (list.includes(src.fit[k])) out.fit[k] = src.fit[k];
      else bad(`Unknown ${k} for the fit.`);
    }
  }
  if (src.material !== undefined) {
    if (MATERIALS.includes(src.material)) out.material = src.material;
    else bad('Unknown material.');
  }
  if (src.pattern !== undefined) {
    if (PATTERNS.includes(src.pattern)) out.pattern = src.pattern;
    else bad('Unknown pattern.');
  }
  for (const key of ['cleanImage', 'texture']) {
    if (src[key] === undefined || src[key] === null || src[key] === '') continue;
    if (ASSET.test(src[key])) out[key] = src[key];
    else bad('The cleaned photo must be a CRM upload.');
  }
  if (Array.isArray(src.palette)) out.palette = src.palette.filter(h => HEX.test(h)).map(h => h.toLowerCase()).slice(0, 6);
  if (typeof src.notes === 'string') out.notes = src.notes.slice(0, 400);
  if (typeof src.confidence === 'number' && src.confidence >= 0 && src.confidence <= 1) out.confidence = Math.round(src.confidence * 100) / 100;
  return out;
}

// A spec with changes merged in (fit merges key by key).
function merge(spec, changes) {
  return { ...spec, ...changes, fit: { ...spec.fit, ...(changes.fit || {}) }, updated: new Date().toISOString() };
}

module.exports = { TEMPLATES, FIT, MATERIALS, PATTERNS, VERSION, fromRules, pickSpec, merge, templateFor };
