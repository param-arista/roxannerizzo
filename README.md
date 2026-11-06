# Roxanne Rizzo — Shopify theme

Custom Online Store 2.0 theme for Roxanne Rizzo New York, started from
Shopify's [Skeleton theme](https://github.com/Shopify/skeleton-theme) (MIT,
see `LICENSE.md`).

## Structure

- `layout/theme.liquid` renders the `header-group` and `footer-group`
  section groups around `content_for_layout`.
- `templates/index.json` is the home page (see the table below).
- Product, collection, cart, search and other templates are still
  Skeleton's Liquid templates (built from `blocks/container.liquid`) until
  their designs are supplied.

## Sections

Home page order (`templates/index.json`):

| Section | What it is |
| --- | --- |
| `announcement-bar` | Dark strip of short messages (all on desktop, first one on phones) |
| `header` | Logo image or star + text wordmark, centred menu, search / account / wishlist / cart. Phone menu is a `<details>` drawer (no JS) |
| `hero-banner` | Full-width image, accent line + heading, button. Optional phone image; text below or over the image on phones |
| `rating-strip` | Rating summary + one quote with author photo |
| `featured-products` | Product grid with badges and star ratings. Used twice: Explore Favorites (3 boxed cards) and The Travel Collection (4 cards with Shop Now, "Product row with buttons" preset). Products from blocks, else a collection |
| `founder-quote` | Why Bronze Glow: large quote between bronze corner brackets |
| `image-with-text` | Our Story: image, heading, rich text, columns under bronze rules |
| `reviews` | Review cards in a scroll-snap carousel; arrows from `assets/carousel.js` |
| `logo-list` | Press logos row |
| `promo-cards` | Shop the Glow: large images with title + button |
| `feature-columns` | How It Wears: columns on a grey panel |
| `contact-feature` | A Conversation with Roxanne: Shopify contact form beside an image |
| `social-grid` | Follow the Glow: text + hand-picked Instagram posts (no live feed; that needs an app) |
| `footer` | Brand + newsletter + social icons, menus, customer service, image, credit line |

Star ratings on product cards read the standard `reviews.rating` and
`reviews.rating_count` product metafields that review apps (Judge.me,
Shopify Product Reviews, …) write; without them no stars show.

Social links live in Theme settings → Social media. The footer's Products
column expects a menu with the handle `footer-products`.

## Speed and accessibility rules

- `assets/critical.css` holds only above-the-fold CSS (reset, tokens,
  buttons, announcement bar, header, hero). Every other section loads its
  own `assets/section-*.css` from inside the section.
- No CSS/JS frameworks. The only script is `assets/carousel.js` (deferred, Reviews arrows); everything else works without JavaScript. Animations use `transform` /
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
