import { API_BASE, validateEmailInput } from '../../api/client';
import { trans } from '../../i18n/i18n';
import { setCurrentScreen } from '../../state/screen';
import { clearNavigation, renderLogo } from '../common';

export interface RegisterActions {
    showLogin: () => void;
    showMessage: (key: string) => void;
}

export function renderRegisterForm(app: HTMLElement, email: string, actions: RegisterActions): void {
    setCurrentScreen({ name: 'register', email });
    app.classList.remove('map-view');
    clearNavigation();
    app.innerHTML = '';
    renderLogo(app);
    const form = document.createElement('form');
    form.id = 'register-form';
    form.className = 'auth-form';
    const input = document.createElement('input');
    input.id = 'register-email';
    input.className = 'email-input';
    input.type = 'email';
    input.value = email;
    input.required = true;
    const info = document.createElement('p');
    info.id = 'register-info';
    info.className = 'info-text';
    info.innerHTML = trans('register.info');
    const button = document.createElement('button');
    button.id = 'register-submit';
    button.className = 'submit-button';
    button.type = 'submit';
    button.textContent = trans('register.submit');
    form.append(input, info, button);
    app.appendChild(form);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateEmailInput(input)) return;
        const res = await fetch(`${API_BASE}?resource=register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.value.trim() }),
        });
        if (res.status === 409) {
            actions.showLogin();
            return;
        }
        const data = await res.json();
        if (data.login_link) localStorage.setItem('parkitin_last_login_link', data.login_link);
        actions.showMessage('messages.accountCreated');
    });
}