/**
 * Footer menus: an accordion on phones (closed until tapped), always open
 * on tablet and desktop. The markup ships open, so menus still show without
 * JavaScript.
 */
(() => {
  const phone = window.matchMedia('(max-width: 749px)');

  const sync = () => {
    document.querySelectorAll('.footer__accordion').forEach((details) => {
      details.open = !phone.matches;
    });
  };

  // Larger screens: the title is a plain heading, so ignore clicks on it
  document.addEventListener('click', (event) => {
    if (phone.matches) return;
    if (event.target.closest('.footer__accordion-summary')) event.preventDefault();
  });

  phone.addEventListener('change', sync);
  // Re-sync when the footer is re-rendered in the theme editor
  document.addEventListener('shopify:section:load', sync);
  sync();
})();
