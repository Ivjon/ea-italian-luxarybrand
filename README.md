# EA Luxury Italian Brand — Store + CRM

The desktop first fold follows the final EA Luxury reference image (`design/references/`), built as a real header and hero: the photograph is `frontend/assets/editorial/hero-desktop-*.webp/.jpg` (the reference with its painted text removed) and the headline, navigation and bag count are live HTML. Phones get `hero-mobile.jpg` instead.

## Run in VS Code
1. Extract the ZIP.
2. Open this folder in VS Code.
3. Open Terminal.
4. Run:

```bash
npm start
```

Store: http://localhost:3000
CRM / Admin: http://localhost:3000/admin/ (sign-in required)

**Sign-in (one for everyone).** The person icon in the store header opens My account (`/account`), with the site header
and ☰ menu on top. Everyone signs in there with their **username or email** and password: customers stay in the store,
CRM staff are sent on to the CRM (`/admin/`; signed-out visits to it come back here). There is no separate CRM sign-in.
**Create account** (customers) asks for full name, email, phone, username (3–30 letters, numbers, `.` `-` `_`),
password (at least 8 characters) and its confirmation, and acceptance of the terms and conditions; every field is
required, and a field with a problem shows a tip under it saying what to fix (the server checks the same things, and an
email or username already in use is shown on that field). Customers see every order they placed while signed in or with
their email, with its status (Order placed → On its way → Delivered) as you change it in the CRM, and get their name,
email and phone filled in at checkout. Accounts are linked to the CRM customer with the same email (one is added if
needed). Accounts are stored in `backend/data/users.json` (see **Users** below); customer sign-ins last 30 days
(`backend/data/account-sessions.json`). Both files stay out of git.

**My Account (☰ menu).** Track Orders, Wishlist, My Account, Order History, Returns. My Account is `/account`; the
others (`/account/track-orders`, `/account/wishlist`, `/account/order-history`, `/account/returns`) are still being
built and show an "under construction" page. They need a signed-in customer: signed out, the sign-in opens at
`/account?next=<page>` and, once signed in or registered, goes on to that page. Terms of Service (`/terms`, footer) is
an "under construction" page too. The list is `PAGES` in `app.js`.

**Footer.** On every page (copied into each page panel): the logo, About, Visit (Google Maps), Terms of Service and
Contact us (no action yet).

**Checkout.** Empty or wrong fields show the store's tips (as on the account forms); a signed-in customer starts with
their email, phone and name filled in (the full name split at its last word: "Ana Maria Hoxha" → Ana Maria / Hoxha).
**Edit bag** puts an × on each piece of the order summary (no bag drawer); **Done** ends it. The pin button in
Address opens a map (Leaflet with OpenStreetMap, loaded on first use, no key needed): a tap drops a pin, OpenStreetMap's
address search (Nominatim) names the spot, and **Use this address** fills Address, Postal code, City and Country.
Switching to Google Maps needs a Google Maps API key (Maps JavaScript + Geocoding).

**Languages (English / Albanian).** The globe in the header opens Shqip / English; the choice is remembered (without
one, Albanian browsers get Albanian). Every text of the store is translated: `frontend/i18n.js` holds the Albanian
texts, keyed by the English ones. Static page text is translated on load, text built by `app.js` goes through
`tr('English text', {vars})`, and the server answers in the page's language (the page sends `X-Lang`;
`backend/lib/i18n.js` has its messages and the delivery / payment options). In Albanian, prices read `1 250 €` and
dates `6 tetor 2026`. Product content (names, brands, descriptions, colours, sizes) is shown as entered in the CRM,
and the CRM itself stays in English. New text: add it in English in the code and its Albanian version to `SQ` in
`frontend/i18n.js` (or `backend/lib/i18n.js` for a server message).

**One header on every page.** Collections, product pages, checkout and My account are full-screen panels marked
`data-site-header` in `frontend/index.html`: the site header (☰ menu, links, language, search, account, bag) stays
fixed and solid on top of them. Give a new panel the same attribute to get it too. On the home page the header is always
shown: transparent over the hero at the top of the page, solid once you scroll.

