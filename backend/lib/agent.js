// The CRM's wearable agent: looks at a product's cleaned photo (made in the CRM, frontend/admin/wearable-agent.js)
// with Claude vision and returns the garment template, cut, material and pattern for the 3D mannequin.
// Optional: it runs when ANTHROPIC_API_KEY is set and the official SDK is installed (`npm install`). Without them the
// agent uses the rules in lib/wearable.js, and the store works the same.
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('../config');
const wearable = require('./wearable');

const MODEL = process.env.WEARABLE_MODEL || 'claude-opus-5-5';

let client = null;
let missing = '';
function getClient() {
  if (client || missing) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    missing = 'Set ANTHROPIC_API_KEY to let the agent look at photos with AI.';
    return null;
  }
  try {
    const mod = require('@anthropic-ai/sdk');
    const Anthropic = mod.default || mod;
    client = new Anthropic();
  } catch {
    missing = 'Run npm install to add the Anthropic SDK used by the agent.';
  }
  return client;
}

const status = () => (getClient() ? { ai: true, model: MODEL } : { ai: false, reason: missing });

// What Claude must answer, as a JSON schema (structured outputs guarantee the shape).
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['template', 'fit', 'material', 'pattern', 'palette', 'confidence', 'notes'],
  properties: {
    template: { type: 'string', enum: Object.keys(wearable.TEMPLATES) },
    fit: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(wearable.FIT),
      properties: Object.fromEntries(Object.entries(wearable.FIT).map(([k, list]) => [k, { type: 'string', enum: list }])),
    },
    material: { type: 'string', enum: wearable.MATERIALS },
    pattern: { type: 'string', enum: wearable.PATTERNS },
    palette: { type: 'array', items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
};

const SYSTEM = `You prepare luxury fashion products for a 3D fitting room. A segmented display mannequin (man, woman or child) wears each piece, built from a garment template.

From the product photo and its catalogue fields, choose:
- template: the garment template that matches the piece's shape.
- fit: hem (where the body of a top, dress, skirt or coat ends; "none" for pieces without one), sleeve, leg (length of trouser legs or shorts; for boots, the shaft height), shape (the silhouette), collar and closure. Use "none" for anything the piece does not have.
- material and pattern: what the outer surface looks like in the photo.
- palette: up to 4 hex colours actually visible on the piece, the main colour first. Ignore background, hangers and props.
- confidence: 0 to 1, how sure you are the template and fit are right.
- notes: one short sentence for the store manager about anything the template cannot show (e.g. a belt, a print, embroidery).

The catalogue fields are written by the store and are usually right about the type; the photo decides the cut, colours and surface.`;

// Reads a CRM upload as base64 (only files in the upload folder).
function readUpload(src) {
  const m = /^\/assets\/uploads\/([A-Za-z0-9-]+\.(png|jpg|webp))$/.exec(src || '');
  if (!m) return null;
  const file = path.join(UPLOAD_DIR, m[1]);
  if (!fs.existsSync(file)) return null;
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[m[2]];
  return { media_type: type, data: fs.readFileSync(file).toString('base64') };
}

// Asks Claude for the spec. Returns the checked fields to merge, or throws with a message for the CRM.
async function analyze(product, imageSrc) {
  const c = getClient();
  if (!c) throw new Error(missing);
  const image = readUpload(imageSrc);
  if (!image) throw new Error('The agent needs a cleaned photo of the piece first.');
  const fields = { brand: product.brand, name: product.name, gender: product.category, type: product.type, composition: product.composition, description: product.description, colours: (product.colors || []).map(c2 => c2.name) };

  let response;
  try {
    response = await c.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', ...image } },
        { type: 'text', text: `Catalogue fields:\n${JSON.stringify(fields, null, 2)}` },
      ],
    }],
    });
  } catch (err) {
    // Messages for the store manager; the details go to the server log.
    console.error('Wearable agent AI call failed:', err.message);
    if (err.status === 401 || err.status === 403) throw new Error('The AI key was refused: check ANTHROPIC_API_KEY.');
    if (err.status === 429 || err.status === 529) throw new Error('The AI is busy right now. Try again in a minute.');
    throw new Error('The AI could not be reached. The rules were used instead.');
  }
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to look at this photo. The rules were used instead.');
  if (response.stop_reason === 'max_tokens') throw new Error('The AI answer was cut short. Try again.');
  const text = response.content.find(b => b.type === 'text');
  if (!text) throw new Error('The AI gave no answer. Try again.');
  return wearable.pickSpec(JSON.parse(text.text), { strict: false });
}

module.exports = { status, analyze, MODEL };
