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
- No CSS/JS frameworks. Scripts are small deferred custom elements:
  `carousel.js` (Reviews arrows), `theme.js` (every page: mini cart, cart
  quantity updates, Add to bag, search dialog + predictive search),
  `product.js` (gallery, variant switching, recommendations) and
  `facets.js` (collection/search filters). Every page still works without
  JavaScript: plain forms, links and a `<noscript>` variant select.
  Animations use `transform` / `opacity` and respect
  `prefers-reduced-motion`.
- Hidden-until-opened UI (mini cart, search dialog) loads its CSS without
  blocking render (`media="print" onload`).
- On the home page the header is transparent and the first hero slides
  under it (Theme settings → Header). The header height lives in
  `--header-height` on `:root`.
- All storefront strings go through `locales/en.default.json`.

## Shop pages

Built on the home page's tokens and pieces: the same `product-card`
snippet (`component-product-card.css`), the centred eyebrow + uppercase
heading (`page-header` snippet = h1 version of `section-heading`), grey
cards and the bronze accent.

- **Product** (`templates/product.json`): `main-product` (gallery with
  thumbnails; blocks for eyebrow, title, rating, price, variant picker,
  quantity, buy buttons, highlights, description, collapsible tabs, apps),
  then the home page's Feature columns and Reviews, then
  `product-recommendations`. Variant changes re-render through the Section
  Rendering API (`?option_values=…&section_id=…`); an option combination
  with no variant shows Unavailable.
- **Collection** (`templates/collection.json`): `main-collection` with
  Search & Discovery filters (sidebar on desktop, panel on phones), sort,
  active-filter pills, pagination.
- **Search** (`templates/search.json`): `main-search` — product grid with
  the same filters, pages/articles list, "Popular right now" row from a
  chosen collection. The header search icon opens a dialog with predictive
  results (`sections/predictive-search.liquid`).
- **Cart** (`templates/cart.json`) and **mini cart**
  (`sections/cart-drawer.liquid`, rendered in the layout): shared
  `cart-line` snippet; quantity / remove update both in place. Theme
  settings → Cart picks drawer vs. cart page after Add to bag, the
  empty-cart collection, order note and accelerated checkout buttons.

Product card ratings read the `reviews.rating` / `reviews.rating_count`
metafields that review apps write.

## Develop

```bash
shopify theme dev --store <store>.myshopify.com
shopify theme check
```
