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
│   ├── config.js            PORT, DATA_DIR, FRONTEND_DIR (all overridable via env vars)
│   ├── routes/
│   │   ├── shop.js          GET /api/products, /api/brands · POST /api/newsletter, /api/contact
│   │   └── crm.js           GET/POST /api/crm/orders, /api/crm/customers, /api/crm/leads
│   ├── lib/
│   │   ├── http.js          JSON responses, body parsing, HttpError
│   │   ├── store.js         read/write the JSON data files
│   │   ├── validate.js      input validation for POST bodies
│   │   └── static.js        serves frontend/ safely
│   └── data/                products, orders, customers, leads (JSON)
├── frontend/                everything the browser loads
│   ├── index.html, app.js, styles.css     storefront
│   ├── admin/                             CRM (index.html, admin.js, admin.css)
│   └── assets/
│       ├── products/        product photos — 600×750 (4:5) on a #eeebe7 background
│       └── editorial/       Women/Men banners, mobile hero
└── design/                  reference mockups + the script that cut the product photos (not served)
```

## Product images
Product photos are shown whole (`object-fit: contain`) inside a 4:5 frame with a `#eeebe7` background.
For the best result, add new photos as **600×750 JPGs on a plain light background**, save them in
`frontend/assets/products/`, and point the product's `image` field in `backend/data/products.json` at them.

## API

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/products`, `/api/brands` | |
| POST | `/api/newsletter` | `{ email }` |
| GET | `/api/crm/orders`, `/api/crm/customers`, `/api/crm/leads` | |
| POST | `/api/crm/customers` | `{ name, email, city? }` — email must be unique |
| POST | `/api/crm/leads` | `{ name, email, source? }` |
| POST | `/api/crm/orders` | `{ customerId, items, total, status? }` — also updates the customer's orders and spend |

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
This is a development/demo CRM. The `/api/crm/*` routes have no authentication. For production, add real authentication, a database, payment processing, backups, audit logging and secure deployment.
