# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the store manager (EA Manager, Store Admin). They open the admin to check the business in a few seconds, at a desk or on a phone, then open Orders, Products, or Inventory only when something needs action.

## Product Purpose

EA Luxury Italian Brand is a multi-brand luxury storefront with an in-house CRM. The store sells pieces from Italian fashion houses. The CRM is where the manager keeps products, stock, orders, customers, and leads. Success on the admin home is that the manager can tell whether the business is healthy without reading a dense dashboard.

## Positioning

One house, many brands: the storefront and the CRM share one catalog. A sale at checkout becomes an order the manager can see, and the stock figure is the same number the product page uses.

## Operating Context

The manager uses the web CRM at `/admin/`, on a desk and on a phone. There is no login yet. Home is the first screen they see when they open the admin. Orders, Products, Customers, Leads, and Inventory stay as they are for now and will be reorganized later. The public store is at `/`.

## Capabilities and Constraints

- Data is JSON files (products, orders, customers, leads). There is no database. CRM routes have no authentication. This is a development demo and is not production-secure.
- Total revenue is the sum of order totals, in euro. The CRM formats money in euro with no cents.
- Low stock is a product whose stock is under 6, the rule the CRM already uses. When a product has sizes, stock is the total of those quantities.
- Per-brand sales is each brand’s share of money actually sold: order-line revenue (price × quantity), grouped by the line’s brand. It is not a share of catalog list prices.
- Orders entered in the CRM without piece details have no brand. They still count in total revenue and are left out of the brand split. The home shows that truth without an explanatory note. The sample orders in `backend/data/orders.json` have no line items, so a brand split from real data is empty until an order includes pieces. Checkout can save orders whose lines include a brand. Do not invent line items for the demo.
- This pass replaces only the first screen. It does not reorganize the other CRM sections.
- Desktop and phone each have their own home layout. One is not a squeezed copy of the other.
- Low stock on the home is the count plus the pieces that are low: name, brand, and how many are left, short enough to scan. Inventory remains the full stock list.

## Brand Commitments

The name is EA Luxury Italian Brand. The manager asked for a home that is modern, easy to grasp, and not overwhelming. Logo and tab icon live in `frontend/assets/brand/`. Do not invent a new brand name.

## Evidence on Hand

- Admin entry: `frontend/admin/index.html`, `frontend/admin/admin.js`, `frontend/admin/admin.css`.
- Sample orders have id, customer, item count, total, status, and date. They have no lines and no brand.
- Checkout (`backend/routes/checkout.js`) can store line items that include brand.
- Catalog brands include Armani, Moschino, Versace, Valentino, Dolce & Gabbana, and Philipp Plein.
- Do not invent customers, revenue, or brand-sales figures that order lines do not support.

## Product Principles

1. The first screen answers how the business is doing, and nothing else.
2. A number is shown only when the data supports it. Revenue that has no brand stays visible as unattributed.
3. Desk and phone are both first-class, and each has its own composition.
4. Action stays in the existing sections. Home does not become a second Orders, Products, or Inventory page.
5. Later reorganization of the other pages must stay possible.
