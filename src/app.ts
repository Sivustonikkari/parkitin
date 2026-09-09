import { API_BASE, clearSessionToken, getSessionToken, setSessionToken } from './api/client';
import { installLocalApi, LOCAL_STORE_KEY } from './api/local-api';
import { initI18n } from './i18n/i18n';
import type { NavView, ProfileData } from './interfaces/models';
import { getCurrentScreen, setCurrentScreen } from './state/screen';
import { renderAdminPanel } from './views/admin/panel';
import { renderDetailsForm } from './views/auth/details';
import { renderLoginForm } from './views/auth/login';
import { renderRegisterForm } from './views/auth/register';
import { renderLogo, renderMessage as sharedMessage, renderUserNav } from './views/common';
import { renderCustomerMap } from './views/map/customer-map';

const app = document.getElementById('app') as HTMLElement;
installLocalApi();
window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_STORE_KEY && getSessionToken()) void checkSession();
});
const showMessage = (key: string): void => { setCurrentScreen({ name: 'message', key }); sharedMessage(app, key); };
const showLogin = (): void => renderLoginForm(app, { showRegister, showMessage });
const showRegister = (email: string): void => renderRegisterForm(app, email, { showLogin, showMessage });
function renderNav(role: string, token: string, profile: ProfileData, view: NavView): void { renderUserNav(role, token, view, { showMap: () => showMap(token, role, profile), showProfile: () => renderDetailsForm(app, token, profile, { renderNavigation: () => renderNav(role, token, profile, 'profile'), showLogin, refreshSession: checkSession }), showAdmin: () => renderAdminPanel(app, token, role, profile, { renderNavigation: () => renderNav(role, token, profile, 'admin'), refreshSession: checkSession }), showLogin }); }
function showMap(token: string, role: string, profile: ProfileData): void { setCurrentScreen({ name: 'map' }); app.classList.add('map-view'); app.innerHTML = ''; renderLogo(app); renderNav(role, token, profile, 'map'); void renderCustomerMap(app, token, { refreshSession: checkSession }); }
function showWelcome(email: string, role: string, token: string, profile: ProfileData): void { setCurrentScreen({ name: 'welcome', email }); showMap(token, role, profile); setCurrentScreen({ name: 'welcome', email }); }
async function verifyToken(token: string): Promise<void> { const res = await fetch(`${API_BASE}?resource=verify&token=${encodeURIComponent(token)}`); if (!res.ok) { showLogin(); return; } const data = await res.json(); setSessionToken(data.session_token); window.history.replaceState({}, '', window.location.pathname); void checkSession(); }
async function checkSession(): Promise<void> { const token = getSessionToken(); if (!token) { showLogin(); return; } const res = await fetch(`${API_BASE}?resource=me`, { headers: { Authorization: `Bearer ${token}` } }); if (!res.ok) { clearSessionToken(); showLogin(); return; } const data = await res.json(); if (data.needs_details) { renderDetailsForm(app, token, undefined, { renderNavigation: () => undefined, showLogin, refreshSession: checkSession }); return; } showWelcome(data.email, data.role, token, data); }
function route(): void { const token = new URLSearchParams(window.location.search).get('token'); if (token) { void verifyToken(token); return; } void checkSession(); }
function retranslate(): void { const screen = getCurrentScreen(); if (!screen) return; if (screen.name === 'login') { showLogin(); return; } if (screen.name === 'register') { showRegister(screen.email); return; } if (screen.name === 'message') { showMessage(screen.key); return; } void checkSession(); }
void initI18n(retranslate).then(route);