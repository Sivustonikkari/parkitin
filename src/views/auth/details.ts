import { API_BASE, clearSessionToken } from '../../api/client';
import { trans } from '../../i18n/i18n';
import type { ProfileData } from '../../interfaces/models';
import { setCurrentScreen } from '../../state/screen';
import { loadPostOffices } from '../../utils/postal';
import { renderLogo } from '../common';
import { renderPayments } from '../payments';

export interface DetailsActions { renderNavigation: (currentView: 'profile') => void; showLogin: () => void; refreshSession: () => void; }
export function renderDetailsForm(app: HTMLElement, token: string, profile: ProfileData | undefined, actions: DetailsActions): void {
    setCurrentScreen({ name: 'details' }); app.classList.remove('map-view'); app.innerHTML = ''; renderLogo(app);
    if (profile) actions.renderNavigation('profile');
    const form = document.createElement('form'); form.id = 'details-form'; form.className = 'auth-form';
    if (profile) {
        const emailInput = document.createElement('input'); emailInput.id = 'details-email'; emailInput.className = 'email-input'; emailInput.type = 'email'; emailInput.value = profile.email; emailInput.disabled = true;
        const emailInfo = document.createElement('p'); emailInfo.id = 'email-info'; emailInfo.className = 'info-text'; emailInfo.textContent = trans('profile.emailInfo'); form.append(emailInput, emailInfo);
    }
    const makeInput = (id: string, placeholder: string): HTMLInputElement => { const input = document.createElement('input'); input.id = id; input.className = 'text-input'; input.type = 'text'; input.placeholder = trans(placeholder); input.required = true; return input; };
    const regInput = makeInput('details-reg-number', 'details.regNumberPlaceholder'); regInput.value = profile?.reg_number ?? '';
    const firstInput = makeInput('details-first-name', 'details.firstNamePlaceholder'); firstInput.value = profile?.first_name ?? '';
    const lastInput = makeInput('details-last-name', 'details.lastNamePlaceholder'); lastInput.value = profile?.last_name ?? '';
    const postalInput = makeInput('details-postal-code', 'details.postalCodePlaceholder'); postalInput.inputMode = 'numeric'; postalInput.maxLength = 5; postalInput.pattern = '\\d{5}'; postalInput.value = profile?.postal_code ?? '';
    const cityInput = makeInput('details-city', 'details.cityPlaceholder'); cityInput.disabled = true; cityInput.value = profile?.city ?? '';
    postalInput.addEventListener('input', async () => { cityInput.value = (await loadPostOffices()).get(postalInput.value.trim()) ?? ''; });
    const button = document.createElement('button'); button.id = 'details-submit'; button.className = 'submit-button'; button.type = 'submit'; button.textContent = trans('details.submit');
    form.append(regInput, firstInput, lastInput, postalInput, cityInput, button);
    if (profile) {
        const deleteButton = document.createElement('button'); deleteButton.id = 'delete-profile'; deleteButton.className = 'submit-button'; deleteButton.type = 'button'; deleteButton.textContent = trans('profile.delete');
        deleteButton.addEventListener('click', async () => { const res = await fetch(`${API_BASE}?resource=delete_profile`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); if (res.ok) { clearSessionToken(); actions.showLogin(); } }); form.appendChild(deleteButton);
    }
    app.appendChild(form); if (profile) void renderPayments(form, token);
    form.addEventListener('submit', async (event) => { event.preventDefault(); await fetch(`${API_BASE}?resource=update_profile`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reg_number: regInput.value.trim(), first_name: firstInput.value.trim(), last_name: lastInput.value.trim(), postal_code: postalInput.value.trim() }) }); actions.refreshSession(); });
}