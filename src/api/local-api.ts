interface LocalUser {
    id: number;
    email: string;
    reg_number: string | null;
    first_name: string | null;
    last_name: string | null;
    postal_code: string | null;
    role: 'owner' | 'admin' | 'customer';
    status: 'pending' | 'confirmed';
    parking: LocalParking | null;
}

interface LocalParking {
    session_id: number;
    lot_id: number;
    slot_id: number;
    slot_number: number;
    start_time: string;
}

interface LocalLot {
    id: number;
    name: string;
    address: string;
    city: string;
    postal_code: string;
    latitude: number;
    longitude: number;
    info: string;
    capacity: number;
    price_first_3h: number;
    price_per_extra_hour: number;
    parking: number[];
}

interface LocalSlot {
    id: number;
    lot_id: number;
    slot_number: number;
    name: string | null;
    is_active: number;
    occupied: boolean;
}

interface LocalSession {
    id: number;
    user_id: number;
    slot_id: number;
    start_time: string;
    end_time: string | null;
    price_charged: number | null;
    status: 'open' | 'paid';
}

interface LocalStore {
    users: LocalUser[];
    lots: LocalLot[];
    slots: LocalSlot[];
    sessions: LocalSession[];
    loginTokens: Record<string, { userId: number; expires: number }>;
    sessionsByToken: Record<string, { userId: number; expires: number }>;
    nextUserId: number;
    nextLotId: number;
    nextSlotId: number;
    nextSessionId: number;
}

export const LOCAL_STORE_KEY = 'parkitin_local_store_sql_v1';
const STORE_KEY = LOCAL_STORE_KEY;
const SQL_SEED_URL = 'assets/dbttx_parkitin.sql';
const ORIGINAL_FETCH = Symbol('parkitin-original-fetch');

type WindowWithFetch = Window & { [ORIGINAL_FETCH]?: typeof window.fetch };

function now(): string {
    return new Date().toISOString();
}

function sqlValue(value: string): string | number | null {
    const trimmed = value.trim();
    if (trimmed.toUpperCase() === 'NULL') return null;
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const number = Number(trimmed);
    return Number.isNaN(number) ? trimmed : number;
}

function splitSqlValues(value: string): string[] {
    const values: string[] = [];
    let current = ''; let quoted = false; let escaped = false;
    for (const character of value) {
        if (character === "'" && !escaped) quoted = !quoted;
        if (character === ',' && !quoted) { values.push(current); current = ''; } else current += character;
        escaped = character === '\\' && !escaped;
        if (character !== '\\') escaped = false;
    }
    values.push(current);
    return values;
}

