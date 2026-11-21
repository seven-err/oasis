document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-password-toggle]');
    if (toggle) {
        const input = document.getElementById(toggle.dataset.passwordToggle);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        const slash = toggle.querySelector('[data-password-slash]');
        if (slash) {
            slash.setAttribute('visibility', show ? 'hidden' : 'visible');
        }
        if (!toggle.querySelector('svg')) {
            toggle.textContent = show ? 'Hide' : 'Show';
        }
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
