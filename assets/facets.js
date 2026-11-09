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
        if (event.target.matches('[data-facet-input]')) this.onChange();
      });

      this.addEventListener('click', (event) => {
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
          if (!desktop.matches && this.disclosure) this.disclosure.open = false;
        }
      });

      this.onPopState = () => this.render(window.location.href, false);
      window.addEventListener('popstate', this.onPopState);
    }

    disconnectedCallback() {
      desktop.removeEventListener('change', this.syncDisclosure);
      window.removeEventListener('popstate', this.onPopState);
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

        ['.facets__summary', '.facets__actions'].forEach((selector) => {
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
