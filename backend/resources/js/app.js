document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-password-toggle]');
    if (toggle) {
        const input = document.getElementById(toggle.dataset.passwordToggle);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? 'Hide' : 'Show';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', (show ? 'Hide ' : 'Show ') + document.querySelector('label[for="' + input.id + '"]').textContent.toLowerCase());
    }
    const menuToggle = event.target.closest('[data-nav-toggle]');
    if (menuToggle) {
        const open = menuToggle.getAttribute('aria-expanded') !== 'true';
        menuToggle.setAttribute('aria-expanded', String(open));
        document.querySelector('.sidebar').classList.toggle('is-open', open);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[aria-invalid="true"]:not(:disabled)')?.focus();
});

document.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) || input.getAttribute('aria-invalid') !== 'true') return;
    const message = document.getElementById(`${input.id || input.name}-error`);
    if (input.validity.valid && (!input.required || input.value.trim())) {
        input.removeAttribute('aria-invalid');
        if (message) message.textContent = '';
    } else if (message) {
        message.textContent = input.validationMessage || 'Please complete this field.';
    }
});

document.addEventListener('invalid', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) || !input.closest('.field')) return;
    input.setAttribute('aria-invalid', 'true');
    const message = document.getElementById(`${input.id || input.name}-error`);
    if (message) {
        message.textContent = input.validationMessage || 'Please complete this field.';
        const describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (!describedBy.includes(message.id)) input.setAttribute('aria-describedby', [...describedBy, message.id].join(' '));
    }
}, true);
