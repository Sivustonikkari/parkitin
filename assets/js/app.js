"use strict";
const API_BASE = 'api/index.php';
const SESSION_KEY = 'parkitin_session_token';
const LOCALE_KEY = 'parkitin_locale';
const app = document.getElementById('app');
let translations = {};
let currentScreen = { name: 'login' };
function trans(key, params) {
    var _a, _b;
    const [context, field] = key.split('.');
    let str = (_b = (_a = translations[context]) === null || _a === void 0 ? void 0 : _a[field]) !== null && _b !== void 0 ? _b : key;
    if (params) {
        for (const [name, value] of Object.entries(params)) {
            str = str.replace(`{${name}}`, value);
        }
    }
    return str;
}
async function loadTranslations(locale) {
    var _a;
    const res = await fetch(`i18n/${locale}.json`);
    const data = await res.json();
    translations = (_a = data.translations) !== null && _a !== void 0 ? _a : {};
}
function renderLanguageSwitcher(locales, current) {
    const container = document.getElementById('lang-switcher');
    if (!container) {
        return;
    }
    container.innerHTML = '';
    const select = document.createElement('select');
    select.id = 'locale-select';
    for (const l of locales) {
        const option = document.createElement('option');
        option.value = l.locale;
        option.textContent = l.name;
        option.selected = l.locale === current;
        select.appendChild(option);
    }
    select.addEventListener('change', async () => {
        sessionStorage.setItem(LOCALE_KEY, select.value);
        await loadTranslations(select.value);
        retranslateCurrentScreen();
    });
    container.appendChild(select);
}
// re-applies text/placeholders on the currently visible screen without touching input values
function retranslateCurrentScreen() {
    const logout = document.getElementById('logout');
    if (logout)
        logout.textContent = trans('login.logout');
    document.querySelectorAll('.nav-button[data-translation-key]').forEach((el) => {
        if (el.dataset.translationKey)
            el.textContent = trans(el.dataset.translationKey);
    });
    const profileIcon = document.querySelector('.nav-profile-icon');
    if (profileIcon) {
        profileIcon.alt = trans('profile.open');
        const profileButton = document.getElementById('primary-nav-action');
        if (profileButton)
            profileButton.title = trans('profile.open');
    }
    switch (currentScreen.name) {
        case 'login': {
            const input = document.getElementById('login-email');
            const button = document.getElementById('login-submit');
            if (input)
                input.placeholder = trans('login.emailPlaceholder');
            if (button)
                button.textContent = trans('login.submit');
            break;
        }
        case 'register': {
            const info = document.getElementById('register-info');
            const button = document.getElementById('register-submit');
            if (info)
                info.innerHTML = trans('register.info');
            if (button)
                button.textContent = trans('register.submit');
            break;
        }
        case 'details': {
            const reg = document.getElementById('details-reg-number');
            const first = document.getElementById('details-first-name');
            const last = document.getElementById('details-last-name');
            const postal = document.getElementById('details-postal-code');
            const city = document.getElementById('details-city');
            const button = document.getElementById('details-submit');
            const emailInfo = document.getElementById('email-info');
            const deleteButton = document.getElementById('delete-profile');
            if (reg)
                reg.placeholder = trans('details.regNumberPlaceholder');
            if (first)
                first.placeholder = trans('details.firstNamePlaceholder');
            if (last)
                last.placeholder = trans('details.lastNamePlaceholder');
            if (postal)
                postal.placeholder = trans('details.postalCodePlaceholder');
            if (city)
                city.placeholder = trans('details.cityPlaceholder');
            if (button)
                button.textContent = trans('details.submit');
            if (emailInfo)
                emailInfo.textContent = trans('profile.emailInfo');
            if (deleteButton)
                deleteButton.textContent = trans('profile.delete');
            break;
        }
        case 'message': {
            const p = document.getElementById('message');
            if (p)
                p.textContent = trans(currentScreen.key);
            break;
        }
        case 'welcome': {
            const p = document.getElementById('welcome');
            if (p)
                p.textContent = trans('welcome.greeting', { email: currentScreen.email });
            break;
        }
        case 'map': {
            const centerButton = document.getElementById('map-center-button');
            if (centerButton) {
                centerButton.title = trans('map.center');
                centerButton.setAttribute('aria-label', trans('map.center'));
            }
            break;
        }
    }
}
async function initI18n() {
    var _a, _b;
    const res = await fetch('i18n/index.php');
    const locales = await res.json();
    if (locales.length === 0) {
        return;
    }
    const defaultLocale = (_a = locales.find((l) => l.default)) !== null && _a !== void 0 ? _a : locales[0];
    const saved = sessionStorage.getItem(LOCALE_KEY);
    const current = (_b = locales.find((l) => l.locale === saved)) !== null && _b !== void 0 ? _b : defaultLocale;
    await loadTranslations(current.locale);
    if (locales.length > 1) {
        renderLanguageSwitcher(locales, current.locale);
    }
}
let postOfficesPromise = null;
function loadPostOffices() {
    if (postOfficesPromise) {
        return postOfficesPromise;
    }
    postOfficesPromise = fetch('assets/postitoimipaikat.xml')
        .then((res) => res.text())
        .then((text) => {
        var _a, _b, _c, _d, _e;
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const offices = new Map();
        for (const office of xml.querySelectorAll('toimipaikka')) {
            const code = (_c = (_b = (_a = office.querySelector('postinumero')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : '';
            const name = ((_e = (_d = office.querySelector('nimi')) === null || _d === void 0 ? void 0 : _d.textContent) !== null && _e !== void 0 ? _e : '')
                .split('-')
                .map((part) => part.trim().replace(/\s+\d+$/, ''))
                .filter(Boolean)
                .join(' - ');
            if (code && name && !offices.has(code)) {
                offices.set(code, name);
            }
        }
        return offices;
    });
    return postOfficesPromise;
}
function getSessionToken() {
    return localStorage.getItem(SESSION_KEY);
}
function setSessionToken(token) {
    localStorage.setItem(SESSION_KEY, token);
}
function clearSessionToken() {
    localStorage.removeItem(SESSION_KEY);
}
function validateEmailInput(input) {
    input.value = input.value.trim();
    if (input.checkValidity()) {
        return true;
    }
    input.reportValidity();
    return false;
}
function renderUserNav(role, token, profile, currentView) {
    const actions = document.getElementById('nav-actions');
    if (!actions)
        return;
    actions.innerHTML = '';
    if (currentView !== 'map') {
        const mapButton = document.createElement('button');
        mapButton.type = 'button';
        mapButton.className = 'nav-button';
        mapButton.dataset.translationKey = 'map.findParking';
        mapButton.textContent = trans('map.findParking');
        mapButton.addEventListener('click', () => renderParkingMapView(token, role, profile));
        actions.appendChild(mapButton);
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
            .then((payments) => {
            icon.src = payments.length ? 'assets/profile-red.svg' : 'assets/profile-white.svg';
        });
        profileButton.addEventListener('click', () => renderDetailsForm(token, profile, role));
        actions.appendChild(profileButton);
    }
    if ((role === 'owner' || role === 'admin') && currentView !== 'admin') {
        const adminButton = document.createElement('button');
        adminButton.type = 'button';
        adminButton.className = 'nav-button';
        adminButton.dataset.translationKey = 'admin.openPanel';
        adminButton.textContent = trans('admin.openPanel');
        adminButton.addEventListener('click', () => renderAdminPanel(token, role, profile));
        actions.appendChild(adminButton);
    }
    const logout = document.createElement('a');
    logout.id = 'logout';
    logout.className = 'logout-link';
    logout.href = '#';
    logout.textContent = trans('login.logout');
    logout.addEventListener('click', (event) => {
        event.preventDefault();
        clearSessionToken();
        actions.innerHTML = '';
        renderLoginForm();
    });
    actions.appendChild(logout);
}
function renderLogo(container) {
    void container;
}
function renderMessage(key) {
    currentScreen = { name: 'message', key };
    app.classList.remove('map-view');
    const actions = document.getElementById('nav-actions');
    if (actions)
        actions.innerHTML = '';
    app.innerHTML = '';
    renderLogo(app);
    const p = document.createElement('p');
    p.id = 'message';
    p.className = 'message';
    p.textContent = trans(key);
    app.appendChild(p);
}
function renderWelcome(email, role, token, profile) {
    currentScreen = { name: 'welcome', email };
    app.classList.add('map-view');
    app.innerHTML = '';
    renderLogo(app);
    renderUserNav(role, token, profile, 'map');
    void renderCustomerMap(token);
}
function renderParkingMapView(token, role, profile) {
    currentScreen = { name: 'map' };
    app.classList.add('map-view');
    app.innerHTML = '';
    renderLogo(app);
    renderUserNav(role, token, profile, 'map');
    void renderCustomerMap(token);
}
async function renderCustomerMap(token) {
    var _a, _b;
    const section = document.createElement('section');
    section.id = 'customer-map-section';
    app.appendChild(section);
    const loadingMap = document.createElement('div');
    loadingMap.className = 'map-loading';
    loadingMap.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('div');
    spinner.className = 'map-loading-spinner';
    spinner.setAttribute('aria-label', 'Loading map');
    loadingMap.appendChild(spinner);
    section.appendChild(loadingMap);
    const requestLocation = () => new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition((position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
    });
    const locationPromise = requestLocation();
    const statusResponse = await fetch(`${API_BASE}?resource=parking_status`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const status = await statusResponse.json();
    if (status.parking) {
        const active = document.createElement('div');
        active.id = 'active-parking';
        const activeText = document.createElement('span');
        const showParking = (parking) => {
            const started = new Date(parking.start_time.replace(' ', 'T'));
            const elapsed = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));
            activeText.textContent = trans('parking.active', {
                lot: parking.lot_name,
                time: `${Math.floor(elapsed / 3600)}:${String(Math.floor(elapsed / 60) % 60).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`,
                price: Number(parking.price).toFixed(2),
            });
        };
        showParking(status.parking);
        const stop = document.createElement('button');
        stop.className = 'stop-parking';
        stop.type = 'button';
        stop.textContent = trans('parking.stop');
        let elapsedTimer = 0;
        let statusTimer = 0;
        stop.addEventListener('click', async () => {
            const response = await fetch(`${API_BASE}?resource=parking_stop`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok)
                return;
            const receipt = await response.json();
            window.clearInterval(elapsedTimer);
            window.clearInterval(statusTimer);
            active.remove();
            const receiptPopup = document.createElement('div');
            receiptPopup.id = 'parking-receipt';
            receiptPopup.className = 'map-booking-popup parking-receipt';
            const duration = Number(receipt.duration_minutes);
            const time = `${Math.floor(duration / 60)}h ${String(duration % 60).padStart(2, '0')}min`;
            const text = document.createElement('span');
            text.textContent = trans('parking.finished', {
                time,
                price: Number(receipt.price_charged).toFixed(2),
            });
            const close = document.createElement('button');
            close.className = 'receipt-close';
            close.type = 'button';
            close.textContent = 'x';
            const dismiss = () => receiptPopup.remove();
            close.addEventListener('click', dismiss);
            receiptPopup.append(close, text);
            section.appendChild(receiptPopup);
            window.setTimeout(() => document.addEventListener('click', dismiss, { once: true }), 0);
        });
        active.append(activeText, stop);
        section.appendChild(active);
        elapsedTimer = window.setInterval(() => {
            if (document.body.contains(active))
                showParking(status.parking);
        }, 1000);
        statusTimer = window.setInterval(async () => {
            if (!document.body.contains(active))
                return;
            const refresh = await fetch(`${API_BASE}?resource=parking_status`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const latest = await refresh.json();
            if (latest.parking)
                showParking(latest.parking);
        }, 30000);
    }
    const res = await fetch(`${API_BASE}?resource=map_lots`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok)
        return;
    const lots = await res.json();
    const located = [];
    for (const lot of lots) {
        if (lot.latitude !== null && lot.longitude !== null) {
            located.push({ ...lot, lat: Number(lot.latitude), lon: Number(lot.longitude) });
        }
    }
    if (located.length === 0)
        return;
    const averageCenter = located.reduce((sum, lot) => ({ lat: sum.lat + lot.lat, lon: sum.lon + lot.lon }), { lat: 0, lon: 0 });
    let userLocation = await locationPromise;
    const map = document.createElement('div');
    map.id = 'customer-map';
    const bookingPopup = document.createElement('div');
    bookingPopup.id = 'map-booking-popup';
    bookingPopup.className = 'map-booking-popup';
    bookingPopup.hidden = true;
    let zoom = 12;
    let centerLat = (_a = userLocation === null || userLocation === void 0 ? void 0 : userLocation.lat) !== null && _a !== void 0 ? _a : averageCenter.lat / located.length;
    let centerLon = (_b = userLocation === null || userLocation === void 0 ? void 0 : userLocation.lon) !== null && _b !== void 0 ? _b : averageCenter.lon / located.length;
    let drag = null;
    const centerButton = document.createElement('button');
    centerButton.id = 'map-center-button';
    centerButton.className = 'map-center-button';
    centerButton.type = 'button';
    centerButton.dataset.translationKey = 'map.center';
    centerButton.title = trans('map.center');
    centerButton.setAttribute('aria-label', trans('map.center'));
    centerButton.append(Object.assign(document.createElement('img'), { src: 'assets/me.svg', alt: '' }));
    centerButton.addEventListener('click', async () => {
        userLocation = userLocation !== null && userLocation !== void 0 ? userLocation : await requestLocation();
        if (!userLocation)
            return;
        centerLat = userLocation.lat;
        centerLon = userLocation.lon;
        draw();
    });
    function draw() {
        map.innerHTML = '';
        const width = map.clientWidth;
        const height = map.clientHeight;
        const world = 256 * 2 ** zoom;
        const point = (lat, lon) => ({
            x: ((lon + 180) / 360) * world,
            y: (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) * world / 2,
        });
        const centerPoint = point(centerLat, centerLon);
        const left = centerPoint.x - width / 2;
        const top = centerPoint.y - height / 2;
        const tileCount = 2 ** zoom;
        for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
            for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
                const tile = document.createElement('img');
                tile.className = 'map-tile';
                tile.src = `https://tile.openstreetmap.org/${zoom}/${(x + tileCount) % tileCount}/${y}.png`;
                tile.style.left = `${x * 256 - left}px`;
                tile.style.top = `${y * 256 - top}px`;
                tile.alt = '';
                map.appendChild(tile);
            }
        }
        const layer = document.createElement('div');
        layer.className = 'map-pin-layer';
        for (const lot of located) {
            const location = point(lot.lat, lot.lon);
            const pin = document.createElement('button');
            pin.className = `map-pin${lot.available_slots <= 0 ? ' full' : ''}`;
            pin.style.left = `${location.x - left}px`;
            pin.style.top = `${location.y - top}px`;
            pin.append(Object.assign(document.createElement('img'), { src: 'assets/pin.svg', alt: lot.name }));
            pin.addEventListener('click', (event) => {
                event.stopPropagation();
                bookingPopup.hidden = false;
                bookingPopup.innerHTML = `<strong>${lot.name}</strong><br>${lot.address}, ${lot.postal_code} ${lot.city}<br><br>${trans('parking.pricing', { first: lot.price_first_3h, extra: lot.price_per_extra_hour })}<br><br>${trans('parking.availability', { total: String(lot.capacity), available: String(lot.available_slots) })}`;
                if (lot.available_slots > 0 && !status.parking) {
                    const start = document.createElement('button');
                    start.className = 'submit-button';
                    start.type = 'button';
                    start.textContent = trans('parking.start');
                    start.addEventListener('click', async () => {
                        const response = await fetch(`${API_BASE}?resource=parking_start`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ lot_id: lot.id }),
                        });
                        if (!response.ok)
                            return;
                        const parking = await response.json();
                        const slot = parking.slot_name || `${trans('parking.slot')} ${parking.slot_number}`;
                        bookingPopup.innerHTML = `<strong>${trans('parking.assigned', { slot })}</strong>`;
                        const parked = document.createElement('button');
                        parked.className = 'submit-button';
                        parked.type = 'button';
                        parked.textContent = trans('parking.parked');
                        parked.addEventListener('click', () => checkSession());
                        const cancel = document.createElement('button');
                        cancel.className = 'cancel-parking';
                        cancel.type = 'button';
                        cancel.textContent = trans('parking.cancel');
                        cancel.addEventListener('click', async () => {
                            const cancelled = await fetch(`${API_BASE}?resource=parking_cancel`, {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${token}` },
                            });
                            if (cancelled.ok)
                                checkSession();
                        });
                        bookingPopup.append(parked, cancel);
                    });
                    bookingPopup.appendChild(start);
                }
            });
            layer.appendChild(pin);
        }
        map.appendChild(layer);
        map.appendChild(centerButton);
    }
    map.addEventListener('pointerdown', (event) => {
        if (event.target instanceof Element && event.target.closest('.map-pin, .map-center-button'))
            return;
        drag = { x: event.clientX, y: event.clientY };
        map.setPointerCapture(event.pointerId);
    });
    map.addEventListener('pointermove', (event) => {
        if (!drag)
            return;
        const world = 256 * 2 ** zoom;
        centerLon -= (event.clientX - drag.x) * 360 / world;
        const mercatorY = (1 - Math.asinh(Math.tan(centerLat * Math.PI / 180)) / Math.PI) / 2 - (event.clientY - drag.y) / world;
        centerLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * mercatorY))) * 180 / Math.PI;
        drag = { x: event.clientX, y: event.clientY };
        draw();
    });
    map.addEventListener('pointerup', () => { drag = null; });
    map.addEventListener('wheel', (event) => {
        event.preventDefault();
        zoom = Math.max(8, Math.min(18, zoom + (event.deltaY < 0 ? 1 : -1)));
        draw();
    }, { passive: false });
    loadingMap.remove();
    section.append(map, bookingPopup);
    draw();
}
function renderDetailsForm(token, profile, role = 'customer') {
    var _a, _b, _c, _d, _e;
    currentScreen = { name: 'details' };
    app.classList.remove('map-view');
    app.innerHTML = '';
    renderLogo(app);
    if (profile) {
        renderUserNav(role, token, profile, 'profile');
    }
    const form = document.createElement('form');
    form.id = 'details-form';
    form.className = 'auth-form';
    if (profile) {
        const emailInput = document.createElement('input');
        emailInput.id = 'details-email';
        emailInput.className = 'email-input';
        emailInput.type = 'email';
        emailInput.value = profile.email;
        emailInput.disabled = true;
        const emailInfo = document.createElement('p');
        emailInfo.id = 'email-info';
        emailInfo.className = 'info-text';
        emailInfo.textContent = trans('profile.emailInfo');
        form.append(emailInput, emailInfo);
    }
    const regInput = document.createElement('input');
    regInput.id = 'details-reg-number';
    regInput.className = 'text-input';
    regInput.type = 'text';
    regInput.placeholder = trans('details.regNumberPlaceholder');
    regInput.required = true;
    regInput.value = (_a = profile === null || profile === void 0 ? void 0 : profile.reg_number) !== null && _a !== void 0 ? _a : '';
    const firstInput = document.createElement('input');
    firstInput.id = 'details-first-name';
    firstInput.className = 'text-input';
    firstInput.type = 'text';
    firstInput.placeholder = trans('details.firstNamePlaceholder');
    firstInput.required = true;
    firstInput.value = (_b = profile === null || profile === void 0 ? void 0 : profile.first_name) !== null && _b !== void 0 ? _b : '';
    const lastInput = document.createElement('input');
    lastInput.id = 'details-last-name';
    lastInput.className = 'text-input';
    lastInput.type = 'text';
    lastInput.placeholder = trans('details.lastNamePlaceholder');
    lastInput.required = true;
    lastInput.value = (_c = profile === null || profile === void 0 ? void 0 : profile.last_name) !== null && _c !== void 0 ? _c : '';
    const postalInput = document.createElement('input');
    postalInput.id = 'details-postal-code';
    postalInput.className = 'text-input';
    postalInput.type = 'text';
    postalInput.inputMode = 'numeric';
    postalInput.maxLength = 5;
    postalInput.pattern = '\\d{5}';
    postalInput.placeholder = trans('details.postalCodePlaceholder');
    postalInput.required = true;
    postalInput.value = (_d = profile === null || profile === void 0 ? void 0 : profile.postal_code) !== null && _d !== void 0 ? _d : '';
    const cityInput = document.createElement('input');
    cityInput.id = 'details-city';
    cityInput.className = 'text-input';
    cityInput.type = 'text';
    cityInput.placeholder = trans('details.cityPlaceholder');
    cityInput.disabled = true;
    cityInput.value = (_e = profile === null || profile === void 0 ? void 0 : profile.city) !== null && _e !== void 0 ? _e : '';
    postalInput.addEventListener('input', async () => {
        const city = (await loadPostOffices()).get(postalInput.value.trim());
        cityInput.value = city !== null && city !== void 0 ? city : '';
    });
    const button = document.createElement('button');
    button.id = 'details-submit';
    button.className = 'submit-button';
    button.type = 'submit';
    button.textContent = trans('details.submit');
    form.appendChild(regInput);
    form.appendChild(firstInput);
    form.appendChild(lastInput);
    form.appendChild(postalInput);
    form.appendChild(cityInput);
    form.appendChild(button);
    if (profile) {
        const deleteButton = document.createElement('button');
        deleteButton.id = 'delete-profile';
        deleteButton.className = 'submit-button';
        deleteButton.type = 'button';
        deleteButton.textContent = trans('profile.delete');
        deleteButton.addEventListener('click', async () => {
            const res = await fetch(`${API_BASE}?resource=delete_profile`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                clearSessionToken();
                renderLoginForm();
            }
        });
        form.appendChild(deleteButton);
    }
    app.appendChild(form);
    if (profile) {
        void renderPayments(form, token);
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch(`${API_BASE}?resource=update_profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                reg_number: regInput.value.trim(),
                first_name: firstInput.value.trim(),
                last_name: lastInput.value.trim(),
                postal_code: postalInput.value.trim(),
            }),
        });
        checkSession();
    });
}
async function renderPayments(container, token) {
    const section = document.createElement('section');
    section.className = 'payments';
    const heading = document.createElement('h2');
    heading.textContent = trans('payments.title');
    const tabs = document.createElement('div');
    tabs.className = 'payment-tabs';
    const openTab = document.createElement('button');
    openTab.type = 'button';
    openTab.textContent = trans('payments.open');
    const historyTab = document.createElement('button');
    historyTab.type = 'button';
    historyTab.textContent = trans('payments.history');
    const content = document.createElement('div');
    tabs.append(openTab, historyTab);
    section.append(heading, tabs, content);
    container.appendChild(section);
    const show = async (status) => {
        const res = await fetch(`${API_BASE}?resource=payments&status=${status}`, { headers: { Authorization: `Bearer ${token}` } });
        const payments = await res.json();
        content.innerHTML = '';
        if (payments.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'payments-empty';
            empty.textContent = trans(status === 'open' ? 'payments.noOpen' : 'payments.noHistory');
            content.appendChild(empty);
            return;
        }
        const table = document.createElement('table');
        table.innerHTML = `<thead><tr><th>${trans('payments.lot')}</th><th>${trans('payments.time')}</th><th>${trans('payments.cost')}</th></tr></thead>`;
        const body = document.createElement('tbody');
        for (const payment of payments) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${payment.lot_name}</td><td>${payment.end_time}</td><td>${Number(payment.price_charged).toFixed(2)} EUR</td>`;
            body.appendChild(row);
        }
        table.appendChild(body);
        content.appendChild(table);
        const total = payments.reduce((sum, payment) => sum + Number(payment.price_charged), 0);
        const totalText = document.createElement('p');
        totalText.className = 'payments-total';
        totalText.textContent = trans(status === 'open' ? 'payments.totalDue' : 'payments.totalPaid', {
            total: total.toFixed(2),
        });
        content.appendChild(totalText);
        if (status === 'open' && payments.length) {
            const payButton = document.createElement('button');
            payButton.className = 'submit-button';
            payButton.type = 'button';
            payButton.textContent = trans('payments.mockMethod');
            payButton.addEventListener('click', () => {
                const overlay = document.createElement('div');
                overlay.className = 'payment-popup-overlay';
                const popup = document.createElement('div');
                popup.className = 'payment-popup';
                const title = document.createElement('h3');
                title.textContent = trans('payments.mockMethod');
                const priceText = document.createElement('p');
                priceText.className = 'payment-popup-total';
                priceText.textContent = trans('payments.totalDue', { total: total.toFixed(2) });
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.className = 'payment-slider';
                slider.min = '0';
                slider.max = '100';
                slider.value = '0';
                popup.append(title, priceText, slider);
                overlay.appendChild(popup);
                content.appendChild(overlay);
                slider.addEventListener('input', async () => {
                    if (Number(slider.value) < 100)
                        return;
                    const paid = await fetch(`${API_BASE}?resource=payments_pay`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                    overlay.remove();
                    if (paid.ok) {
                        const toast = document.createElement('div');
                        toast.className = 'payment-success-toast';
                        const toastText = document.createElement('div');
                        toastText.className = 'payment-success-message';
                        toastText.textContent = trans('payments.success');
                        toast.appendChild(toastText);
                        document.body.appendChild(toast);
                        window.setTimeout(() => toast.classList.add('fade-out'), 2700);
                        window.setTimeout(() => {
                            toast.remove();
                            void show('open');
                        }, 3000);
                    }
                });
                overlay.addEventListener('click', (event) => {
                    if (event.target === overlay)
                        overlay.remove();
                });
            });
            content.appendChild(payButton);
        }
    };
    openTab.addEventListener('click', () => void show('open'));
    historyTab.addEventListener('click', () => void show('paid'));
    await show('open');
}
function renderLoginForm() {
    currentScreen = { name: 'login' };
    app.classList.remove('map-view');
    const actions = document.getElementById('nav-actions');
    if (actions)
        actions.innerHTML = '';
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
    form.appendChild(input);
    form.appendChild(button);
    app.appendChild(form);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEmailInput(input))
            return;
        const email = input.value.trim();
        const res = await fetch(`${API_BASE}?resource=login_request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (data.needs_registration) {
            renderRegisterForm(email);
            return;
        }
        renderMessage('messages.checkEmail');
    });
}
function renderRegisterForm(email) {
    currentScreen = { name: 'register' };
    app.classList.remove('map-view');
    const actions = document.getElementById('nav-actions');
    if (actions)
        actions.innerHTML = '';
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
    form.appendChild(input);
    form.appendChild(info);
    form.appendChild(button);
    app.appendChild(form);
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEmailInput(input))
            return;
        const res = await fetch(`${API_BASE}?resource=register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: input.value.trim() }),
        });
        if (res.status === 409) {
            renderLoginForm();
            return;
        }
        renderMessage('messages.accountCreated');
    });
}
async function verifyToken(token) {
    const res = await fetch(`${API_BASE}?resource=verify&token=${encodeURIComponent(token)}`);
    if (!res.ok) {
        renderLoginForm();
        return;
    }
    const data = await res.json();
    setSessionToken(data.session_token);
    // strip the token from the URL so it isn't re-used on refresh
    window.history.replaceState({}, '', window.location.pathname);
    checkSession();
}
async function checkSession() {
    const token = getSessionToken();
    if (!token) {
        renderLoginForm();
        return;
    }
    const res = await fetch(`${API_BASE}?resource=me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        clearSessionToken();
        renderLoginForm();
        return;
    }
    const data = await res.json();
    // only ask for these details once, if they haven't been given yet
    if (data.needs_details) {
        renderDetailsForm(token);
        return;
    }
    renderWelcome(data.email, data.role, token, data);
}
function route() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        verifyToken(token);
        return;
    }
    checkSession();
}
async function adminFetch(query, token, options = {}) {
    var _a;
    return fetch(`${API_BASE}?${query}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...((_a = options.headers) !== null && _a !== void 0 ? _a : {}),
        },
    });
}
function renderAdminPanel(token, role, profile) {
    currentScreen = { name: 'admin' };
    app.classList.remove('map-view');
    app.innerHTML = '';
    renderLogo(app);
    renderUserNav(role, token, profile, 'admin');
    const heading = document.createElement('h2');
    heading.textContent = trans('admin.title');
    app.appendChild(heading);
    const backButton = document.createElement('button');
    backButton.className = 'submit-button';
    backButton.type = 'button';
    backButton.textContent = trans('admin.back');
    backButton.addEventListener('click', () => checkSession());
    app.appendChild(backButton);
    const tabs = document.createElement('div');
    tabs.className = 'admin-tabs';
    const lotsTab = document.createElement('button');
    lotsTab.type = 'button';
    lotsTab.className = 'admin-tab active';
    lotsTab.textContent = trans('admin.lotsHeading');
    const usersTab = document.createElement('button');
    usersTab.type = 'button';
    usersTab.className = 'admin-tab';
    usersTab.textContent = trans('admin.usersHeading');
    tabs.append(lotsTab, usersTab);
    app.appendChild(tabs);
    const lotsSection = document.createElement('div');
    lotsSection.id = 'admin-lots-section';
    app.appendChild(lotsSection);
    renderLotsSection(lotsSection, token);
    const usersSection = document.createElement('div');
    usersSection.id = 'admin-users-section';
    usersSection.hidden = true;
    app.appendChild(usersSection);
    renderUsersSection(usersSection, token, role);
    lotsTab.addEventListener('click', () => {
        lotsSection.hidden = false;
        usersSection.hidden = true;
        lotsTab.classList.add('active');
        usersTab.classList.remove('active');
    });
    usersTab.addEventListener('click', () => {
        lotsSection.hidden = true;
        usersSection.hidden = false;
        usersTab.classList.add('active');
        lotsTab.classList.remove('active');
    });
}
async function renderLotsSection(container, token) {
    container.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = trans('admin.lotsHeading');
    container.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'admin-list';
    container.appendChild(list);
    const res = await adminFetch('resource=lots', token);
    const lots = await res.json();
    let editingId = null;
    let slots = [];
    const form = document.createElement('form');
    form.className = 'auth-form';
    function addField(labelKey, input) {
        const field = document.createElement('label');
        field.className = 'lot-field';
        const label = document.createElement('span');
        label.textContent = trans(labelKey);
        field.append(label, input);
        form.appendChild(field);
    }
    const nameInput = document.createElement('input');
    nameInput.className = 'text-input';
    nameInput.placeholder = trans('admin.lotName');
    nameInput.required = true;
    const addressInput = document.createElement('input');
    addressInput.className = 'text-input';
    addressInput.placeholder = trans('admin.lotAddress');
    addressInput.required = true;
    const postalInput = document.createElement('input');
    postalInput.className = 'text-input';
    postalInput.type = 'text';
    postalInput.inputMode = 'numeric';
    postalInput.maxLength = 5;
    postalInput.pattern = '\\d{5}';
    postalInput.placeholder = trans('admin.lotPostalCode');
    postalInput.required = true;
    const cityInput = document.createElement('input');
    cityInput.className = 'text-input';
    cityInput.placeholder = trans('admin.lotCity');
    cityInput.disabled = true;
    const infoInput = document.createElement('textarea');
    infoInput.className = 'text-input';
    infoInput.placeholder = trans('admin.lotInfo');
    postalInput.addEventListener('input', async () => {
        const city = (await loadPostOffices()).get(postalInput.value.trim());
        cityInput.value = city !== null && city !== void 0 ? city : '';
    });
    const capacityInput = document.createElement('input');
    capacityInput.className = 'text-input';
    capacityInput.type = 'number';
    capacityInput.placeholder = trans('admin.lotCapacity');
    capacityInput.disabled = true;
    const price3hInput = document.createElement('input');
    price3hInput.className = 'text-input';
    price3hInput.type = 'number';
    price3hInput.step = '0.01';
    price3hInput.placeholder = trans('admin.lotPriceFirst3h');
    price3hInput.required = true;
    const priceExtraInput = document.createElement('input');
    priceExtraInput.className = 'text-input';
    priceExtraInput.type = 'number';
    priceExtraInput.step = '0.01';
    priceExtraInput.placeholder = trans('admin.lotPriceExtraHour');
    priceExtraInput.required = true;
    const submitButton = document.createElement('button');
    submitButton.className = 'submit-button';
    submitButton.type = 'submit';
    submitButton.textContent = trans('admin.add');
    addField('admin.lotName', nameInput);
    addField('admin.lotAddress', addressInput);
    addField('admin.lotPostalCode', postalInput);
    addField('admin.lotCity', cityInput);
    addField('admin.lotInfo', infoInput);
    addField('admin.lotCapacity', capacityInput);
    addField('admin.lotPriceFirst3h', price3hInput);
    addField('admin.lotPriceExtraHour', priceExtraInput);
    const slotsLabel = document.createElement('div');
    slotsLabel.className = 'slots-label';
    const slotsHeading = document.createElement('strong');
    slotsHeading.textContent = trans('admin.parkingSlots');
    const autoSlotsText = document.createElement('span');
    autoSlotsText.textContent = trans('admin.autoAddSlots');
    const autoSlotsInput = document.createElement('input');
    autoSlotsInput.type = 'number';
    autoSlotsInput.min = '1';
    autoSlotsInput.value = '1';
    autoSlotsInput.className = 'slot-count-input';
    const autoSlotsButton = document.createElement('button');
    autoSlotsButton.type = 'button';
    autoSlotsButton.className = 'submit-button';
    autoSlotsButton.textContent = trans('admin.addSlots');
    slotsLabel.append(slotsHeading, autoSlotsText, autoSlotsInput, autoSlotsButton);
    form.appendChild(slotsLabel);
    const slotGrid = document.createElement('div');
    slotGrid.id = 'slot-grid';
    slotGrid.className = 'slot-grid';
    form.appendChild(slotGrid);
    function renderSlots() {
        var _a;
        slotGrid.innerHTML = '';
        for (const [index, slot] of slots.entries()) {
            const slotItem = document.createElement('div');
            slotItem.className = 'slot-item';
            const title = document.createElement('strong');
            title.textContent = `${trans('admin.slot')} ${index + 1}`;
            const name = document.createElement('input');
            name.type = 'text';
            name.className = 'text-input';
            name.placeholder = trans('admin.slotName');
            name.value = (_a = slot.name) !== null && _a !== void 0 ? _a : '';
            name.addEventListener('input', () => { slot.name = name.value; });
            const activeLabel = document.createElement('label');
            const active = document.createElement('input');
            active.type = 'checkbox';
            active.checked = Boolean(slot.is_active);
            active.addEventListener('change', () => { slot.is_active = active.checked; });
            activeLabel.append(active, document.createTextNode(` ${trans('admin.slotActive')}`));
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'submit-button';
            deleteButton.textContent = trans('admin.delete');
            deleteButton.addEventListener('click', () => {
                slots.splice(index, 1);
                renderSlots();
            });
            slotItem.append(title, name, activeLabel, deleteButton);
            slotGrid.appendChild(slotItem);
        }
        capacityInput.value = String(slots.length);
    }
    autoSlotsButton.addEventListener('click', () => {
        const count = Number(autoSlotsInput.value);
        if (Number.isInteger(count) && count > 0) {
            slots.push(...Array.from({ length: count }, () => ({ name: null, is_active: true })));
            renderSlots();
        }
    });
    form.appendChild(submitButton);
    container.appendChild(form);
    function resetForm() {
        editingId = null;
        form.reset();
        slots = [];
        renderSlots();
        submitButton.textContent = trans('admin.add');
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = JSON.stringify({
            name: nameInput.value.trim(),
            address: addressInput.value.trim(),
            postal_code: postalInput.value.trim(),
            info: infoInput.value.trim(),
            price_first_3h: price3hInput.value,
            price_per_extra_hour: priceExtraInput.value,
            slots,
        });
        if (editingId) {
            await adminFetch(`resource=lots&id=${editingId}`, token, { method: 'PUT', body });
        }
        else {
            await adminFetch('resource=lots', token, { method: 'POST', body });
        }
        resetForm();
        renderLotsSection(container, token);
    });
    for (const lot of lots) {
        const item = document.createElement('li');
        item.textContent = `${lot.name} (${lot.city}) — ${lot.capacity} ${trans('admin.slotsSuffix')} `;
        const editButton = document.createElement('button');
        editButton.className = 'submit-button';
        editButton.type = 'button';
        editButton.textContent = trans('admin.edit');
        editButton.addEventListener('click', async () => {
            var _a;
            editingId = lot.id;
            nameInput.value = lot.name;
            addressInput.value = lot.address;
            postalInput.value = lot.postal_code;
            cityInput.value = lot.city;
            infoInput.value = (_a = lot.info) !== null && _a !== void 0 ? _a : '';
            price3hInput.value = String(lot.price_first_3h);
            priceExtraInput.value = String(lot.price_per_extra_hour);
            const slotsRes = await adminFetch(`resource=slots&lot_id=${lot.id}`, token);
            slots = await slotsRes.json();
            renderSlots();
            submitButton.textContent = trans('admin.save');
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'submit-button';
        deleteButton.type = 'button';
        deleteButton.textContent = trans('admin.delete');
        deleteButton.addEventListener('click', async () => {
            await adminFetch(`resource=lots&id=${lot.id}`, token, { method: 'DELETE' });
            renderLotsSection(container, token);
        });
        item.appendChild(editButton);
        item.appendChild(deleteButton);
        list.appendChild(item);
    }
}
async function renderUsersSection(container, token, actorRole) {
    var _a, _b, _c, _d;
    container.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = trans('admin.usersHeading');
    container.appendChild(heading);
    const list = document.createElement('ul');
    list.className = 'admin-list';
    container.appendChild(list);
    const res = await adminFetch('resource=users', token);
    const users = await res.json();
    let editingId = null;
    const form = document.createElement('form');
    form.className = 'auth-form';
    const regInput = document.createElement('input');
    regInput.className = 'text-input';
    regInput.placeholder = trans('details.regNumberPlaceholder');
    regInput.required = true;
    const emailInput = document.createElement('input');
    emailInput.className = 'text-input';
    emailInput.type = 'email';
    emailInput.placeholder = trans('login.emailPlaceholder');
    emailInput.required = true;
    const firstInput = document.createElement('input');
    firstInput.className = 'text-input';
    firstInput.placeholder = trans('details.firstNamePlaceholder');
    firstInput.required = true;
    const lastInput = document.createElement('input');
    lastInput.className = 'text-input';
    lastInput.placeholder = trans('details.lastNamePlaceholder');
    lastInput.required = true;
    const postalInput = document.createElement('input');
    postalInput.className = 'text-input';
    postalInput.type = 'text';
    postalInput.inputMode = 'numeric';
    postalInput.maxLength = 5;
    postalInput.pattern = '\\d{5}';
    postalInput.placeholder = trans('details.postalCodePlaceholder');
    postalInput.required = true;
    const cityInput = document.createElement('input');
    cityInput.className = 'text-input';
    cityInput.placeholder = trans('details.cityPlaceholder');
    cityInput.disabled = true;
    postalInput.addEventListener('input', async () => {
        const city = (await loadPostOffices()).get(postalInput.value.trim());
        cityInput.value = city !== null && city !== void 0 ? city : '';
    });
    const roleSelect = document.createElement('select');
    roleSelect.className = 'text-input';
    for (const role of actorRole === 'owner' ? ['admin', 'customer'] : ['customer']) {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = trans(`admin.role${role[0].toUpperCase()}${role.slice(1)}`);
        roleSelect.appendChild(option);
    }
    const statusSelect = document.createElement('select');
    statusSelect.className = 'text-input';
    for (const status of ['confirmed', 'pending']) {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = trans(`admin.status${status[0].toUpperCase()}${status.slice(1)}`);
        statusSelect.appendChild(option);
    }
    const submitButton = document.createElement('button');
    submitButton.className = 'submit-button';
    submitButton.type = 'submit';
    submitButton.textContent = trans('admin.add');
    form.append(regInput, emailInput, firstInput, lastInput, postalInput, cityInput, roleSelect, statusSelect, submitButton);
    container.appendChild(form);
    function resetForm() {
        editingId = null;
        form.reset();
        submitButton.textContent = trans('admin.add');
    }
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEmailInput(emailInput))
            return;
        const body = JSON.stringify({
            reg_number: regInput.value.trim(),
            email: emailInput.value.trim(),
            first_name: firstInput.value.trim(),
            last_name: lastInput.value.trim(),
            postal_code: postalInput.value.trim(),
            role: roleSelect.value,
            status: statusSelect.value,
        });
        if (editingId) {
            await adminFetch(`resource=users&id=${editingId}`, token, { method: 'PUT', body });
        }
        else {
            await adminFetch('resource=users', token, { method: 'POST', body });
        }
        resetForm();
        renderUsersSection(container, token, actorRole);
    });
    for (const user of users) {
        const item = document.createElement('li');
        item.textContent = `${(_a = user.first_name) !== null && _a !== void 0 ? _a : ''} ${(_b = user.last_name) !== null && _b !== void 0 ? _b : ''} — ${(_c = user.email) !== null && _c !== void 0 ? _c : ''} — ${(_d = user.city) !== null && _d !== void 0 ? _d : ''} (${user.role}) `;
        const canManage = actorRole === 'owner'
            ? user.role !== 'owner'
            : user.role === 'customer';
        if (!canManage) {
            list.appendChild(item);
            continue;
        }
        const editButton = document.createElement('button');
        editButton.className = 'submit-button';
        editButton.type = 'button';
        editButton.textContent = trans('admin.edit');
        editButton.addEventListener('click', () => {
            var _a, _b, _c, _d, _e, _f;
            editingId = user.id;
            regInput.value = (_a = user.reg_number) !== null && _a !== void 0 ? _a : '';
            emailInput.value = (_b = user.email) !== null && _b !== void 0 ? _b : '';
            firstInput.value = (_c = user.first_name) !== null && _c !== void 0 ? _c : '';
            lastInput.value = (_d = user.last_name) !== null && _d !== void 0 ? _d : '';
            postalInput.value = (_e = user.postal_code) !== null && _e !== void 0 ? _e : '';
            cityInput.value = (_f = user.city) !== null && _f !== void 0 ? _f : '';
            roleSelect.value = user.role;
            statusSelect.value = user.status;
            submitButton.textContent = trans('admin.save');
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'submit-button';
        deleteButton.type = 'button';
        deleteButton.textContent = trans('admin.delete');
        deleteButton.addEventListener('click', async () => {
            await adminFetch(`resource=users&id=${user.id}`, token, { method: 'DELETE' });
            renderUsersSection(container, token, actorRole);
        });
        item.appendChild(editButton);
        item.appendChild(deleteButton);
        list.appendChild(item);
    }
}
async function bootstrap() {
    await initI18n();
    route();
}
bootstrap();
