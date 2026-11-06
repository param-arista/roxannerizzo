/**
 * <scroll-carousel>: wires prev/next buttons to a CSS scroll-snap track.
 * The track scrolls and swipes without this script; it only adds the
 * arrow buttons and disables them at either end.
 *
 * Markup: <scroll-carousel>
 *           <button data-carousel-prev>…</button>
 *           <ul data-carousel-track>…</ul>
 *           <button data-carousel-next>…</button>
 *         </scroll-carousel>
 */
if (!customElements.get('scroll-carousel')) {
  class ScrollCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-carousel-track]');
      this.prev = this.querySelector('[data-carousel-prev]');
      this.next = this.querySelector('[data-carousel-next]');
      if (!this.track || !this.prev || !this.next) return;

      this.prev.hidden = false;
      this.next.hidden = false;
      this.onPrev = () => this.go(-1);
      this.onNext = () => this.go(1);
      this.onScroll = () => this.update();
      this.prev.addEventListener('click', this.onPrev);
      this.next.addEventListener('click', this.onNext);
      this.track.addEventListener('scroll', this.onScroll, { passive: true });
      this.resizeObserver = new ResizeObserver(this.onScroll);
      this.resizeObserver.observe(this.track);
      this.update();
    }

    disconnectedCallback() {
      if (!this.track) return;
      this.prev.removeEventListener('click', this.onPrev);
      this.next.removeEventListener('click', this.onNext);
      this.track.removeEventListener('scroll', this.onScroll);
      this.resizeObserver.disconnect();
    }

    /** Scroll by one item; the direction flips for right-to-left pages. */
    go(direction) {
      const item = this.track.firstElementChild;
      if (!item) return;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      const rtl = getComputedStyle(this).direction === 'rtl' ? -1 : 1;
      this.track.scrollBy({ left: direction * rtl * (item.offsetWidth + gap), behavior: 'smooth' });
    }

    update() {
      const max = this.track.scrollWidth - this.track.clientWidth;
      const position = Math.abs(this.track.scrollLeft);
      this.prev.disabled = position <= 2;
      this.next.disabled = position >= max - 2;
    }
  }

  customElements.define('scroll-carousel', ScrollCarousel);
}
