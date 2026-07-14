/**
 * Custom modal system – replaces native alert() and confirm()
 * Uses the same .modal-overlay / .modal-content styles as the Pomodoro modal.
 */

// ─── Alert Modal ─────────────────────────────────────────────────────────────

/**
 * Show a styled alert modal.
 * @param {string} message  - The message to display.
 * @param {string} [title]  - Optional title. Defaults to 'Shikionary'.
 * @param {'info'|'success'|'error'|'warning'} [type] - Icon/color variant.
 * @returns {Promise<void>} - Resolves when the user clicks Aceptar.
 */
export function showAlert(message, title = 'Shikionary', type = 'info') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-alert-overlay');
        const titleEl = document.getElementById('custom-alert-title');
        const iconEl  = document.getElementById('custom-alert-icon');
        const msgEl   = document.getElementById('custom-alert-message');
        const btnOk   = document.getElementById('custom-alert-ok');

        if (!overlay) { alert(message); resolve(); return; }

        // Icon + color per type
        const iconMap = {
            info:    { icon: 'fa-circle-info',       color: 'var(--accent-red)' },
            success: { icon: 'fa-circle-check',      color: '#4caf50' },
            error:   { icon: 'fa-circle-exclamation',color: '#f44336' },
            warning: { icon: 'fa-triangle-exclamation', color: '#ff9800' },
        };
        const cfg = iconMap[type] || iconMap.info;

        iconEl.className = `fa-solid ${cfg.icon}`;
        iconEl.style.color = cfg.color;
        titleEl.textContent = title;
        titleEl.style.color = cfg.color;
        msgEl.textContent = message;

        overlay.style.display = 'flex';

        const close = () => {
            overlay.style.display = 'none';
            btnOk.removeEventListener('click', close);
            resolve();
        };

        btnOk.addEventListener('click', close);
    });
}

/**
 * Show a styled confirm modal.
 * @param {string} message   - The question to display.
 * @param {string} [title]   - Optional title.
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled.
 */
export function showConfirm(message, title = 'Shikionary') {
    return new Promise((resolve) => {
        const overlay  = document.getElementById('custom-confirm-overlay');
        const titleEl  = document.getElementById('custom-confirm-title');
        const msgEl    = document.getElementById('custom-confirm-message');
        const btnOk    = document.getElementById('custom-confirm-ok');
        const btnCancel = document.getElementById('custom-confirm-cancel');

        if (!overlay) { resolve(confirm(message)); return; }

        titleEl.textContent = message;
        msgEl.textContent = title;
        overlay.style.display = 'flex';

        const done = (result) => {
            overlay.style.display = 'none';
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        };
        const onOk     = () => done(true);
        const onCancel = () => done(false);

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
    });
}