**Addresses.** Pages have plain addresses, no `#`: `/` (home), `/men`, `/product/<id>`, `/checkout`, `/account`,
`/search/<words>`, … Links inside the store switch pages without reloading (history API, `route()` in `app.js`); the
server answers any address without a file extension with the store page (`backend/lib/static.js`), so addresses can be
reloaded, bookmarked and shared, and Back works. Old `/#men`-style links are moved to `/men`.

**CRM sign-in.** On the first start the server creates the main admin account (username `admin`) with a random password and
prints it once in the terminal. Change it in the CRM with the key icon (top right). Forgot it? Stop the server, remove
the row with `"main": true` from `backend/data/users.json` and start again for a new one. To set your own instead, start with
`ADMIN_PASSWORD` (and optionally `ADMIN_USER`), e.g. PowerShell: `$env:ADMIN_PASSWORD="choose-a-long-one"; npm start`.
Sessions last 12 hours and end when the server restarts; 8 wrong passwords in 15 minutes pause sign-in for that address.

**Users.** Everyone who can sign in is one row in `backend/data/users.json` (not committed to git), grouped by `role`:
`superadmin` and `admin` (CRM staff), then `customer` (store accounts). Every row has the same columns, so the file
loads straight into one database table:

| Column | Meaning |
| --- | --- |
| `id` | `U1001`, `U1002`, … (primary key) |
| `role` | `superadmin`, `admin` or `customer` |
| `name`, `email`, `phone` | full name; email is unique and a sign-in name |
| `username` | sign-in name, unique ignoring case (`SuperAdmin` = `superadmin`), never contains `@` |
| `main` | `true` for the main Super Admin (the one `ADMIN_PASSWORD` sets) |
| `customerId` | customers only: the linked row in `customers.json` |
| `salt`, `hash` | scrypt password hash (null for staff without a password yet) |
| `termsAccepted` | customers: ISO date they accepted the terms and conditions |
| `created` | ISO date the account was made |

Installs from before this change had `admin.json` and `accounts.json`; the server moves them into `users.json` on start
and deletes them.

No `npm install` is required. The project uses Node.js built-in modules only.
`npm run dev` restarts the server automatically when backend files change.

To use another port (PowerShell): `$env:PORT=4000; npm start`

## Project structure

```
ea-italian-luxarybrand/
├── backend/                 Node.js API + static file server
│   ├── server.js            entry point: /api/* → routes, everything else → frontend/
│   ├── config.js            PORT, DATA_DIR, FRONTEND_DIR, UPLOAD_DIR (all overridable via env vars)
│   ├── routes/
│   │   ├── shop.js          GET /api/products, /api/brands · POST /api/newsletter, /api/contact, /api/store-request
│   │   └── crm.js           orders, customers, leads, products (add/edit/delete) and photo/video uploads
│   ├── lib/
│   │   ├── http.js          JSON responses, body parsing, HttpError
│   │   ├── store.js         read/write the JSON data files
│   │   ├── users.js         users.json: every sign-in (CRM staff and customers), one row each with a role
│   │   ├── auth.js          CRM sessions, password changes
│   │   ├── accounts.js      the one sign-in (all roles), customer sign-up, My account orders
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
× to remove it. **Sizes & stock**: pick the size chart (Clothing, Shoes, Kids clothing, Kids shoes; it follows the
category and type), add its standard sizes in one click (XS–XL, 35–46, 2Y–14Y, 20–35) or type any other size
(38.5, XXL, 5Y…), and give every size its quantity. With sizes, the product's stock is their total and the product
page asks customers to choose a size. In the store's Filter panel, sizes in stock appear
automatically under Clothing sizes or Shoe sizes. **New arrival** puts a "New arrival" label on the piece and
shows it first in New Arrivals (topped up with the latest other pieces). **Discount (%)** shows the old price
crossed out; customers find these pieces at `/sale`, or first with the Filter panel's "On Sale" sort.
Saving updates
`backend/data/products.json`; new products are added at the end, so they lead the "New arrivals" sort.

Photos (JPG, PNG, WebP, GIF, up to 15 MB) and videos (MP4, MOV, WebM, up to 95 MB, under GitHub's 100 MB file limit)
are saved in `frontend/assets/uploads/` with random names. Use the ‹ › buttons to order them; the first photo is
the cover shown on product cards and in the bag. For MP4 use H.264, which plays in every browser.

## Product page
Clicking a product opens `/product/<id>`: the photos and videos (thumbnails on the right, videos marked ▶),
the colour (a dropdown with swatches when there are several; the chosen colour goes into the bag),
**Find a store** and **Add to bag**, a breadcrumb, and the **Info & Details** and **Product care** panels (each only
shown when that product has the information). **Find a store** asks for a name and email and saves the request as a
lead in CRM → Leads ("Store request: …").

## Product images
Product photos are shown whole (`object-fit: contain`) inside a 4:5 frame with a `#eeebe7` background.
For the best result, use **600×750 photos on a plain light background**.