function sqlRows(sql: string, table: string): Record<string, string | number | null>[] {
    const pattern = new RegExp('INSERT INTO `' + table + '` \\(([^)]+)\\) VALUES\\s*([\\s\\S]*?);', 'g');
    const rows: Record<string, string | number | null>[] = [];
    for (const match of sql.matchAll(pattern)) {
        const columns = match[1].split(',').map((column) => column.replace(/[\s`]/g, ''));
        const tuples = match[2].match(/\((?:[^'()]|'(?:\\.|[^'])*')*\)/g) ?? [];
        for (const tuple of tuples) {
            const values = splitSqlValues(tuple.slice(1, -1)).map(sqlValue);
            rows.push(Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
        }
    }
    return rows;
}

function jsonValue<T>(value: string | number | null, fallback: T): T {
    if (typeof value !== 'string' || value.trim() === '') return fallback;
    try {
        return JSON.parse(value.replace(/\\"/g, '"')) as T;
    } catch {
        return fallback;
    }
}

async function loadStore(): Promise<LocalStore> {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
        const store = JSON.parse(saved) as LocalStore;
        ensureTestAccounts(store);
        saveStore(store);
        return store;
    }
    const sql = await (await fetch(SQL_SEED_URL)).text();
    const userRows = sqlRows(sql, 'users');
    const lotRows = sqlRows(sql, 'parking_lots');
    const slotRows = sqlRows(sql, 'parking_slots');
    const sessionRows = sqlRows(sql, 'parking_sessions');
    const users = userRows.map((row) => ({ ...row, id: Number(row.id), email: String(row.email ?? ''), reg_number: row.reg_number as string | null, first_name: row.first_name as string | null, last_name: row.last_name as string | null, postal_code: row.postal_code as string | null, role: row.role as LocalUser['role'], status: row.status as LocalUser['status'], parking: jsonValue<LocalParking | null>(row.parking as string | null, null) })) as LocalUser[];
    const sessions = sessionRows.map((row) => ({ ...row, id: Number(row.id), user_id: Number(row.user_id), slot_id: Number(row.slot_id), start_time: String(row.start_time), end_time: row.end_time as string | null, price_charged: row.price_charged === null ? null : Number(row.price_charged), status: row.status as LocalSession['status'] })) as LocalSession[];
    const slots = slotRows.map((row) => ({ id: Number(row.id), lot_id: Number(row.lot_id), slot_number: Number(row.slot_number), name: row.name as string | null, is_active: Number(row.is_active), occupied: sessions.some((session) => session.slot_id === Number(row.id) && session.end_time === null) }));
    const lots = lotRows.map((row) => ({ id: Number(row.id), name: String(row.name), address: String(row.address), city: String(row.city), postal_code: String(row.postal_code), latitude: Number(row.latitude), longitude: Number(row.longitude), info: String(row.info ?? ''), capacity: Number(row.capacity), price_first_3h: Number(row.price_first_3h), price_per_extra_hour: Number(row.price_per_extra_hour), parking: jsonValue<number[]>(row.parking, []) }));
    const store: LocalStore = { users, lots, slots, sessions, loginTokens: {}, sessionsByToken: {}, nextUserId: Math.max(0, ...users.map((user) => user.id)) + 1, nextLotId: Math.max(0, ...lots.map((lot) => lot.id)) + 1, nextSlotId: Math.max(0, ...slots.map((slot) => slot.id)) + 1, nextSessionId: Math.max(0, ...sessions.map((session) => session.id)) + 1 };
    ensureTestAccounts(store);
    saveStore(store);
    return store;
}

function ensureTestAccounts(store: LocalStore): void {
    const admin = store.users.find((user) => user.email === 'test.admin@parkitin.fi');
    if (admin) {
        admin.role = 'admin'; admin.status = 'confirmed';
    } else {
        store.users.push({ id: store.nextUserId++, email: 'test.admin@parkitin.fi', reg_number: null, first_name: 'Test', last_name: 'Admin', postal_code: '00100', role: 'admin', status: 'confirmed', parking: null });
    }
    const customer = store.users.find((user) => user.email === 'test.user@parkitin.fi');
    if (customer) {
        customer.role = 'customer'; customer.status = 'confirmed'; customer.reg_number = 'ABC-123';
    } else {
        store.users.push({ id: store.nextUserId++, email: 'test.user@parkitin.fi', reg_number: 'ABC-123', first_name: 'Test', last_name: 'User', postal_code: '00100', role: 'customer', status: 'confirmed', parking: null });
    }
}

function saveStore(store: LocalStore): void {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function error(message: string, status: number): Response {
    return response({ error: message }, status);
}

function currentUser(store: LocalStore, request: Request): LocalUser | null {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '');
    if (!match) return null;
    const session = store.sessionsByToken[match[1]];
    if (!session || session.expires < Date.now()) return null;
    return store.users.find((user) => user.id === session.userId) ?? null;
}

function price(lot: LocalLot, start: string): number {
    const minutes = Math.max(1, Math.ceil((Date.now() - Date.parse(start)) / 60000));
    return Math.min(minutes, 180) * lot.price_first_3h + Math.max(0, minutes - 180) * lot.price_per_extra_hour;
}

async function localApi(request: Request): Promise<Response> {
    const url = new URL(request.url, window.location.href);
    const resource = url.searchParams.get('resource');
    const store = await loadStore();
    let body: Record<string, unknown> = {};
    if (request.method !== 'GET' && request.method !== 'DELETE') {
        const rawBody = await request.text();
        if (rawBody.trim() !== '') body = JSON.parse(rawBody) as Record<string, unknown>;
    }
    const user = currentUser(store, request);
    if (resource === 'camera_lots') return response(store.lots.map((lot) => ({ id: lot.id, name: lot.name, address: lot.address, postal_code: lot.postal_code, city: lot.city })));
    if (resource === 'camera_start' || resource === 'camera_stop') {
        const plate = String(body.plate ?? '').trim().toUpperCase();
        const cameraUser = store.users.find((item) => item.reg_number === plate);
        if (!cameraUser) return error('plate_not_found', 404);
        if (resource === 'camera_start') {
            const lot = store.lots.find((item) => item.id === Number(body.lot_id));
            if (!lot) return error('lot_not_found', 404);
            if (cameraUser.parking) return error('already_parking', 409);
            const slot = store.slots.find((item) => item.lot_id === lot.id && item.is_active && !store.sessions.some((session) => session.slot_id === item.id && session.end_time === null));
            if (!slot) return error('lot_full', 409);
            const session: LocalSession = { id: store.nextSessionId++, user_id: cameraUser.id, slot_id: slot.id, start_time: now(), end_time: null, price_charged: null, status: 'open' };
            store.sessions.push(session); cameraUser.parking = { session_id: session.id, lot_id: lot.id, slot_id: slot.id, slot_number: slot.slot_number, start_time: session.start_time }; lot.parking.push(session.id); saveStore(store);
            return response({ plate, user: { id: cameraUser.id, reg_number: cameraUser.reg_number, email: cameraUser.email, first_name: cameraUser.first_name, last_name: cameraUser.last_name }, parking_id: session.id, lot_id: lot.id, lot_name: lot.name, lot_address: lot.address, lot_city: lot.city, slot: slot.name || `Paikka ${slot.slot_number}`, start_time: session.start_time }, 201);
        }
        if (!cameraUser.parking) return error('no_active_parking', 404);
        const parking = cameraUser.parking; const session = store.sessions.find((item) => item.id === parking.session_id); const lot = store.lots.find((item) => item.id === parking.lot_id);
        if (!session || !lot) return error('no_active_parking', 404);
        session.end_time = now(); session.price_charged = price(lot, session.start_time); cameraUser.parking = null; lot.parking = lot.parking.filter((id) => id !== session.id); saveStore(store);
        return response({ plate, user: { id: cameraUser.id, reg_number: cameraUser.reg_number, email: cameraUser.email, first_name: cameraUser.first_name, last_name: cameraUser.last_name }, parking_id: session.id, lot_id: lot.id, lot_name: lot.name, slot: `Paikka ${parking.slot_number}`, start_time: session.start_time, duration_minutes: Math.max(1, Math.ceil((Date.now() - Date.parse(session.start_time)) / 60000)), price_charged: session.price_charged });
    }
    const needsUser = ['me', 'update_profile', 'delete_profile', 'map_lots', 'parking_start', 'parking_cancel', 'parking_stop', 'parking_status', 'parking_receipt', 'payments', 'payments_pay'];
    if (needsUser.includes(resource ?? '') && !user) return error('Missing session token', 401);

    if (resource === 'login_request') {
        const account = store.users.find((item) => item.email === body.email);
        if (!account) return response({ needs_registration: true });
        const token = crypto.randomUUID(); store.loginTokens[token] = { userId: account.id, expires: Date.now() + 900000 }; saveStore(store);
        return response({ message: 'Login link created', login_link: `${window.location.origin}${window.location.pathname}?token=${token}` });
    }
    if (resource === 'register') {
        if (store.users.some((item) => item.email === body.email)) return error('An account with this email already exists', 409);
        const account: LocalUser = { id: store.nextUserId++, email: String(body.email), reg_number: null, first_name: null, last_name: null, postal_code: null, role: store.users.length === 0 ? 'owner' : 'customer', status: 'pending', parking: null };
        store.users.push(account); const token = crypto.randomUUID(); store.loginTokens[token] = { userId: account.id, expires: Date.now() + 900000 }; saveStore(store);
        return response({ message: 'Account created', login_link: `${window.location.origin}${window.location.pathname}?token=${token}` }, 201);
    }
    if (resource === 'verify') {
        const token = url.searchParams.get('token') ?? ''; const login = store.loginTokens[token];
        if (!login || login.expires < Date.now()) return error('Invalid or expired token', 400);
        delete store.loginTokens[token]; const account = store.users.find((item) => item.id === login.userId); if (!account) return error('Invalid or expired token', 400);
        account.status = 'confirmed'; const sessionToken = crypto.randomUUID(); store.sessionsByToken[sessionToken] = { userId: account.id, expires: Date.now() + 3600000 }; saveStore(store);
        return response({ session_token: sessionToken, expires_in: 3600 });
    }
    if (resource === 'me') return response({ ...user, city: user?.postal_code ?? null, needs_details: !user?.reg_number || !user?.first_name || !user?.last_name || !user?.postal_code });
    if (resource === 'update_profile' && user) { Object.assign(user, { reg_number: body.reg_number, first_name: body.first_name, last_name: body.last_name, postal_code: body.postal_code }); saveStore(store); return response({ message: 'Profile updated' }); }
    if (resource === 'delete_profile' && user) { store.users = store.users.filter((item) => item.id !== user.id); saveStore(store); return response({ message: 'Profile deleted' }); }
    if (resource === 'map_lots') return response(store.lots.map((lot) => ({ ...lot, reserved_slots: store.sessions.filter((session) => session.end_time === null && store.slots.find((slot) => slot.id === session.slot_id)?.lot_id === lot.id).length, available_slots: store.slots.filter((slot) => slot.lot_id === lot.id && slot.is_active && !store.sessions.some((session) => session.slot_id === slot.id && session.end_time === null)).length })));
    if (resource === 'parking_status' && user?.parking) { const lot = store.lots.find((item) => item.id === user.parking?.lot_id); return response({ parking: lot ? { lot_id: lot.id, lot_name: lot.name, price_first_3h: lot.price_first_3h, price_per_extra_hour: lot.price_per_extra_hour, id: user.parking.session_id, start_time: user.parking.start_time, price: price(lot, user.parking.start_time) } : null }); }
    if (resource === 'parking_status') return response({ parking: null });
    if (resource === 'parking_start' && user) {
        if (user.parking) return error('You already have active parking', 409); const lot = store.lots.find((item) => item.id === Number(body.lot_id)); const slot = store.slots.find((item) => item.lot_id === lot?.id && item.is_active && !store.sessions.some((session) => session.slot_id === item.id && session.end_time === null)); if (!lot) return error('Lot not found', 404); if (!slot) return error('No free slots available', 409);
        const session: LocalSession = { id: store.nextSessionId++, user_id: user.id, slot_id: slot.id, start_time: now(), end_time: null, price_charged: null, status: 'open' }; store.sessions.push(session); user.parking = { session_id: session.id, lot_id: lot.id, slot_id: slot.id, slot_number: slot.slot_number, start_time: session.start_time }; lot.parking.push(session.id); saveStore(store); return response({ parking_id: session.id, lot_id: lot.id, start_time: session.start_time, slot_id: slot.id, slot_number: slot.slot_number, slot_name: slot.name }, 201);
    }
    if (resource === 'parking_cancel' && user?.parking) { const parking = user.parking; store.sessions = store.sessions.filter((session) => session.id !== parking.session_id); const lot = store.lots.find((item) => item.id === parking.lot_id); if (lot) lot.parking = lot.parking.filter((id) => id !== parking.session_id); user.parking = null; saveStore(store); return response({ message: 'Parking cancelled' }); }
    if (resource === 'parking_cancel') return error('No active parking', 404);
    if (resource === 'parking_stop' && user?.parking) { const parking = user.parking; const session = store.sessions.find((item) => item.id === parking.session_id); const lot = store.lots.find((item) => item.id === parking.lot_id); if (!session || !lot) return error('No active parking', 404); session.end_time = now(); session.price_charged = price(lot, session.start_time); user.parking = null; lot.parking = lot.parking.filter((id) => id !== session.id); saveStore(store); return response({ price_charged: session.price_charged, lot_name: lot.name, slot: `Slot ${parking.slot_number}`, duration_minutes: Math.round((Date.now() - Date.parse(session.start_time)) / 60000) }); }
    if (resource === 'parking_stop') return error('No active parking', 404);
    if (resource === 'payments' && user) return response(store.sessions.filter((session) => session.user_id === user.id && session.end_time && session.status === (url.searchParams.get('status') ?? 'open')).map((session) => ({ id: session.id, lot_name: store.lots.find((lot) => lot.id === store.slots.find((slot) => slot.id === session.slot_id)?.lot_id)?.name, start_time: session.start_time, end_time: session.end_time, price_charged: session.price_charged, status: session.status })));
    if (resource === 'payments_pay' && user) { const paid = store.sessions.filter((session) => session.user_id === user.id && session.end_time && session.status === 'open'); paid.forEach((session) => { session.status = 'paid'; }); saveStore(store); return response({ paid_count: paid.length }); }
    if (resource === 'parking_receipt' && user) { const session = store.sessions.find((item) => item.id === Number(url.searchParams.get('parking_id')) && item.user_id === user.id && item.end_time); if (!session) return error('Parking receipt not found', 404); return response({ id: session.id, start_time: session.start_time, end_time: session.end_time, price_charged: session.price_charged, duration_minutes: Math.round((Date.parse(session.end_time ?? now()) - Date.parse(session.start_time)) / 60000) }); }
    if (resource === 'lots') return response(store.lots);
    if (resource === 'slots') return response(store.slots.filter((slot) => slot.lot_id === Number(url.searchParams.get('lot_id'))));
    if (resource === 'users') return response(store.users.map((item) => ({ ...item, city: item.postal_code })));
    if (resource === 'free_slot') return response(store.slots.find((slot) => slot.lot_id === Number(url.searchParams.get('lot_id')) && slot.is_active) ?? null);
    return error('Unknown resource', 404);
}

export function installLocalApi(): void {
    const localWindow = window as WindowWithFetch;
    if (localWindow[ORIGINAL_FETCH]) return;
    localWindow[ORIGINAL_FETCH] = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const request = new Request(input, init);
        const url = new URL(request.url, window.location.href);
        if (url.pathname === '/i18n' || url.pathname.endsWith('/i18n')) {
            return response([
                { locale: 'en-GB', name: 'English', default: false },
                { locale: 'fi-FI', name: 'Suomi', default: true },
            ]);
        }
        if (url.pathname === '/api' || url.pathname.endsWith('/api')) return localApi(request);
        return localWindow[ORIGINAL_FETCH]?.(input, init) ?? fetch(input, init);
    };
}
