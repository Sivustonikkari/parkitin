// Browser API constants and shared client helpers for Parkitin requests.

export const API_BASE = 'api/index.php';
export const SESSION_KEY = 'parkitin_session_token';
export const LOCALE_KEY = 'parkitin_locale';

export function getSessionToken(): string | null {
    return localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string): void {
    localStorage.setItem(SESSION_KEY, token);
}

export function clearSessionToken(): void {
    localStorage.removeItem(SESSION_KEY);
}

export function validateEmailInput(input: HTMLInputElement): boolean {
    input.value = input.value.trim();
    if (input.checkValidity()) return true;
    input.reportValidity();
    return false;
}

export function adminFetch(query: string, token: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${API_BASE}?${query}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers ?? {}),
        },
    });
}
