/**
 * <scroll-carousel>: enhances a CSS scroll-snap track. The track scrolls and
 * swipes without this script; it adds (each optional):
 *   - prev/next buttons, disabled at either end (looping when autoplaying)
 *   - dot navigation, one dot per scroll position
 *   - mouse drag to scroll on desktop (unless the track is overflow: hidden)
 *   - autoplay (data-autoplay="seconds"), paused on mouse hover, keyboard
 *     focus, a hidden tab, or a block selected in the theme editor
 *   - infinite loop (data-loop): the slides are cloned before and after the
 *     real ones; after the last slide the next one is the first again, moving
 *     forward without rewinding. Once a scroll settles on a clone, the track
 *     jumps (invisibly) to the matching real slide.
 *
 * Markup: <scroll-carousel data-autoplay="5" data-loop>
 *           <button data-carousel-prev>…</button>
 *           <ul data-carousel-track>…</ul>
 *           <button data-carousel-next>…</button>
 *           <div data-carousel-dots data-label="Go to slide [n]"></div>
 *         </scroll-carousel>
 */
if (!customElements.get('scroll-carousel')) {
  class ScrollCarousel extends HTMLElement {
    connectedCallback() {
      this.track = this.querySelector('[data-carousel-track]');
      if (!this.track) return;
      this.prev = this.querySelector('[data-carousel-prev]');
      this.next = this.querySelector('[data-carousel-next]');
      this.dots = this.querySelector('[data-carousel-dots]');
      this.speed = (Number(this.dataset.autoplay) || 0) * 1000;
      this.paused = false;
      this.slides = [...this.track.children].filter((el) => !el.hasAttribute('data-carousel-clone'));
      this.count = this.slides.length;
      this.loop = this.hasAttribute('data-loop') && this.count > 1;
      this.offset = 0; // number of clones before the first real slide

      if (this.prev) this.prev.hidden = false;
      if (this.next) this.next.hidden = false;
      if (this.loop) this.addClones();

      this.onPrev = () => this.go(-1, true);
      this.onNext = () => this.go(1, true);
      this.onScroll = () => {
        this.update();
        if (!this.loop) return;
        window.clearTimeout(this.settleTimer);
        this.settleTimer = window.setTimeout(() => this.recenter(), 140);
      };
      this.onResize = () => {
        const current = this.index;
        this.buildDots();
        if (this.loop) this.jumpTo(current + this.offset);
        this.update();
      };
      this.onDotClick = (event) => {
        const dot = event.target.closest('[data-index]');
        if (dot) this.goTo(Number(dot.dataset.index), true);
      };
      this.pause = () => {
        this.paused = true;
        this.stop();
      };
      this.resume = () => {
        this.paused = false;
        this.start();
      };
      // A tap on a phone fires enter/focus without a matching leave, so only a
      // real mouse hover or keyboard focus pauses autoplay.
      this.onPointerEnter = (event) => event.pointerType === 'mouse' && this.pause();
      this.onPointerLeave = (event) => event.pointerType === 'mouse' && this.resume();
      this.onFocusIn = (event) => event.target.matches(':focus-visible') && this.pause();
      this.onFocusOut = (event) => !this.contains(event.relatedTarget) && this.resume();
      this.onVisibility = () => (document.hidden ? this.stop() : this.start());
      this.onBlockSelect = (event) => {
        const index = this.slides.findIndex((slide) => slide.contains(event.target));
        if (index < 0) return;
        this.pause();
        this.goTo(this.loop ? index : Math.min(index, this.positions - 1));
      };

      // Mouse drag on desktop (touch already swipes natively). Off when the
      // track can't be scrolled by the user (swipe turned off: overflow hidden).
      this.onPointerDown = (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        if (getComputedStyle(this.track).overflowX === 'hidden') return;
        this.drag = { x: event.clientX, scroll: this.track.scrollLeft, moved: false };
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp, { once: true });
      };
      this.onPointerMove = (event) => {
        if (!this.drag) return;
        const dx = event.clientX - this.drag.x;
        if (!this.drag.moved && Math.abs(dx) > 5) {
          this.drag.moved = true;
          this.track.classList.add('is-dragging');
          this.stop();
        }
        if (this.drag.moved) this.track.scrollLeft = this.drag.scroll - dx;
      };
      this.onPointerUp = () => {
        window.removeEventListener('pointermove', this.onPointerMove);
        const moved = this.drag?.moved;
        this.drag = null;
        if (!moved) return;
        this.track.classList.remove('is-dragging');
        // Swallow the click that ends a drag so links inside don't open
        // (removed again right after, in case the pointer was released outside)
        const block = (e) => e.preventDefault();
        this.track.addEventListener('click', block, { capture: true, once: true });
        window.setTimeout(() => this.track.removeEventListener('click', block, true), 0);
        this.scrollToRaw(this.rawIndex);
        this.start();
      };
      this.onDragStart = (event) => event.preventDefault();

      this.track.addEventListener('pointerdown', this.onPointerDown);
      this.track.addEventListener('dragstart', this.onDragStart);
      this.prev?.addEventListener('click', this.onPrev);
      this.next?.addEventListener('click', this.onNext);
      this.dots?.addEventListener('click', this.onDotClick);
      this.track.addEventListener('scroll', this.onScroll, { passive: true });
      this.addEventListener('pointerenter', this.onPointerEnter);
      this.addEventListener('pointerleave', this.onPointerLeave);
      this.addEventListener('focusin', this.onFocusIn);
      this.addEventListener('focusout', this.onFocusOut);
      document.addEventListener('visibilitychange', this.onVisibility);
      document.addEventListener('shopify:block:select', this.onBlockSelect);
      document.addEventListener('shopify:block:deselect', this.resume);

      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.track);
      this.onResize();
      this.start();
    }

    disconnectedCallback() {
      if (!this.track) return;
      this.stop();
      window.clearTimeout(this.settleTimer);
      this.track.removeEventListener('pointerdown', this.onPointerDown);
      this.track.removeEventListener('dragstart', this.onDragStart);
      window.removeEventListener('pointermove', this.onPointerMove);
      this.prev?.removeEventListener('click', this.onPrev);
      this.next?.removeEventListener('click', this.onNext);
      this.dots?.removeEventListener('click', this.onDotClick);
      this.track.removeEventListener('scroll', this.onScroll);
      document.removeEventListener('visibilitychange', this.onVisibility);
      document.removeEventListener('shopify:block:select', this.onBlockSelect);
      document.removeEventListener('shopify:block:deselect', this.resume);
      this.resizeObserver.disconnect();
    }

    /** Full sets of clones before and after the real slides: enough sets that
        clones always fill the view (up to 8 slides per view), even when there
        are fewer slides than fit on screen. */
    addClones() {
      const sets = Math.max(1, Math.ceil(8 / this.count));
      const clone = (slide) => {
        const copy = slide.cloneNode(true);
        copy.setAttribute('data-carousel-clone', '');
        copy.setAttribute('aria-hidden', 'true');
        copy.inert = true;
        copy.removeAttribute('data-shopify-editor-block');
        copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        copy.querySelectorAll('img[loading="lazy"]').forEach((img) => (img.loading = 'eager'));
        return copy;
      };
      for (let i = 0; i < sets; i++) {
        this.track.prepend(...this.slides.map(clone));
        this.track.append(...this.slides.map(clone));
      }
      this.offset = this.count * sets;
    }

    /** Width of one item plus the gap: one scroll step. */
    get step() {
      const item = this.slides[0];
      if (!item) return 0;
      const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return item.offsetWidth + gap;
    }

    get rtl() {
      return getComputedStyle(this).direction === 'rtl' ? -1 : 1;
    }

    get max() {
      return this.track.scrollWidth - this.track.clientWidth;
    }

    /** Item index (clones included) at the start of the track. */
    get rawIndex() {
      const step = this.step;
      if (!step) return 0;
      // nearest item to the current scroll position, from the real layout
      const position = Math.abs(this.track.scrollLeft);
      const guess = Math.round(position / step);
      let best = guess;
      let bestDistance = Infinity;
      for (let i = Math.max(0, guess - 2); i <= Math.min(this.track.children.length - 1, guess + 2); i++) {
        const distance = Math.abs(this.offsetOf(i) - position);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      return best;
    }

    /** Real slide index (0-based) currently at the start of the track. */
    get index() {
      if (this.loop) return (((this.rawIndex - this.offset) % this.count) + this.count) % this.count;
      if (Math.abs(this.track.scrollLeft) >= this.max - 2) return this.positions - 1;
      return this.rawIndex;
    }

    /** Exact scroll offset of item `raw` (clones included), measured from the
        layout rather than raw * step: item widths are fractional, and
        multiplying a rounded width drifts by a few pixels after many clones,
        which left the first card cut at the edge. */
    offsetOf(raw) {
      const items = this.track.children;
      const item = items[Math.max(0, Math.min(raw, items.length - 1))];
      const first = items[0];
      if (!item || !first) return 0;
      const a = item.getBoundingClientRect();
      const b = first.getBoundingClientRect();
      return this.rtl === 1 ? a.left - b.left : b.right - a.right;
    }

    scrollToRaw(raw, behavior = 'smooth') {
      const max = this.max;
      const left = Math.min(Math.max(this.offsetOf(raw), 0), max);
      this.track.scrollTo({ left: left * this.rtl, behavior });
    }

    /** Instant, invisible jump (snap and smooth scrolling off for one frame). */
    jumpTo(raw) {
      this.track.classList.add('is-dragging');
      this.scrollToRaw(raw, 'instant');
      requestAnimationFrame(() => {
        if (!this.drag) this.track.classList.remove('is-dragging');
      });
    }

    /** After a scroll settles on a clone, move to the same real slide. */
    recenter() {
      if (this.drag) return;
      const raw = this.rawIndex;
      if (raw < this.offset || raw >= this.offset + this.count) {
        this.jumpTo(this.index + this.offset);
      }
    }

    goTo(index, fromUser = false) {
      if (this.loop) {
        this.scrollToRaw(index + this.offset);
      } else {
        this.scrollToRaw(Math.max(0, Math.min(index, this.positions - 1)));
      }
      if (fromUser) this.start();
    }

    /** One item forward/back. Loop: always forward into the clones; otherwise
        wraps around at either end while autoplaying. */
    go(direction, fromUser = false) {
      if (this.loop) {
        this.recenter();
        this.scrollToRaw(this.rawIndex + direction);
      } else {
        const position = Math.abs(this.track.scrollLeft);
        if (this.speed && direction > 0 && position >= this.max - 2) {
          this.scrollToRaw(0);
        } else if (this.speed && direction < 0 && position <= 2) {
          this.scrollToRaw(this.positions - 1);
        } else {
          this.track.scrollBy({ left: direction * this.rtl * this.step, behavior: 'smooth' });
        }
      }
      if (fromUser) this.start();
    }

    buildDots() {
      const step = this.step;
      if (this.loop) {
        this.positions = this.count;
      } else {
        this.positions = step ? Math.max(1, Math.round(this.max / step) + 1) : 1;
      }
      if (!this.dots) return;
      if (this.dots.childElementCount === this.positions) return;
      const label = this.dots.dataset.label || 'Go to slide [n]';
      this.dots.replaceChildren(
        ...Array.from({ length: this.positions }, (_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'carousel-dot';
          dot.dataset.index = i;
          dot.setAttribute('aria-label', label.replace('[n]', i + 1));
          return dot;
        })
      );
      this.dots.hidden = this.positions < 2;
    }

    update() {
      const position = Math.abs(this.track.scrollLeft);
      const endless = this.loop || Boolean(this.speed);
      if (this.prev) this.prev.disabled = !endless && position <= 2;
      if (this.next) this.next.disabled = !endless && position >= this.max - 2;
      if (this.dots) {
        const current = this.index;
        [...this.dots.children].forEach((dot, i) => {
          if (i === current) dot.setAttribute('aria-current', 'true');
          else dot.removeAttribute('aria-current');
        });
      }
    }

    start() {
      this.stop();
      if (!this.speed || this.paused || document.hidden || this.positions < 2) return;
      this.timer = window.setInterval(() => this.go(1), this.speed);
    }

    stop() {
      window.clearInterval(this.timer);
    }
  }

  customElements.define('scroll-carousel', ScrollCarousel);
}
