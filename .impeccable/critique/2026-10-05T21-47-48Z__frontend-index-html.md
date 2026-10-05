---
target: landing
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:C:\\Users\\User\\Desktop\\ea italian-luxarybrand\\frontend\\index.html"
target_fingerprint: "sha256:b7845f66f56fe4e2891c7fbcd3d349cef8d94704281df447e2e3070cc563eeef"
target_path: "C:\\Users\\User\\Desktop\\ea italian-luxarybrand\\frontend\\index.html"
timestamp: 2026-10-05T21-47-48Z
slug: frontend-index-html
---
Method: dual-agent (A: a0093fe5e1524f45c · B: aa8eb363b37c9b376). Target: frontend/index.html (storefront home), desktop 1440 / 1024 / mobile 390.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Desktop bag badge painted into hero PNG (shows count on empty bag, never updates); search results render ~1,800px below fold |
| 2 | Match System / Real World | 2 | Account icon opens CRM; "About" lands on Women/Men banners; fake carousel "01 / 03" + arrows |
| 3 | User Control and Freedom | 2 | Esc doesn't close search; query persists after close; collection overlays drop menu/search/bag |
| 4 | Consistency and Standards | 1 | Four typefaces; desktop vs mobile headline faces differ; different nav sets per breakpoint |
| 5 | Error Prevention | 2 | Sized products route to size selection (good); customer-facing link into editable back office (bad) |
| 6 | Recognition Rather Than Recall | 2 | No search under 900px; no live desktop bag count |
| 7 | Flexibility and Efficiency | 1 | Search broken on desktop, absent on mobile |
| 8 | Aesthetic and Minimalist Design | 2 | Restraint undercut by fake carousel controls, 3/4-empty New Arrivals, same model three times |
| 9 | Error Recovery | 1 | "Is the backend running? (Service unavailable)", no retry |
| 10 | Help and Documentation | 1 | No shipping/returns/contact/authenticity/boutique info |
| **Total** | | **16/40** | **Poor** |

## Design Specificity Verdict
Category-interchangeable apart from the photography. Desktop first fold is a 1.6 MB PNG screenshot (frontend/assets/ea-luxury-home.png) with ten transparent hotspots (index.html:16-29): nav, H1, CTA, bag badge, carousel controls are pixels. Below the fold: four kicker+serif-H2 sections, logo strip, 50/50 banners, product grid, black band, newsletter, thin footer; generic copy; four unrelated typefaces (baked Didone, Georgia, Arial, Jost-only-in-filter-drawer).
Detector: CLI 36 warnings (undersized-ui-text 21, kicker-above-heading 5, cramped-padding 5 [all false positives], hero-eyebrow-chip, wide-tracking [likely FP], all-caps-body [likely FP], buried-raster [FP, loader], overused-font). Browser 34 desktop / 38 mobile; browser-only: newsletter placeholder 4.4:1 + unlabeled input, mobile H1 30px past its box (unclipped), 9px product-card text. Overlay injected headless; no user-visible overlay.

## Priority Issues
- [P0] Storefront links into unprotected CRM: .hot.account (index.html:26) and footer "CRM / Admin" (index.html:69) → /admin/; /admin/ and /api/crm/* answer without login (customer names, order totals). Fix: remove admin links; account → sign-in or remove; add auth server-side. Command: /impeccable harden
- [P0] Search broken/missing: results render into #productGrid ~1,800px down while panel stays empty; no search ≤900px; Esc doesn't close; closed panel only translated (stays in tab order); state.search persists; unlabeled input. Fix: results in overlay + #search/<q> view, mobile search icon, Esc/clear/visibility:hidden/label. Command: /impeccable harden
- [P1] Desktop first fold is a screenshot: 1.6 MB PNG, no visible H1, painted bag badge, dead carousel arrows, downloaded on phones, soft on retina/1920, ~8px nav at 1024. Fix: real shared responsive header with live bag count; <picture> photo hero with live H1/subtitle/CTA in a display face; build or delete carousel. Command: /impeccable layout
- [P1] New Arrivals shows one product (only p2 isNew); Men filter empty; hero CTA lands there. Fix: fill to ≥4 (ticked first, then latest); hide empty filters; CTA → #all. Command: /impeccable harden
- [P1] No trust layer: no authenticity/shipping/returns/contact/boutique/legal; About mis-targeted. Fix: house section (boutique, advisors, provenance), reassurance strip, client-services footer. Command: /impeccable clarify

## Persona Red Flags
Jordan: dead hero arrows; person icon → CRM; About → wrong section; one bag under New Arrivals; no returns/authenticity; search shows nothing.
Riley: API down → developer copy, no retry, empty brands/menu; broken image alt spills under badge; search state leaks into New Arrivals; tab past footer → invisible search controls; newsletter outline:0.
Casey: hidden 1.6 MB PNG downloaded; no search; sub-44px targets (Discover, filters, card Add to bag, footer, 38px hero CTA); ☰/BAG top corners; drawer 100vh hides checkout button under iOS toolbar; 1.5s forced loader.

## Minor Observations
Jost loaded for filter drawer only; font-weight:300 on Arial no-op; 9px card text; ~5px logo tagline. women.jpg 435×379 shown at 699×540; same male model ×3; white halos on cut-outs. Banners: only "Discover" clickable; cards have two links each. Newsletter placeholder-as-label, message not a live region. 900px breakpoint sends 1024 tablets to PNG hero; ≤900 header loses Men/Women/Search.

## Questions to Consider
1. Cover the logos: what on this page could only be EA?
2. Why is the most important frame a picture of a website?
3. Where is trust for a €1,250 purchase from an unfamiliar reseller earned?
4. 5 of 8 pieces are womenswear, one man appears three times: who is this store for?
