# EA Luxury Italian Brand — Store + CRM

This version is rebuilt to visually match the final EA Luxury reference image as closely as possible on desktop. The exact generated reference is included locally and used for the first fold so the appearance does not change because of missing external assets.

## Run in VS Code
1. Extract the ZIP.
2. Open the folder `ea-luxury-italian-brand` in VS Code.
3. Open Terminal.
4. Run:

```bash
npm start
```

Store: http://localhost:3000
CRM / Admin: http://localhost:3000/admin/

No `npm install` is required. The project uses Node.js built-in modules only.
`npm run dev` restarts the server automatically when backend files change.

To use another port (PowerShell): `$env:PORT=4000; npm start`

## Project structure

```
ea-luxury-italian-brand/
├── backend/                 Node.js API + static file server
│   ├── server.js            entry point: /api/* → routes, everything else → frontend/
│   ├── config.js            PORT, DATA_DIR, FRONTEND_DIR, UPLOAD_DIR (all overridable via env vars)
│   ├── routes/
│   │   ├── shop.js          GET /api/products, /api/brands · POST /api/newsletter, /api/contact, /api/store-request
│   │   └── crm.js           orders, customers, leads, products (add/edit/delete) and photo/video uploads
│   ├── lib/
│   │   ├── http.js          JSON responses, body parsing, HttpError
│   │   ├── store.js         read/write the JSON data files
│   │   ├── validate.js      input validation for request bodies
│   │   ├── uploads.js       saves CRM uploads (type, size and file-content checks)
│   │   └── static.js        serves frontend/ and uploads safely, with byte ranges for video
│   └── data/                products, orders, customers, leads (JSON)
├── frontend/                everything the browser loads
│   ├── index.html, app.js, styles.css     storefront
│   ├── catalog.js                         shared by store + CRM: menu product types, garment-care guide
│   ├── admin/                             CRM (index.html, admin.js, admin.css)
│   └── assets/
│       ├── uploads/         photos and videos uploaded in the CRM (created on first upload)
│       ├── products/        product photos — 600×750 (4:5) on a #eeebe7 background
│       ├── editorial/       Women/Men banners, mobile hero
│       ├── brand/           logo, transparent (ea-logo-dark.svg), loader mark (ea-mark.svg), tab icon (ea-icon.png)
│       └── brands/          brand logos for the home brand row and the ☰ menu, named after the brand
│                            (armani.png, dolce-gabbana.png, …): transparent PNG, 78 px tall with the logo
│                            centred; shown 30 px tall on the home page (24 px on phones and in the menu)
└── design/                  reference mockups + the script that cut the product photos (not served)
```

## Adding and editing products (CRM)
CRM → **Products** → **Add product**, or click a product to edit it. Everything on the store's product page comes
from this form: name, brand, category (Women / Men / Unisex), type, price, stock, colour, product code, photos and
videos, description, composition, details (one per line), the garment-care symbols and optional care notes
(shown in the product page's **Product care** panel). **Colours**: list every colour the product comes in. Type a
colour (a name like "Navy" or a code like `#7A4B2C`, with a live swatch), click a named swatch or pick anywhere on the
spectrum, then **+ Add colour** (or Enter). Click a colour to edit its shade, ★ to make it the main (first) colour,
× to remove it. Saving updates
`backend/data/products.json`; new products are added at the end, so they lead the "New arrivals" sort.

Photos (JPG, PNG, WebP, GIF, up to 15 MB) and videos (MP4, MOV, WebM, up to 95 MB, under GitHub's 100 MB file limit)
are saved in `frontend/assets/uploads/` with random names. Use the ‹ › buttons to order them; the first photo is
the cover shown on product cards and in the bag. For MP4 use H.264, which plays in every browser.

## Product page
Clicking a product opens `#product/<id>`: the photos and videos (thumbnails on the right, videos marked ▶),
the colour (a dropdown with swatches when there are several; the chosen colour goes into the bag),
**Find a store** and **Add to bag**, a breadcrumb, and the **Info & Details** and **Product care** panels (each only
shown when that product has the information). **Find a store** asks for a name and email and saves the request as a
lead in CRM → Leads ("Store request: …").

## Product images
Product photos are shown whole (`object-fit: contain`) inside a 4:5 frame with a `#eeebe7` background.
For the best result, use **600×750 photos on a plain light background**.

## Menu and collections
The ☰ menu (top left) lists every brand with its logo, then All products, Women, Men, Watches, and the
**Jewellery** and **Shoes** sub-menus. Each link opens a full-screen collection with a brand dropdown and a black
**Filter** button that opens a panel on the right: sort (price low→high, high→low, new arrivals), a price slider in
€100 steps (a circle at every €100) and the collection's colours. Collections:
`#all`, `#women`, `#men`, `#watches`, `#jewellery/<type>`, `#shoes/<type>`, `#brand/<brand>`.
**MEN** / **WOMEN** in the header and the Discover links on the Women/Men banners open it too.

A product's `type` in `backend/data/products.json` decides which sub-menu it appears in:
- Jewellery: `Necklaces`, `Watches`, `Rings`, `Earrings`, `Sunglasses`
- Shoes: `Heels`, `Sandals`, `Sneakers`, `Boots`, `Loafers`

Other types (`Clothing`, `Bags`) appear under All products, Women/Men and their brand. A section with no products
yet shows "New pieces are arriving soon." The "New arrivals" sort shows the products added last in that file
first, so add new products at the end. While a collection opens, the EA mark fills from the bottom up, then fades out.

## API

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/products`, `/api/brands` | |
| POST | `/api/newsletter` | `{ email }` |
| GET | `/api/crm/orders`, `/api/crm/customers`, `/api/crm/leads` | |
| POST | `/api/crm/customers` | `{ name, email, city? }` — email must be unique |
| POST | `/api/crm/leads` | `{ name, email, source? }` |
| POST | `/api/crm/orders` | `{ customerId, items, total, status? }` — also updates the customer's orders and spend |
| POST | `/api/crm/products` | `{ name, brand, category, type, price, stock, media[], color?, code?, description?, composition?, details?, care[]? }` |
| PUT | `/api/crm/products` | same fields plus `id` — replaces the product |
| DELETE | `/api/crm/products` | `{ id }` |
| POST | `/api/crm/uploads` | raw file body with its `Content-Type` → `{ type, src }` |
| POST | `/api/store-request` | `{ name, email, productId }` — saved as a lead |

Errors come back as `{ ok: false, message }` with a 4xx status.

## Included
- Pixel-faithful desktop first fold based on the approved final visual
- Local image assets (no remote image dependency)
- Responsive mobile layout
- Brand filter and category filter
- Product catalogue
- Search
- Shopping bag saved in localStorage
- Newsletter endpoint
- CRM/Admin dashboard
- Orders (with "New order")
- Customers
- Leads
- Products
- Inventory / low-stock view
- CRM search (customers, leads, orders, products)
- Add-customer, add-lead and new-order actions validated and persisted to local JSON files

## Important
This is a development/demo CRM. The `/api/crm/*` routes have no authentication — on a public server anyone could
edit products or upload files. Add a login before putting the CRM online. For production, also add a database,
payment processing, backups, audit logging and secure deployment.
