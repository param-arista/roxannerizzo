/**
 * <facet-filters>: collection and search filters + sort. The markup is a
 * plain GET form (Apply button, sort <noscript> button); this script submits
 * on change, swaps the results through the Section Rendering API and keeps
 * the URL in sync. The filters panel stays open on desktop.
 */
if (!customElements.get('facet-filters')) {
  const desktop = window.matchMedia('(min-width: 990px)');

  class FacetFilters extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.sectionId;
      this.form = document.getElementById(`FacetForm-${this.sectionId}`);
      this.disclosure = this.querySelector('[data-facets-disclosure]');
      if (!this.form) return;

      this.syncDisclosure = () => {
        if (this.disclosure) this.disclosure.open = desktop.matches;
      };
      this.syncDisclosure();
      desktop.addEventListener('change', this.syncDisclosure);

      this.onChange = this.debounce(() => this.submit(), 400);
      this.addEventListener('change', (event) => {
        // Drawer sort select: copy the choice to the toolbar select, which the form submits
        if (event.target.matches('[data-facets-sort-mirror]')) {
          const sort = document.getElementById(`SortBy-${this.sectionId}`);
          if (sort) sort.value = event.target.value;
          this.onChange();
          return;
        }
        if (event.target.matches('[data-facet-input]')) this.onChange();
      });

      // Phones/tablets: the panel is a drawer. Close it with the × button,
      // a click on the dimmed backdrop (the <details> itself) or Escape.
      // Closing plays the slide-out animation first (.is-closing), then
      // closes the <details>.
      this.closeDrawer = () => {
        const details = this.disclosure;
        if (desktop.matches || !details?.open || details.classList.contains('is-closing')) return;
        const panel = details.querySelector('.facets__panel');
        const finish = () => {
          window.clearTimeout(fallback);
          panel?.removeEventListener('animationend', finish);
          details.classList.remove('is-closing');
          details.open = false;
          details.querySelector('summary')?.focus();
        };
        const fallback = window.setTimeout(finish, 450);
        panel?.addEventListener('animationend', finish);
        details.classList.add('is-closing');
      };
      this.onKeydown = (event) => {
        if (event.key === 'Escape') this.closeDrawer();
      };
      document.addEventListener('keydown', this.onKeydown);

      this.addEventListener('click', (event) => {
        if (event.target.closest('[data-facets-close]') || event.target === this.disclosure) {
          event.preventDefault();
          this.closeDrawer();
          return;
        }
        const link = event.target.closest('[data-facet-link]');
        if (link) {
          event.preventDefault();
          this.render(link.href);
          return;
        }
        // On phones the Apply button just closes the panel: results are already live.
        const apply = event.target.closest('[data-facets-apply]');
        if (apply) {
          event.preventDefault();
          this.onChange();
          this.closeDrawer();
        }
      });

      this.onPopState = () => this.render(window.location.href, false);
      window.addEventListener('popstate', this.onPopState);
    }

    disconnectedCallback() {
      desktop.removeEventListener('change', this.syncDisclosure);
      window.removeEventListener('popstate', this.onPopState);
      document.removeEventListener('keydown', this.onKeydown);
    }

    debounce(fn, wait) {
      let timer;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, wait);
      };
    }

    submit() {
      const params = new URLSearchParams();
      for (const [key, value] of new FormData(this.form)) {
        if (value !== '') params.append(key, value);
      }
      this.render(`${window.location.pathname}?${params}`);
    }

    async render(url, push = true) {
      const results = this.querySelector('[data-facets-results]');
      this.controller?.abort();
      this.controller = new AbortController();
      results?.classList.add('is-loading');
      results?.setAttribute('aria-busy', 'true');

      try {
        const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}section_id=${this.sectionId}`;
        const response = await fetch(fetchUrl, { signal: this.controller.signal });
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

        const focusedId = document.activeElement?.id;
        const freshResults = doc.querySelector('[data-facets-results]');
        if (results && freshResults) results.replaceWith(freshResults);
        if (focusedId && freshResults?.querySelector(`#${CSS.escape(focusedId)}`)) {
          document.getElementById(focusedId)?.focus();
        }

        // Update filter inputs in place so focus stays where the shopper is.
        doc.querySelectorAll('[data-facet-input]').forEach((fresh) => {
          const current = document.getElementById(fresh.id);
          if (!current) return;
          if (current.type === 'checkbox') {
            current.checked = fresh.checked;
            current.disabled = fresh.disabled;
            const count = current.parentElement.querySelector('[data-facet-count]');
            const freshCount = fresh.parentElement.querySelector('[data-facet-count]');
            if (count && freshCount) count.textContent = freshCount.textContent;
          } else if (current !== document.activeElement) {
            current.value = fresh.value;
          }
        });

        // Keep the drawer's sort select in step with the toolbar one
        const sort = document.getElementById(`SortBy-${this.sectionId}`);
        const mirror = this.querySelector('[data-facets-sort-mirror]');
        if (sort && mirror) mirror.value = sort.value;

        ['.facets__summary', '.facets__actions', '[data-facets-drawer-count]'].forEach((selector) => {
          const current = this.querySelector(selector);
          const fresh = doc.querySelector(selector);
          if (current && fresh) current.innerHTML = fresh.innerHTML;
        });

        if (push) window.history.pushState({}, '', url);
        const announcer = document.getElementById('ThemeAnnouncer');
        if (announcer) announcer.textContent = window.theme?.strings?.resultsUpdated || '';
      } catch (error) {
        if (error.name !== 'AbortError') window.location.assign(url);
      } finally {
        this.querySelector('[data-facets-results]')?.classList.remove('is-loading');
        this.querySelector('[data-facets-results]')?.removeAttribute('aria-busy');
      }
    }
  }

  customElements.define('facet-filters', FacetFilters);
}