## Menu and collections
The header links and the ☰ menu (top left, after every brand with its logo) offer the same shop: New Arrivals, On Sale,
Men, Women, Kids. Men, Women and Kids list the main product groups (Clothing, Shoes, Bags, Jewellery, Accessories, the
groups in `catalog.js`), each with its own collection: `/men/clothing`, `/women/shoes`,
`/kids/bags`, … In the header they open a cream panel under it on hover or keyboard focus (the header turns solid while
it is open, also over the hero); in the ☰ menu they open a sub-menu that slides in over it (‹ to go back). Both are built
from one list, `SHOP_GROUPS` in `app.js`. Each link opens a full-screen collection with a black **Filter** button that opens a
black panel on the right, in this order: **Search** (within the collection, as you type), **Price** (two handles: a
starting and a top price), **Sort by** (New Arrivals, On Sale (discounted first), Price: Low to High, High to Low),
**Category** (the main groups; + shows a group's types, and ticking a group ticks all of them), **Brands** (all of them),
**Colour** (two columns), **Clothing sizes** and **Shoe sizes** (those in stock). Every list in the panel is capped at
the same height and scrolls inside when longer. Changes in the panel apply only with **Apply** or a click outside it
(× or Escape closes it without applying); the brand loader shows while they apply. The applied filters are listed as
chips beside the Filter button, each with × to remove it at once; the row scrolls sideways when they don't fit. Which sections a page shows is set in `filterSections` (`app.js`);
brand pages leave out Brands, and New Arrivals and On Sale offer only the two price sorts (newest first until one is
picked; clicking it again goes back). Collections:
`/all`, `/new-arrivals` (the pieces ticked New arrival, newest first, topped up with the latest other
pieces to at least 8; the home page shows the first 4, 3 on tablets, 2 on phones, with See more), `/sale` (pieces with a discount), `/women`,
`/men`, `/kids`, `/<men|women|kids>/<group>`, `/watches`, `/jewellery/<type>`, `/shoes/<type>`, `/brand/<brand>`.
The header links (New Arrivals, On Sale, Men, Women, Kids; About scrolls to the story band) and the Discover links on
the Women/Men banners open it too. The globe icon in the header is the language picker, not wired up yet.
Links to sections of the home page (About, Brands, Visit, the logo, …) scroll there without changing the address bar;
from another page the home page opens first.

A product's `type` in `backend/data/products.json` decides its `/jewellery/<type>` or `/shoes/<type>` collection (shown in
the product page's breadcrumb; these collections and `/all`, `/watches` are no longer in the menu but still open by address):
- Jewellery: `Necklaces`, `Watches`, `Rings`, `Earrings`, `Sunglasses`
- Shoes: `Heels`, `Sandals`, `Sneakers`, `Boots`, `Loafers`

Other types (`Clothing`, `Bags`) appear under `/all`, Women/Men and their brand. A section with no products
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
- Desktop first fold matching the approved final visual, with real text and a live bag count
- Local image assets (no remote image dependency)
- Responsive mobile layout
- Brand filter and category filter
- Product catalogue
- Search (header icon on every screen size): results as you type; Enter opens them all as a collection (`/search/<query>`)
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
