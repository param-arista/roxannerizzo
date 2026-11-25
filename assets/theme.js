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
 *   <quick-view-modal>   product quick view from a card's Quick view button
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

  /** Text of a failed cart request: Shopify sends {description}, {message} or {errors: string | {field: [..]}}. */
  const cartErrorMessage = (data) => {
    if (!data) return theme.strings.cartError;
    if (data.description && typeof data.description === 'string') return data.description;
    const errors = data.errors;
    if (typeof errors === 'string' && errors) return errors;
    if (errors && typeof errors === 'object') {
      const text = Object.values(errors).flat().filter((e) => typeof e === 'string').join(' ');
      if (text) return text;
    }
    if (data.message && data.message !== 'Cart Error') return data.message;
    return theme.strings.cartError;
  };

  /* Opening/closing a modal <dialog> with a slide/fade class, returning focus. */
  const openDialog = (dialog, trigger) => {
    if (dialog.open) return;
    dialog._trigger = trigger || document.activeElement;
    // showModal() focuses the first button inside, which is still off-screen
    // (the panel starts translated out of view). The browser then scrolls the
    // page/dialog sideways to reveal it, so the drawer seemed to jump to the
    // middle first. Undo any such scroll right away.
    const { scrollX, scrollY } = window;
    dialog.showModal();
    const undoScroll = () => {
      dialog.scrollLeft = 0;
      dialog.scrollTop = 0;
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) window.scrollTo(scrollX, scrollY);
    };
    undoScroll();
    // Lay out the closed (off-screen) state first so the slide always starts there
    void dialog.offsetWidth;
    requestAnimationFrame(() => {
      undoScroll();
      requestAnimationFrame(() => dialog.classList.add('is-open'));
    });
  };

  const closeDialog = (dialog, { restoreFocus = true } = {}) => {
    if (!dialog.open || dialog._closing) return;
    dialog._closing = true;
    dialog.classList.remove('is-open');
    const finish = () => {
      dialog._closing = false;
      dialog.close();
      if (restoreFocus) dialog._trigger?.focus?.();
    };
    if (reducedMotion.matches) finish();
    else window.setTimeout(finish, 350);
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
          this.input.addEventListener('change', () => {
            this.clamp();
            this.updateButtons();
          });
          this.updateButtons();
        }

        /** A typed value above the maximum is pulled back to it, and a bubbling `quantity:capped`
            event lets the cart / product form say so. Below the minimum (0, blank) is left alone:
            the product form says why and adds nothing; the cart asks before removing. */
        clamp() {
          if (!this.input.max) return;
          const max = Number(this.input.max);
          if (Number(this.input.value) > max) {
            this.input.value = max;
            this.input.dispatchEvent(new CustomEvent('quantity:capped', { bubbles: true, detail: { max } }));
          }
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
          if (this.input.disabled) {
            this.buttons.forEach((button) => (button.disabled = true));
            return;
          }
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

  /** An empty bag keeps its order note on Shopify's side; clear it so an old note never
      rides along with a later order. */
  const clearCartNote = () =>
    fetch(theme.routes.cartUpdate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ note: '' }),
    }).catch(() => {});

  /* ---------- <cart-drawer> ---------- */
  if (!customElements.get('cart-drawer')) {
    customElements.define(
      'cart-drawer',
      class extends HTMLElement {
        connectedCallback() {
          this.dialog = this.querySelector('[data-cart-dialog]');
          if (!this.dialog) return;
          wireDialog(this.dialog, '[data-cart-close]');
          // The bag was emptied some other way but still carries an order note: drop it, so it
          // isn't sent with the next order.
          if (this.hasAttribute('data-stale-note')) clearCartNote();
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

        /** A message above the lines (e.g. "Only 50 items were added…"); cleared by the next render. */
        setNotice(message) {
          const region = this.querySelector('[data-cart-error]');
          if (!region) return;
          region.textContent = message;
          region.hidden = !message;
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
          // Runs before the change below (the stepper clamps first): remember why, show it after the update.
          this.addEventListener('quantity:capped', (event) => {
            this.notice = (theme.strings.quantityMax || '').replaceAll('[max]', event.detail.max);
          });
          this.addEventListener('change', (event) => {
            const input = event.target.closest('.quantity__input[data-key]');
            if (!input) return;
            const raw = input.value.trim();
            const value = Number(raw);
            if (raw !== '' && !Number.isInteger(value)) {
              this.notice = '';
              this.setError(theme.strings.quantityWhole);
              announce(theme.strings.quantityWhole);
              input.value = input.getAttribute('value');
              input.closest('quantity-input')?.updateButtons?.();
              input.focus();
              return;
            }
            if (raw === '' || value <= 0) {
              this.confirmRemove(input);
              return;
            }
            // Same as what's in the bag (e.g. 80 typed when 50 is already the most): nothing to
            // send, just say why. Also keeps a late change event from closing the remove prompt.
            if (value === Number(input.getAttribute('value'))) {
              if (this.notice) {
                this.setError(this.notice);
                announce(this.notice);
                this.notice = '';
              }
              return;
            }
            this.closeConfirm(input.closest('.cart-line'));
            this.onQuantity(input);
          });
          this.addEventListener('click', (event) => {
            const keep = event.target.closest('[data-cart-keep]');
            if (keep) {
              const line = keep.closest('.cart-line');
              this.closeConfirm(line);
              line?.querySelector('.quantity__input')?.focus();
              return;
            }
            const remove = event.target.closest('[data-cart-remove]');
            if (!remove) return;
            event.preventDefault();
            this.update(remove.dataset.cartRemove, 0, remove);
          });
        }

        /** Quantity cleared or set to 0: put the old quantity back and ask before removing the line. */
        confirmRemove(input) {
          const line = input.closest('.cart-line');
          input.value = input.getAttribute('value');
          input.closest('quantity-input')?.updateButtons?.();
          this.setError('');
          if (!line) return;
          let box = line.querySelector('[data-cart-confirm]');
          if (!box) {
            const title = line.querySelector('.cart-line__title')?.textContent.trim() || '';
            const question = (theme.strings.removeConfirm || '').replace('[title]', title);
            box = document.createElement('div');
            box.className = 'cart-line__confirm';
            box.setAttribute('data-cart-confirm', '');
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', question);
            const text = document.createElement('p');
            text.className = 'cart-line__confirm-text';
            text.textContent = question;
            const yes = document.createElement('button');
            yes.type = 'button';
            yes.className = 'cart-line__confirm-button cart-line__confirm-button--remove';
            yes.dataset.cartRemove = input.dataset.key;
            yes.textContent = theme.strings.remove;
            const no = document.createElement('button');
            no.type = 'button';
            no.className = 'cart-line__confirm-button';
            no.setAttribute('data-cart-keep', '');
            no.textContent = theme.strings.keep;
            box.append(text, yes, no);
            (line.querySelector('.cart-line__info') || line).append(box);
          }
          announce(box.getAttribute('aria-label'));
          box.querySelector('[data-cart-keep]')?.focus();
        }

        closeConfirm(line) {
          line?.querySelector('[data-cart-confirm]')?.remove();
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
          const notice = this.notice || '';
          this.notice = '';
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
              this.setError(cartErrorMessage(data));
              const input = line?.querySelector('.quantity__input');
              if (input) input.value = input.getAttribute('value');
              return;
            }
            if (data.item_count === 0 && data.note) clearCartNote();
            renderCartSections(data.sections);
            if (notice) {
              // This element may have been swapped out by the render: show it in the fresh one(s).
              document.querySelectorAll('cart-items').forEach((el) => el.setError?.(notice));
              announce(notice);
            } else {
              announce(theme.strings.cartUpdated);
            }
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
          // The quantity input may sit outside the form, so listen on the document.
          this.onCapped = (event) => {
            if (event.target !== this.quantityInput) return;
            const message = (theme.strings.quantityMax || '').replaceAll('[max]', event.detail.max);
            this.setError(message);
            announce(message);
          };
          document.addEventListener('quantity:capped', this.onCapped);
        }

        disconnectedCallback() {
          if (this.onCapped) document.removeEventListener('quantity:capped', this.onCapped);
        }

        /** Looked up each time: the variant picker swaps the button for a fresh render. */
        get button() {
          return this.form.querySelector('[name="add"]');
        }

        /** The quantity input sits outside the form (form="…"), so find it by the form id.
            (getAttribute: form.id would return the form's hidden input named "id".) */
        get quantityInput() {
          const formId = this.form.getAttribute('id');
          return (formId && document.querySelector(`input[name="quantity"][form="${CSS.escape(formId)}"]`)) || this.form.querySelector('input[name="quantity"]');
        }

        /** Quantity must be a whole number ≥ its minimum. Returns false (and says why) otherwise. */
        validQuantity() {
          const input = this.quantityInput;
          if (!input) return true;
          const min = Number(input.min) || 1;
          const value = Number(input.value);
          if (input.value.trim() !== '' && Number.isInteger(value) && value >= min) return true;
          this.setError((theme.strings.quantityMin || '').replace('[min]', min));
          input.value = min;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.focus();
          return false;
        }

        async onSubmit(event) {
          this.setError('');
          if (!this.validQuantity()) {
            event.preventDefault();
            return;
          }
          const drawer = document.querySelector('cart-drawer');
          if (theme.cartType !== 'drawer' || !drawer) return; // plain POST → cart page
          event.preventDefault();
          if (this.button.getAttribute('aria-busy') === 'true') return;

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
              const message = cartErrorMessage(data);
              this.setError(message);
              // Shopify may still have added part of it ("Only 50 items were added…"): refresh the
              // bag and, if it grew, open it with the message so the shopper sees what's in it.
              const before = Number(drawer.dataset.cartCount) || 0;
              const fresh = await fetch(`${theme.routes.cart}?sections=cart-drawer`, { headers: { Accept: 'application/json' } })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null);
              if (fresh?.['cart-drawer']) {
                drawer.render(fresh['cart-drawer']);
                if ((Number(drawer.dataset.cartCount) || 0) > before) {
                  drawer.setNotice(message);
                  drawer.open(this.button);
                }
              }
              announce(message);
              return;
            }
            drawer.render(data.sections['cart-drawer']);
            // From quick view: close it and hand focus-return to the card's button.
            const quickView = this.closest('quick-view-modal');
            if (quickView) {
              const trigger = quickView.trigger;
              quickView.close({ restoreFocus: false });
              drawer.open(trigger);
            } else {
              drawer.open(this.button);
            }
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

  /* ---------- <quick-view-modal> ---------- */
  // A card's [data-quick-view] button fetches sections/quick-view for that
  // product (Section Rendering API) into the dialog. The product page's CSS
  // and product.js are loaded on first open only. Any failure falls back to
  // the product page itself.
  if (!customElements.get('quick-view-modal')) {
    const loadStylesheet = (href) =>
      new Promise((resolve) => {
        if ([...document.styleSheets].some((sheet) => sheet.href && sheet.href.split('?')[0] === new URL(href, location.href).href.split('?')[0])) {
          resolve();
          return;
        }
        const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
        link.onload = link.onerror = () => resolve();
        document.head.append(link);
      });

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        if (customElements.get('variant-picker')) {
          resolve();
          return;
        }
        const script = Object.assign(document.createElement('script'), { src, defer: true });
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.append(script);
      });

    customElements.define(
      'quick-view-modal',
      class extends HTMLElement {
        connectedCallback() {
          this.dialog = this.querySelector('[data-quick-view-dialog]');
          this.content = this.querySelector('[data-quick-view-content]');
          if (!this.dialog || !this.content) return;
          wireDialog(this.dialog, '[data-quick-view-close]');
          this.dialog.addEventListener('close', () => this.content.replaceChildren());
          document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-quick-view]');
            if (!trigger) return;
            event.preventDefault();
            this.open(trigger);
          });
        }

        get trigger() {
          return this.dialog._trigger;
        }

        loadAssets() {
          if (!this.assets) {
            const css = (this.dataset.css || '').split(',').filter(Boolean).map(loadStylesheet);
            this.assets = Promise.all([...css, loadScript(this.dataset.script)]).catch((error) => {
              this.assets = null;
              throw error;
            });
          }
          return this.assets;
        }

        async open(trigger) {
          if (trigger.getAttribute('aria-busy') === 'true') return;
          const productUrl = trigger.dataset.quickView;
          this.controller?.abort();
          this.controller = new AbortController();
          trigger.setAttribute('aria-busy', 'true');

          try {
            const url = new URL(productUrl, window.location.origin);
            url.searchParams.set('section_id', 'quick-view');
            const [html] = await Promise.all([
              fetch(url, { signal: this.controller.signal }).then((response) => {
                if (!response.ok) throw new Error(String(response.status));
                return response.text();
              }),
              this.loadAssets(),
            ]);
            const fresh = parseHTML(html).querySelector('[data-quick-view-root]');
            if (!fresh) throw new Error('No product');
            this.content.replaceChildren(fresh);
            const title = fresh.querySelector('.quick-view__title');
            if (title) this.dialog.setAttribute('aria-labelledby', title.id);
            openDialog(this.dialog, trigger);
          } catch (error) {
            if (error.name !== 'AbortError') window.location.assign(productUrl);
          } finally {
            trigger.removeAttribute('aria-busy');
          }
        }

        close(options) {
          closeDialog(this.dialog, options);
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

  /**
   * Scroll fade-in (Theme settings → Animations). Only sections that start
   * below the fold are hidden, so nothing visible on load flickers and the
   * first screen (hero) shows at once. Sections added later in the theme
   * editor are left visible.
   */
  const revealStyle = document.documentElement.dataset.reveal;
  if (revealStyle && !reducedMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
    );

    document
      .querySelectorAll('main > .shopify-section, .shopify-section-group-footer-group')
      .forEach((section) => {
        if (section.getBoundingClientRect().top < window.innerHeight) return;
        section.classList.add('reveal');
        observer.observe(section);
      });

    // In the editor, show a section right away when it is selected
    document.addEventListener('shopify:section:select', (event) => {
      event.target.classList.add('is-revealed');
    });
  }
})();
