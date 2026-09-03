import { clearSessionToken, API_BASE } from '../api/client';
import { trans } from '../i18n/i18n';
import type { NavView, ProfileData } from '../interfaces/models';

export interface NavigationActions {
    showMap: () => void;
    showProfile: () => void;
    showAdmin: () => void;
    showLogin: () => void;
}

export function renderUserNav(
    role: string,
    token: string,
    currentView: NavView,
    actions: NavigationActions
): void {
    const container = document.getElementById('nav-actions');
    if (!container) return;
    container.innerHTML = '';

    if (currentView !== 'map') {
        const mapButton = document.createElement('button');
        mapButton.type = 'button';
        mapButton.className = 'nav-button';
        mapButton.dataset.translationKey = 'map.findParking';
        mapButton.textContent = trans('map.findParking');
        mapButton.addEventListener('click', actions.showMap);
        container.appendChild(mapButton);
    }

    if (currentView !== 'profile') {
        const profileButton = document.createElement('button');
        profileButton.id = 'primary-nav-action';
        profileButton.type = 'button';
        profileButton.className = 'nav-icon-button';
        profileButton.title = trans('profile.open');
        const icon = document.createElement('img');
        icon.className = 'nav-profile-icon';
        icon.src = 'assets/profile-white.svg';
        icon.alt = trans('profile.open');
        profileButton.appendChild(icon);
        void fetch(`${API_BASE}?resource=payments&status=open`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => res.json())
            .then((payments) => { icon.src = payments.length ? 'assets/profile-red.svg' : 'assets/profile-white.svg'; });
        profileButton.addEventListener('click', actions.showProfile);
        container.appendChild(profileButton);
    }

    if ((role === 'owner' || role === 'admin') && currentView !== 'admin') {
        const adminButton = document.createElement('button');
        adminButton.type = 'button';
        adminButton.className = 'nav-button';
        adminButton.dataset.translationKey = 'admin.openPanel';
        adminButton.textContent = trans('admin.openPanel');
        adminButton.addEventListener('click', actions.showAdmin);
        container.appendChild(adminButton);
    }

    const logout = document.createElement('a');
    logout.id = 'logout';
    logout.className = 'logout-link';
    logout.href = '#';
    logout.textContent = trans('login.logout');
    logout.addEventListener('click', (event) => {
        event.preventDefault();
        clearSessionToken();
        container.innerHTML = '';
        actions.showLogin();
    });
    container.appendChild(logout);
}

export function renderLogo(container: HTMLElement): void {
    void container;
}

export function clearNavigation(): void {
    document.getElementById('nav-actions')?.replaceChildren();
}

export function renderMessage(app: HTMLElement, key: string): void {
    app.classList.remove('map-view');
    clearNavigation();
    app.innerHTML = '';
    renderLogo(app);
    const message = document.createElement('p');
    message.id = 'message';
    message.className = 'message';
    message.textContent = trans(key);
    app.appendChild(message);
    const loginLink = localStorage.getItem('parkitin_last_login_link');
    if (loginLink) {
        const link = document.createElement('a');
        link.href = loginLink;
        link.textContent = loginLink;
        link.className = 'login-link';
        link.style.display = 'block';
        link.style.marginTop = '1rem';
        app.appendChild(link);
        localStorage.removeItem('parkitin_last_login_link');
    }
}