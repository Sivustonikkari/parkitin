import { API_BASE, validateEmailInput } from '../../api/client';
import { trans } from '../../i18n/i18n';
import { setCurrentScreen } from '../../state/screen';
import { clearNavigation, renderLogo } from '../common';

export interface LoginActions {
    showRegister: (email: string) => void;
    showMessage: (key: string) => void;
}

export function renderLoginForm(app: HTMLElement, actions: LoginActions): void {
    setCurrentScreen({ name: 'login' });
    app.classList.remove('map-view');
    clearNavigation();
    app.innerHTML = '';
    renderLogo(app);

    const form = document.createElement('form');
    form.id = 'login-form';
    form.className = 'auth-form';
    const input = document.createElement('input');
    input.id = 'login-email';
    input.className = 'email-input';
    input.type = 'email';
    input.placeholder = trans('login.emailPlaceholder');
    input.required = true;
    const button = document.createElement('button');
    button.id = 'login-submit';
    button.className = 'submit-button';
    button.type = 'submit';
    button.textContent = trans('login.submit');
    form.append(input, button);
    app.appendChild(form);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!validateEmailInput(input)) return;
        const email = input.value.trim();
        const res = await fetch(`${API_BASE}?resource=login_request`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.needs_registration) {
            actions.showRegister(email);
            return;
        }
        actions.showMessage('messages.checkEmail');
    });
}