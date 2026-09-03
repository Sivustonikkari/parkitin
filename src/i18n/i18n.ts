// Localization loader and in-place translation updater for the Parkitin UI.

import { LOCALE_KEY } from '../api/client';
import type { LocaleInfo, Translations } from '../interfaces/models';

let translations: Translations = {};

export function trans(key: string, params?: Record<string, string>): string {
    const [context, field] = key.split('.');
    let str = translations[context]?.[field] ?? key;

    if (params) {
        for (const [name, value] of Object.entries(params)) {
            str = str.replace(`{${name}}`, value);
        }
    }

    return str;
}

export async function loadTranslations(locale: string): Promise<void> {
    const res = await fetch(`i18n/${locale}.json`);
    const data = await res.json();
    translations = data.translations ?? {};
}

function renderLanguageSwitcher(
    locales: LocaleInfo[],
    current: string,
    onLocaleChanged: () => void
): void {
    const container = document.getElementById('lang-switcher');
    if (!container) return;
    container.innerHTML = '';

    const select = document.createElement('select');
    select.id = 'locale-select';
    for (const locale of locales) {
        const option = document.createElement('option');
        option.value = locale.locale;
        option.textContent = locale.name;
        option.selected = locale.locale === current;
        select.appendChild(option);
    }

    select.addEventListener('change', async () => {
        sessionStorage.setItem(LOCALE_KEY, select.value);
        await loadTranslations(select.value);
        onLocaleChanged();
    });
    container.appendChild(select);
}

export async function initI18n(onLocaleChanged: () => void): Promise<void> {
    const res = await fetch('i18n');
    const locales: LocaleInfo[] = await res.json();
    if (locales.length === 0) return;

    const defaultLocale = locales.find((locale) => locale.default) ?? locales[0];
    const saved = sessionStorage.getItem(LOCALE_KEY);
    const current = locales.find((locale) => locale.locale === saved) ?? defaultLocale;
    await loadTranslations(current.locale);

    if (locales.length > 1) renderLanguageSwitcher(locales, current.locale, onLocaleChanged);
}
