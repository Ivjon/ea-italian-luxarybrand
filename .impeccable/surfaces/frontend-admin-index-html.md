---
version: 1
slug: "frontend-admin-index-html"
primary_target: "frontend/admin/index.html"
related_targets: ["frontend/admin/admin.js","frontend/admin/admin.css"]
---

## Mode

Operate

## Audience and job

The store manager checks the business in a few seconds, at a desk or on a phone, and opens Orders, Products, or Inventory only when something needs action.

## Task

Read three facts: total revenue, the pieces with fewer than 6 in stock (name, brand, how many left), and each brand’s share of order-line revenue.

## Direction

Share field, inside the existing CRM. Desk: one revenue figure, then columns as wide as each brand’s share of sales. Phone: its own stack — revenue, one block per brand with a large percent, then full-width stock rows. Only one layout is shown. When no order has a brand, that part is absent, with no note. The other CRM pages stay as they are.

## Unresolved

Those other pages will be reorganized later. The sample orders have no line items, so the brand field stays absent until an order includes pieces.
