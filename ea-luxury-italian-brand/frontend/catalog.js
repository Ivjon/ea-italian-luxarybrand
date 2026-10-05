// Shared by the store (app.js) and the CRM (admin.js): the product types behind the Jewellery / Shoes menus,
// and the garment-care guide (ISO 3758-style symbols) that admins tick per product.
window.EA_CATALOG = (() => {
  const icon = body => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
  const label = (t, y, size) => `<text x="16" y="${y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${size}" fill="currentColor" stroke="none">${t}</text>`;
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.25" fill="currentColor" stroke="none"/>`;
  const cross = '<path d="M4 4l24 24M28 4L4 28"/>';
  const tub = '<path d="M3 10l2.6 15h20.8L29 10"/><path d="M4 12.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0 4 1.5 6 0"/>';
  const bleach = '<path d="M16 4.5l13 22.5H3z"/>';
  const square = '<rect x="4.5" y="4.5" width="23" height="23"/>';
  const iron = '<path d="M3 24h25v-3c0-5-3-8.5-8-8.5h-9L3 24z"/><path d="M11 12.5c0-3 1.5-4.5 4-4.5h9"/>';
  const ring = '<circle cx="16" cy="15" r="10.5"/>';
  const bar = y => `<path d="M7 ${y}h18"/>`;
  const hand = '<path d="M12.5 22.5c-1-1.2-2.4-3-2.4-3a1.1 1.1 0 0 1 1.8-1.2l1.1 1.3v-5.8a1.1 1.1 0 0 1 2.2 0v4m0-.5v-1.5a1.1 1.1 0 0 1 2.2 0v2m0-1a1.1 1.1 0 0 1 2.2 0v1m0-.2a1.1 1.1 0 0 1 2 0v2.6c0 1.6-1.2 2.3-2.4 2.3"/>';

  // Sizes: letter sizes in wearing order, then numbers (shoes) ascending, then anything else alphabetically.
  const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const sizeRank = s => {
    const i = LETTERS.indexOf(String(s).toUpperCase());
    if (i >= 0) return [0, i];
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? [1, n] : [2, 0];
  };
  const sortSizes = list => [...list].sort((a, b) => {
    const [ga, va] = sizeRank(a), [gb, vb] = sizeRank(b);
    return ga - gb || va - vb || String(a).localeCompare(String(b));
  });

  return {
    sortSizes,
    sizePresets: {
      clothing: ['XS', 'S', 'M', 'L', 'XL'],
      shoes: Array.from({ length: 12 }, (_, i) => String(35 + i)),
    },
    groups: {
      jewellery: ['Necklaces', 'Watches', 'Rings', 'Earrings', 'Sunglasses'],
      shoes: ['Heels', 'Sandals', 'Sneakers', 'Boots', 'Loafers'],
    },
    otherTypes: ['Clothing', 'Bags'],
    care: [
      { key: 'wash-30', title: 'Machine wash 30 °C', text: 'Machine wash at a maximum of 30 °C, normal process.', svg: icon(tub + label('30', 22.5, 8)) },
      { key: 'wash-30-gentle', title: 'Machine wash 30 °C, gentle', text: 'Machine wash at a maximum of 30 °C on a gentle cycle.', svg: icon(tub + label('30', 22.5, 8) + bar(29)) },
      { key: 'hand-wash', title: 'Hand wash', text: 'Wash by hand in water at a maximum of 40 °C. Do not wring.', svg: icon(tub + hand) },
      { key: 'do-not-wash', title: 'Do not wash', text: 'Do not wash in water, dry clean.', svg: icon(tub + cross) },
      { key: 'do-not-bleach', title: 'Do not bleach', text: 'Do not bleach. Use a bleach-free detergent to keep colours from fading.', svg: icon(bleach + cross) },
      { key: 'tumble-dry-low', title: 'Tumble dry low', text: 'Tumble dry at a low temperature.', svg: icon(square + '<circle cx="16" cy="16" r="8"/>' + dot(16, 16)) },
      { key: 'do-not-tumble-dry', title: 'Do not tumble dry', text: 'Not suitable for tumble drying.', svg: icon(square + '<circle cx="16" cy="16" r="8"/>' + cross) },
      { key: 'dry-flat', title: 'Dry flat', text: 'Dry flat, away from direct heat and sunlight.', svg: icon(square + '<path d="M9 16h14"/>') },
      { key: 'line-dry', title: 'Line dry', text: 'Hang to dry.', svg: icon(square + '<path d="M4.5 10.5c4-4 19-4 23 0"/>') },
      { key: 'iron-low', title: 'Iron at low temperature', text: 'Iron at a maximum soleplate temperature of 110 °C, without steam.', svg: icon(iron + dot(16, 19)) },
      { key: 'iron-medium', title: 'Iron at medium temperature', text: 'Iron at a maximum soleplate temperature of 150 °C.', svg: icon(iron + dot(13.5, 19) + dot(18.5, 19)) },
      { key: 'do-not-iron', title: 'Do not iron', text: 'Do not iron or steam.', svg: icon(iron + cross) },
      { key: 'dry-clean-p', title: 'Dry clean (P)', text: 'Professional dry cleaning with tetrachloroethene and all solvents listed for symbol F, normal process.', svg: icon(ring + label('P', 19.5, 12)) },
      { key: 'dry-clean-p-mild', title: 'Dry clean (P), mild', text: 'Professional dry cleaning with tetrachloroethene and all solvents listed for symbol F, gentle process.', svg: icon(ring + label('P', 19.5, 12) + bar(29.5)) },
      { key: 'dry-clean-f', title: 'Dry clean (F)', text: 'Professional dry cleaning with hydrocarbon solvents only, normal process.', svg: icon(ring + label('F', 19.5, 12)) },
      { key: 'dry-clean-f-mild', title: 'Dry clean (F), mild', text: 'Professional dry cleaning with hydrocarbon solvents only, gentle process.', svg: icon(ring + label('F', 19.5, 12) + bar(29.5)) },
      { key: 'do-not-dry-clean', title: 'Do not dry clean', text: 'Not suitable for professional dry cleaning.', svg: icon(ring + cross) },
    ],
  };
})();
