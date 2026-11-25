/**
 * Contact form validation (sections/contact-feature.liquid).
 * Checks each field on blur and on submit, shows a message under the field,
 * and only lets the form post to Shopify once everything is valid.
 * Error texts come from the JSON block inside the form (locales/en.default.json).
 */
(() => {
  const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MESSAGE_MAX = 1000;

  const rules = {
    name(value, t) {
      if (!value) return t.nameRequired;
      if (value.length < 2 || !NAME_PATTERN.test(value)) return t.nameInvalid;
      return '';
    },
    email(value, t) {
      if (!value) return t.emailRequired;
      if (!EMAIL_PATTERN.test(value) || value.includes('..')) return t.emailInvalid;
      return '';
    },
    phone(value, t) {
      if (!value) return ''; // optional
      const digits = value.replace(/\D/g, '');
      if (!/^\+?[\d\s().-]+$/.test(value) || digits.length < 10 || digits.length > 15) return t.phoneInvalid;
      return '';
    },
    body(value, t) {
      if (value.length > MESSAGE_MAX) return t.messageTooLong;
      return '';
    },
  };

  // contact[name] -> name
  const keyOf = (field) => (field.name.match(/^contact\[(\w+)\]$/) || [])[1];

  const init = (form) => {
    if (form.dataset.validateReady) return;
    form.dataset.validateReady = 'true';

    let t = {};
    try {
      t = JSON.parse(form.querySelector('[data-contact-messages]').textContent);
    } catch (e) {
      return; // without messages, fall back to Shopify's own validation
    }

    const summary = form.querySelector('[data-error-summary]');
    const submit = form.querySelector('[type="submit"]');
    const fields = [...form.querySelectorAll('input, textarea')].filter((f) => rules[keyOf(f)]);

    const check = (field) => {
      const key = keyOf(field);
      const message = rules[key](field.value.trim(), t);
      const slot = form.querySelector(`[data-error-for="${key}"]`);
      field.classList.toggle('is-invalid', Boolean(message));
      if (message) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
      if (slot) {
        slot.textContent = message;
        slot.hidden = !message;
      }
      return !message;
    };

    fields.forEach((field) => {
      // First check when the visitor leaves the field; after that, live
      field.addEventListener('blur', () => {
        if (field.value.trim() || field.dataset.touched) check(field);
        field.dataset.touched = 'true';
      });
      field.addEventListener('input', () => {
        if (field.classList.contains('is-invalid')) {
          check(field);
          if (summary && !form.querySelector('.is-invalid')) summary.hidden = true;
        }
      });
    });

    form.addEventListener('submit', (event) => {
      const invalid = fields.filter((field) => !check(field));
      if (invalid.length) {
        event.preventDefault();
        if (summary) {
          summary.textContent = t.summary;
          summary.hidden = false;
        }
        invalid[0].focus();
        return;
      }
      if (summary) summary.hidden = true;
      // Trim values and stop double submits
      fields.forEach((field) => (field.value = field.value.trim()));
      if (submit) {
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submit.dataset.label = submit.firstChild.textContent;
        submit.firstChild.textContent = t.sending + ' ';
      }
    });
  };

  const initAll = () => document.querySelectorAll('.contact-feature__form').forEach(init);

  // Coming back to the page from the browser cache: re-enable the button
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    document.querySelectorAll('.contact-feature__form [type="submit"][aria-busy]').forEach((button) => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      if (button.dataset.label) button.firstChild.textContent = button.dataset.label;
    });
  });

  document.addEventListener('shopify:section:load', initAll);
  initAll();
})();
