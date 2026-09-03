import { trans } from '../../i18n/i18n';
import type { ProfileData } from '../../interfaces/models';
import { setCurrentScreen } from '../../state/screen';
import { renderLogo } from '../common';
import { renderLotsSection } from './lots';
import { renderUsersSection } from './users';

export interface AdminPanelActions { renderNavigation: (currentView: 'admin') => void; refreshSession: () => void; }
export function renderAdminPanel(app: HTMLElement, token: string, role: string, profile: ProfileData, actions: AdminPanelActions): void {
    setCurrentScreen({ name: 'admin' }); app.classList.remove('map-view'); app.innerHTML = ''; renderLogo(app); actions.renderNavigation('admin');
    const heading = document.createElement('h2'); heading.textContent = trans('admin.title'); app.appendChild(heading);
    const backButton = document.createElement('button'); backButton.className = 'submit-button'; backButton.type = 'button'; backButton.textContent = trans('admin.back'); backButton.addEventListener('click', actions.refreshSession); app.appendChild(backButton);
    const tabs = document.createElement('div'); tabs.className = 'admin-tabs';
    const lotsTab = document.createElement('button'); lotsTab.type = 'button'; lotsTab.className = 'admin-tab active'; lotsTab.textContent = trans('admin.lotsHeading');
    const usersTab = document.createElement('button'); usersTab.type = 'button'; usersTab.className = 'admin-tab'; usersTab.textContent = trans('admin.usersHeading'); tabs.append(lotsTab, usersTab); app.appendChild(tabs);
    const lotsSection = document.createElement('div'); lotsSection.id = 'admin-lots-section'; app.appendChild(lotsSection); void renderLotsSection(lotsSection, token);
    const usersSection = document.createElement('div'); usersSection.id = 'admin-users-section'; usersSection.hidden = true; app.appendChild(usersSection); void renderUsersSection(usersSection, token, role);
    lotsTab.addEventListener('click', () => { lotsSection.hidden = false; usersSection.hidden = true; lotsTab.classList.add('active'); usersTab.classList.remove('active'); });
    usersTab.addEventListener('click', () => { lotsSection.hidden = true; usersSection.hidden = false; usersTab.classList.add('active'); lotsTab.classList.remove('active'); });
    void profile;
}