/**
 * Product page behaviour (loaded by main-product and product-recommendations):
 *   <media-gallery>            thumbnails, arrows and active-slide tracking for
 *                              the scroll-snap slides (which swipe without JS)
 *   <variant-picker>           re-renders price / stock / button for the chosen
 *                              options via the Section Rendering API
 *   <product-recommendations>  loads "You may also like" when scrolled near
 */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollBehavior = () => (reducedMotion.matches ? 'auto' : 'smooth');

  /* ---------- <media-gallery> ---------- */
  if (!customElements.get('media-gallery')) {
    customElements.define(
      'media-gallery',
      class extends HTMLElement {
        connectedCallback() {
          this.track = this.querySelector('[data-gallery-track]');
          this.slides = [...this.track.children];
          this.thumbs = this.querySelector('[data-gallery-thumbs]');
          this.prev = this.querySelector('[data-gallery-prev]');
          this.next = this.querySelector('[data-gallery-next]');
          if (this.slides.length < 2) return;

          if (this.thumbs) {
            this.thumbs.hidden = false;
            this.thumbs.addEventListener('click', (event) => {
              const thumb = event.target.closest('[data-media-id]');
              if (thumb) this.show(thumb.dataset.mediaId);
            });
          }
          [this.prev, this.next].forEach((button, i) => {
            if (!button) return;
            button.hidden = false;
            button.addEventListener('click', () => this.go(i === 0 ? -1 : 1));
          });

          this.observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) this.setActive(entry.target);
              });
            },
            { root: this.track, threshold: 0.6 }
          );
          this.slides.forEach((slide) => this.observer.observe(slide));
        }

        disconnectedCallback() {
          this.observer?.disconnect();
        }

        get activeIndex() {
          const index = this.slides.findIndex((slide) => slide.classList.contains('is-active'));
          return index < 0 ? 0 : index;
        }

        go(direction) {
          const index = Math.min(this.slides.length - 1, Math.max(0, this.activeIndex + direction));
          this.scrollTo(this.slides[index]);
        }

        show(mediaId) {
          const slide = this.slides.find((s) => s.dataset.mediaId === String(mediaId));
          if (slide) this.scrollTo(slide);
        }

        scrollTo(slide) {
          this.track.scrollTo({ left: slide.offsetLeft - this.track.offsetLeft, behavior: scrollBehavior() });
          this.setActive(slide);
        }

        setActive(slide) {
          this.slides.forEach((s) => {
            const active = s === slide;
            s.classList.toggle('is-active', active);
            if (!active) s.querySelector('video')?.pause();
          });
          this.thumbs?.querySelectorAll('[data-media-id]').forEach((thumb) => {
            const active = thumb.dataset.mediaId === slide.dataset.mediaId;
            if (active) {
              thumb.setAttribute('aria-current', 'true');
              thumb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
            } else {
              thumb.removeAttribute('aria-current');
            }
          });
          const index = this.slides.indexOf(slide);
          if (this.prev) this.prev.disabled = index <= 0;
          if (this.next) this.next.disabled = index >= this.slides.length - 1;
        }
      }
    );
  }

  /* ---------- <variant-picker> ---------- */
  if (!customElements.get('variant-picker')) {
    customElements.define(
      'variant-picker',
      class extends HTMLElement {
        connectedCallback() {
          this.addEventListener('change', (event) => {
            if (event.target.matches('.option__input')) this.onChange(event.target);
          });
        }

        async onChange(input) {
          const sectionId = this.dataset.sectionId;
          // .product, not [data-section-id]: this element carries that attribute too.
          const section = this.closest('.product');
          const optionValues = [...this.querySelectorAll('.option__input:checked')].map((el) => el.dataset.valueId);
          const focusedId = input.id;

          this.controller?.abort();
          this.controller = new AbortController();
          section.classList.add('is-loading');

          try {
            const url = `${this.dataset.productUrl}?option_values=${optionValues.join(',')}&section_id=${sectionId}`;
            const response = await fetch(url, { signal: this.controller.signal });
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

            // Swap every dynamic piece (price, picker state, stock, SKU, add button) by id.
            section.querySelectorAll('[data-swap]').forEach((el) => {
              const fresh = doc.getElementById(el.id);
              if (fresh) el.replaceWith(fresh);
            });
            document.getElementById(focusedId)?.focus();

            const picker = section.querySelector('variant-picker');
            const variantId = picker?.dataset.variantId;
            const idInput = document.getElementById(`VariantId-${sectionId}`);
            if (idInput) idInput.value = variantId || '';

            if (variantId) {
              const params = new URLSearchParams(window.location.search);
              params.set('variant', variantId);
              window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
            }
            if (picker?.dataset.variantMediaId) {
              section.querySelector('media-gallery')?.show(picker.dataset.variantMediaId);
            }
          } catch (error) {
            if (error.name !== 'AbortError') window.location.assign(`${this.dataset.productUrl}`);
          } finally {
            section.classList.remove('is-loading');
          }
        }
      }
    );
  }

  /* ---------- <sticky-buy-bar> ---------- */
  // Phones only (CSS hides it from 750px): shows while the main buy buttons
  // are scrolled above the viewport. Its button submits the main form.
  if (!customElements.get('sticky-buy-bar')) {
    customElements.define(
      'sticky-buy-bar',
      class extends HTMLElement {
        connectedCallback() {
          const section = this.closest('.product');
          this.target = section?.querySelector('product-form');
          if (!this.target) return;
          this.hidden = false;
          this.observer = new IntersectionObserver(([entry]) => {
            const passed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
            this.classList.toggle('is-visible', passed);
            this.inert = !passed;
          });
          this.observer.observe(this.target);
          this.inert = true;
        }

        disconnectedCallback() {
          this.observer?.disconnect();
        }
      }
    );
  }

  /* ---------- <product-recommendations> ---------- */
  if (!customElements.get('product-recommendations')) {
    customElements.define(
      'product-recommendations',
      class extends HTMLElement {
        connectedCallback() {
          if (this.querySelector('.featured-products__grid')) return; // already rendered (editor)
          this.observer = new IntersectionObserver(
            (entries) => {
              if (!entries[0].isIntersecting) return;
              this.observer.disconnect();
              this.load();
            },
            { rootMargin: '0px 0px 600px 0px' }
          );
          this.observer.observe(this);
        }

        disconnectedCallback() {
          this.observer?.disconnect();
        }

        async load() {
          try {
            const response = await fetch(this.dataset.url);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const fresh = doc.querySelector('product-recommendations');
            if (fresh && fresh.innerHTML.trim()) this.innerHTML = fresh.innerHTML;
            else this.hidden = true;
          } catch (error) {
            this.hidden = true;
          }
        }
      }
    );
  }
})();
