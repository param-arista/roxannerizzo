# Roxanne Rizzo — Shopify theme

Custom Online Store 2.0 theme for Roxanne Rizzo New York, started from
Shopify's [Skeleton theme](https://github.com/Shopify/skeleton-theme) (MIT,
see `LICENSE.md`).

## Structure

- `layout/theme.liquid` renders the `header-group` and `footer-group`
  section groups around `content_for_layout`.
- `templates/index.json` is the home page: Hero banner → Rating strip →
  Featured products. More sections follow as the design arrives.
- Product, collection, cart, search and other templates are still
  Skeleton's Liquid templates (built from `blocks/container.liquid`) until
  their designs are supplied.

## Sections

| Section | What it is |
| --- | --- |
| `announcement-bar` | Dark strip of short messages (all on desktop, first one on phones) |
| `header` | Logo image or star + text wordmark, centred menu, search / account / wishlist / cart. Phone menu is a `<details>` drawer (no JS) |
| `hero-banner` | Full-width image, accent line + heading, button. Optional phone image; text stacked below or over the image on phones |
| `rating-strip` | Rating summary + one quote with author photo |
| `featured-products` | Eyebrow, heading, text, hand-picked products each with a badge; swipe row on phones |
| `footer` | Basic placeholder footer |

## Speed and accessibility rules

- `assets/critical.css` holds only above-the-fold CSS (reset, tokens,
  buttons, announcement bar, header, hero). Every other section loads its
  own `assets/section-*.css` from inside the section.
- No CSS/JS frameworks; no JavaScript yet. Animations use `transform` /
  `opacity` and respect `prefers-reduced-motion`.
- On the home page the header is transparent and the first hero slides
  under it (Theme settings → Header). The header height lives in
  `--header-height` on `:root`.
- All storefront strings go through `locales/en.default.json`.

## Develop

```bash
shopify theme dev --store <store>.myshopify.com
shopify theme check
```
