/**
 * Site-wide behaviour, loaded deferred on every page. Every feature here
 * enhances markup that already works without JavaScript:
 *   <quantity-input>     − / + buttons on a number input
 *   <cart-drawer>        the mini cart dialog (header bag icon, Add to bag)
 *   <cart-items>         in-place quantity changes / removal (page + drawer)
 *   <product-form>       Add to bag without leaving the page
 *   <search-modal>       header search dialog
 *   <predictive-search>  live suggestions inside it
 *   <sticky-header>      sticky / hide-on-scroll header, solid once scrolled
 *   <announcement-bar>   one-at-a-time message slider (arrows + autoplay)
 */
(() => {
  const theme = window.theme || { routes: {}, strings: {} };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const announce = (message) => {
    const region = document.getElementById('ThemeAnnouncer');
    if (!region) return;
    region.textContent = '';
    window.setTimeout(() => (region.textContent = message), 60);
  };

  const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');

  const debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  };

  /** Header bag icon: count bubble + its accessible label. */
  const updateCartIcon = (count, label) => {
    const bubble = document.querySelector('[data-cart-bubble]');
    const labelEl = document.querySelector('[data-cart-label]');
    if (bubble) {
      bubble.textContent = count > 99 ? '99+' : String(count);
      bubble.hidden = count === 0;
    }
    if (labelEl && label) labelEl.textContent = label;
  };

  /* Opening/closing a modal <dialog> with a slide/fade class, returning focus. */
  const openDialog = (dialog, trigger) => {
    if (dialog.open) return;
    dialog._trigger = trigger || document.activeElement;
    dialog.showModal();
    requestAnimationFrame(() => dialog.classList.add('is-open'));
  };

  const closeDialog = (dialog) => {
    if (!dialog.open || dialog._closing) return;
    dialog._closing = true;
    dialog.classList.remove('is-open');
    const finish = () => {
      dialog._closing = false;
      dialog.close();
      dialog._trigger?.focus?.();
    };
    if (reducedMotion.matches) finish();
    else window.setTimeout(finish, 280);
  };

  const wireDialog = (dialog, closeSelector) => {
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest(closeSelector)) closeDialog(dialog);
    });
  };

  /* ---------- <quantity-input> ---------- */
  if (!customElements.get('quantity-input')) {
    customElements.define(
      'quantity-input',
      class extends HTMLElement {
        connectedCallback() {
          this.input = this.querySelector('input');
          this.buttons = this.querySelectorAll('[data-quantity-step]');
          this.buttons.forEach((button) => {
            button.hidden = false;
            button.addEventListener('click', () => this.step(Number(button.dataset.quantityStep)));
          });
          this.input.addEventListener('change', () => this.updateButtons());
          this.updateButtons();
        }

        step(direction) {
          const step = Number(this.input.step) || 1;
          const min = Number(this.input.min) || 0;
          const max = this.input.max ? Number(this.input.max) : Infinity;
          const current = Number(this.input.value) || 0;
          const next = Math.min(max, Math.max(min, current + direction * step));
          if (next === current) return;
          this.input.value = next;
          this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        updateButtons() {
          const value = Number(this.input.value) || 0;
          const min = Number(this.input.min) || 0;
          const max = this.input.max ? Number(this.input.max) : Infinity;
          this.buttons.forEach((button) => {
            const direction = Number(button.dataset.quantityStep);
            button.disabled = direction < 0 ? value <= min : value >= max;
          });
        }
      }
    );
  }

  /* ---------- <cart-drawer> ---------- */
  if (!customElements.get('cart-drawer')) {
    customElements.define(
      'cart-drawer',
      class extends HTMLElement {
        connectedCallback() {
          this.dialog = this.querySelector('[data-cart-dialog]');
          if (!this.dialog) return;
          wireDialog(this.dialog, '[data-cart-close]');
          document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-cart-open]');
            if (!trigger) return;
            event.preventDefault();
            this.open(trigger);
          });
        }

        open(trigger) {
          openDialog(this.dialog, trigger);
        }

        close() {
          closeDialog(this.dialog);
        }

        /** Swap in a fresh render of the cart-drawer section, keeping the dialog open. */
        render(html) {
          const fresh = parseHTML(html).querySelector('cart-drawer');
          if (!fresh) return;
          const panel = this.querySelector('.cart-drawer__panel');
          const freshPanel = fresh.querySelector('.cart-drawer__panel');
          if (panel && freshPanel) panel.replaceWith(freshPanel);
          this.dataset.cartCount = fresh.dataset.cartCount;
          updateCartIcon(Number(fresh.dataset.cartCount), fresh.dataset.cartCountLabel);
        }
      }
    );
  }

  /* ---------- <cart-items> ---------- */
  const renderCartSections = (sections) => {
    if (!sections) return;
    Object.entries(sections).forEach(([id, html]) => {
      if (!html) return;
      if (id === 'cart-drawer') {
        document.querySelector('cart-drawer')?.render(html);
        return;
      }
      const target = document.querySelector(`[data-section-id="${id}"] [data-cart-root]`);
      const fresh = parseHTML(html).querySelector('[data-cart-root]');
      if (!target || !fresh) return;
      target.replaceWith(fresh);
      updateCartIcon(Number(fresh.dataset.cartCount), fresh.dataset.cartCountLabel);
    });
  };

  if (!customElements.get('cart-items')) {
    customElements.define(
      'cart-items',
      class extends HTMLElement {
        connectedCallback() {
          this.querySelector('[data-no-js-update]')?.setAttribute('hidden', '');
          this.onQuantity = debounce((input) => this.update(input.dataset.key, Number(input.value), input), 350);
          this.addEventListener('change', (event) => {
            const input = event.target.closest('.quantity__input[data-key]');
            if (input) this.onQuantity(input);
          });
          this.addEventListener('click', (event) => {
            const remove = event.target.closest('[data-cart-remove]');
            if (!remove) return;
            event.preventDefault();
            this.update(remove.dataset.cartRemove, 0, remove);
          });
        }

        sectionIds() {
          const ids = new Set((this.dataset.sections || '').split(',').filter(Boolean));
          if (document.querySelector('cart-drawer')) ids.add('cart-drawer');
          document.querySelectorAll('.main-cart[data-section-id]').forEach((el) => ids.add(el.dataset.sectionId));
          return [...ids];
        }

        async update(key, quantity, source) {
          const focusedId = document.activeElement?.id;
          const line = source.closest('.cart-line');
          this.setError('');
          this.classList.add('is-loading');
          line?.classList.add('is-updating');

          try {
            const response = await fetch(theme.routes.cartChange, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                id: key,
                quantity,
                sections: this.sectionIds(),
                sections_url: window.location.pathname,
              }),
            });
            const data = await response.json();
            if (!response.ok || data.status) {
              this.setError(data.description || data.message || theme.strings.cartError);
              const input = line?.querySelector('.quantity__input');
              if (input) input.value = input.getAttribute('value');
              return;
            }
            renderCartSections(data.sections);
            announce(theme.strings.cartUpdated);
            const refocus = focusedId && document.getElementById(focusedId);
            if (refocus) refocus.focus();
            else {
              const heading = document.querySelector('.cart-drawer__dialog[open] .cart-drawer__heading, .main-cart .page-header__title');
              heading?.setAttribute('tabindex', '-1');
              heading?.focus();
            }
          } catch (error) {
            this.setError(theme.strings.cartError);
          } finally {
            this.classList.remove('is-loading');
            line?.classList.remove('is-updating');
          }
        }

        setError(message) {
          const region = this.querySelector('[data-cart-error]');
          if (!region) return;
          region.textContent = message;
          region.hidden = !message;
        }
      }
    );
  }

  /* Order note on the cart page: saved as it changes. */
  document.addEventListener('change', (event) => {
    const note = event.target.closest('[data-cart-note]');
    if (!note) return;
    fetch(theme.routes.cartUpdate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ note: note.value }),
    });
  });

  /* ---------- <product-form> ---------- */
  if (!customElements.get('product-form')) {
    customElements.define(
      'product-form',
      class extends HTMLElement {
        connectedCallback() {
          this.form = this.querySelector('form');
          if (!this.form) return;
          // The variant id is disabled for no-JS shoppers (they use the <noscript> select).
          this.form.querySelectorAll('[data-js-enable]').forEach((input) => input.removeAttribute('disabled'));
          this.error = this.form.querySelector('[data-form-error]');
          this.form.addEventListener('submit', (event) => this.onSubmit(event));
        }

        /** Looked up each time: the variant picker swaps the button for a fresh render. */
        get button() {
          return this.form.querySelector('[name="add"]');
        }

        async onSubmit(event) {
          const drawer = document.querySelector('cart-drawer');
          if (theme.cartType !== 'drawer' || !drawer) return; // plain POST → cart page
          event.preventDefault();
          if (this.button.getAttribute('aria-busy') === 'true') return;

          this.setError('');
          this.button.setAttribute('aria-busy', 'true');
          this.button.querySelector('.product__spinner')?.removeAttribute('hidden');

          const body = new FormData(this.form);
          body.append('sections', 'cart-drawer');
          body.append('sections_url', window.location.pathname);

          try {
            const response = await fetch(theme.routes.cartAdd, {
              method: 'POST',
              headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
              body,
            });
            const data = await response.json();
            if (!response.ok || data.status) {
              this.setError(data.description || data.message || theme.strings.cartError);
              return;
            }
            drawer.render(data.sections['cart-drawer']);
            drawer.open(this.button);
            announce(theme.strings.added);
          } catch (error) {
            this.setError(theme.strings.cartError);
          } finally {
            this.button.removeAttribute('aria-busy');
            this.button.querySelector('.product__spinner')?.setAttribute('hidden', '');
          }
        }

        setError(message) {
          if (!this.error) return;
          this.error.textContent = message;
          this.error.hidden = !message;
        }
      }
    );
  }

  /* ---------- <search-modal> ---------- */
  if (!customElements.get('search-modal')) {
    customElements.define(
      'search-modal',
      class extends HTMLElement {
        connectedCallback() {
          this.dialog = this.querySelector('[data-search-dialog]');
          if (!this.dialog) return;
          wireDialog(this.dialog, '[data-search-close]');
          document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-search-open]');
            if (!trigger) return;
            event.preventDefault();
            openDialog(this.dialog, trigger);
            const input = this.dialog.querySelector('input[type="search"]');
            input?.focus();
            input?.select();
          });
        }
      }
    );
  }

  /* ---------- <predictive-search> ---------- */
  if (!customElements.get('predictive-search')) {
    customElements.define(
      'predictive-search',
      class extends HTMLElement {
        connectedCallback() {
          this.input = this.querySelector('input[type="search"]');
          this.results = this.querySelector('[data-predictive-results]');
          this.status = this.querySelector('[data-predictive-status]');
          this.cache = new Map();
          this.input.addEventListener('input', debounce(() => this.search(), 250));
          this.input.addEventListener('keydown', (event) => this.onKeydown(event));
        }

        async search() {
          const terms = this.input.value.trim();
          this.controller?.abort();
          if (!terms) {
            this.show('');
            return;
          }
          if (this.cache.has(terms)) {
            this.show(this.cache.get(terms));
            return;
          }
          this.controller = new AbortController();
          const params = new URLSearchParams({
            q: terms,
            section_id: 'predictive-search',
            'resources[type]': 'product,collection,query,page,article',
            'resources[limit]': '4',
            'resources[options][unavailable_products]': 'last',
          });
          this.setAttribute('aria-busy', 'true');
          try {
            const response = await fetch(`${this.dataset.url}?${params}`, { signal: this.controller.signal });
            if (!response.ok) throw new Error(response.status);
            const html = parseHTML(await response.text()).getElementById('PredictiveResults')?.outerHTML || '';
            this.cache.set(terms, html);
            this.show(html);
          } catch (error) {
            if (error.name !== 'AbortError') this.show('');
          } finally {
            this.removeAttribute('aria-busy');
          }
        }

        show(html) {
          this.results.innerHTML = html;
          this.input.setAttribute('aria-expanded', html ? 'true' : 'false');
          this.input.removeAttribute('aria-activedescendant');
          const count = this.results.querySelector('[data-results-count]')?.dataset.resultsCount;
          if (this.status) this.status.textContent = count ? `${count}` : '';
        }

        onKeydown(event) {
          const options = [...this.results.querySelectorAll('[role="option"]')];
          if (!options.length) return;
          const current = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const next =
              event.key === 'ArrowDown'
                ? (current + 1) % options.length
                : (current - 1 + options.length) % options.length;
            options.forEach((option, i) => option.setAttribute('aria-selected', String(i === next)));
            this.input.setAttribute('aria-activedescendant', options[next].id);
            options[next].scrollIntoView({ block: 'nearest' });
          } else if (event.key === 'Enter' && current > -1) {
            const link = options[current].querySelector('a');
            if (link) {
              event.preventDefault();
              window.location.href = link.href;
            }
          }
        }
      }
    );
  }
  if (!customElements.get('announcement-bar')) {
    customElements.define(
      'announcement-bar',
      class AnnouncementBar extends HTMLElement {
        connectedCallback() {
          this.items = [...this.querySelectorAll('.announcement-bar__item')];
          if (this.items.length < 2) return;
          this.index = Math.max(0, this.items.findIndex((item) => item.classList.contains('is-active')));
          this.speed = Number(this.dataset.speed) * 1000;
          this.desktopQuery = window.matchMedia('(min-width: 750px)');
          this.paused = false;

          this.onPrev = () => this.go(this.index - 1, true);
          this.onNext = () => this.go(this.index + 1, true);
          this.onPause = () => {
            this.paused = true;
            this.stop();
          };
          this.onResume = () => {
            this.paused = false;
            this.start();
          };
          // Pause only for a real mouse hover or keyboard focus: a tap on a phone
          // fires enter/focus but never a matching leave, which stalled autoplay.
          this.onPointerEnter = (event) => {
            if (event.pointerType === 'mouse') this.onPause();
          };
          this.onPointerLeave = (event) => {
            if (event.pointerType === 'mouse') this.onResume();
          };
          this.onFocusIn = (event) => {
            if (event.target.matches(':focus-visible')) this.onPause();
          };
          this.onFocusOut = (event) => {
            if (!this.contains(event.relatedTarget)) this.onResume();
          };
          this.onMediaChange = () => this.start();
          this.onBlockSelect = (event) => {
            const i = this.items.indexOf(event.target);
            if (i > -1) {
              this.go(i);
              this.onPause();
            }
          };

          this.querySelector('[data-announcement-prev]')?.addEventListener('click', this.onPrev);
          this.querySelector('[data-announcement-next]')?.addEventListener('click', this.onNext);
          this.addEventListener('pointerenter', this.onPointerEnter);
          this.addEventListener('pointerleave', this.onPointerLeave);
          this.addEventListener('focusin', this.onFocusIn);
          this.addEventListener('focusout', this.onFocusOut);
          this.desktopQuery.addEventListener('change', this.onMediaChange);
          document.addEventListener('shopify:block:select', this.onBlockSelect);
          document.addEventListener('shopify:block:deselect', this.onResume);

          this.go(this.index);
          this.start();
        }

        disconnectedCallback() {
          this.stop();
          this.desktopQuery?.removeEventListener('change', this.onMediaChange);
          document.removeEventListener('shopify:block:select', this.onBlockSelect);
          document.removeEventListener('shopify:block:deselect', this.onResume);
        }

        /** Slider layout active at the current screen width? */
        get isSlider() {
          return (this.desktopQuery.matches ? this.dataset.desktop : this.dataset.mobile) === 'slider';
        }

        go(i, fromUser = false) {
          const count = this.items.length;
          this.index = ((i % count) + count) % count;
          this.items.forEach((item, n) => {
            const active = n === this.index;
            item.classList.toggle('is-active', active);
            if (this.isSlider) item.setAttribute('aria-hidden', String(!active));
            else item.removeAttribute('aria-hidden');
          });
          if (fromUser) this.start();
        }

        start() {
          this.stop();
          this.go(this.index);
          // Autoplay is a merchant setting; with reduced motion the swap is instant
          // (critical.css drops the fade), so it still runs.
          if (!this.speed || this.paused || !this.isSlider) return;
          this.timer = window.setInterval(() => this.go(this.index + 1), this.speed);
        }

        stop() {
          window.clearInterval(this.timer);
        }
      }
    );
  }

  if (!customElements.get('sticky-header')) {
    customElements.define(
      'sticky-header',
      class StickyHeader extends HTMLElement {
        connectedCallback() {
          this.section = this.closest('.header-section') || this.parentElement;
          this.mode = this.dataset.sticky || 'none';
          this.drawer = this.querySelector('.header__drawer');
          this.lastY = window.scrollY;
          this.ticking = false;

          this.onScroll = () => {
            if (this.ticking) return;
            this.ticking = true;
            requestAnimationFrame(() => {
              this.update();
              this.ticking = false;
            });
          };
          this.onToggle = () => {
            if (!this.drawer.open) return;
            this.section.classList.remove('is-hidden');
            const panel = this.drawer.querySelector('.header__drawer-panel');
            const bottom = Math.max(0, this.getBoundingClientRect().bottom);
            if (panel) panel.style.setProperty('--drawer-top', `${bottom}px`);
          };

          window.addEventListener('scroll', this.onScroll, { passive: true });
          this.drawer?.addEventListener('toggle', this.onToggle);
          this.update();
        }

        disconnectedCallback() {
          window.removeEventListener('scroll', this.onScroll);
          this.drawer?.removeEventListener('toggle', this.onToggle);
          this.section?.classList.remove('is-scrolled', 'is-hidden');
        }

        update() {
          const y = Math.max(0, window.scrollY);
          if (this.mode === 'none') {
            this.section.classList.remove('is-scrolled', 'is-hidden');
            this.lastY = y;
            return;
          }

          // Solid background once the header has reached the top of the viewport
          // (measured from whatever sits above it, e.g. the announcement bar,
          // because a stuck element's own offsetTop follows the scroll)
          const above = this.section.previousElementSibling;
          const stuckAt = above ? Math.max(0, above.getBoundingClientRect().bottom + y) : 0;
          this.section.classList.toggle('is-scrolled', y > stuckAt);

          if (this.mode !== 'scroll-up') return;
          const pastHeader = y > stuckAt + this.offsetHeight;
          if (!pastHeader) {
            this.section.classList.remove('is-hidden');
            this.lastY = y;
            return;
          }
          if (Math.abs(y - this.lastY) < 6) return;
          const menuOpen = this.drawer?.open || document.querySelector('dialog[open]');
          this.section.classList.toggle('is-hidden', y > this.lastY && !menuOpen);
          this.lastY = y;
        }
      }
    );
  }
})();
