import { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'mysql2/promise';
import { ResultSetHeader } from 'mysql2/promise';
import { DatabaseRow } from './db';
import { HttpError, sendJson } from './http';
import { readJsonBody } from './http';
import { postOfficeForPostalCode } from './postal';
import { withTransaction } from './db';
import { ServerConfig } from './config';

async function geocode(address: string, postalCode: string, city: string): Promise<{ latitude: number; longitude: number }> {
    const query = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'fi', q: `${address}, ${postalCode} ${city}, Finland` });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, { headers: { 'User-Agent': 'Parkitin/1.0 (https://testinikkari.fi/parkitin)' } });
    const results = await response.json() as Array<{ lat?: string; lon?: string }>;
    if (!response.ok || !results[0]?.lat || !results[0]?.lon) throw new HttpError(400, 'Address could not be located');
    return { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
}

function slots(value: unknown): Array<{ id: number | null; name: string | null; is_active: number }> {
    if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'slots must be a non-empty array');
    return value.map((slot) => {
        if (slot === null || typeof slot !== 'object') throw new HttpError(400, 'Invalid slot');
        const item = slot as Record<string, unknown>; const name = String(item.name ?? '').trim();
        if (name.length > 100) throw new HttpError(400, 'Slot name is too long');
        return { id: typeof item.id === 'number' ? item.id : null, name: name || null, is_active: item.is_active ? 1 : 0 };
    });
}

export async function handleLots(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    database: Pool,
    config?: ServerConfig,
): Promise<void> {
    if (request.method === 'GET') {
        if (url.searchParams.has('id')) {
            const [rows] = await database.execute<DatabaseRow[]>('SELECT * FROM parking_lots WHERE id = ?', [url.searchParams.get('id')]);
            if (!rows[0]) throw new HttpError(404, 'Lot not found');
            sendJson(response, 200, rows[0]); return;
        }
        const [rows] = await database.query<DatabaseRow[]>('SELECT * FROM parking_lots ORDER BY id'); sendJson(response, 200, rows); return;
    }
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'DELETE') throw new HttpError(405, 'Method not allowed');
    if (request.method === 'DELETE') {
        const id = url.searchParams.get('id'); if (!id) throw new HttpError(400, 'id is required');
        const [result] = await database.execute<import('mysql2/promise').ResultSetHeader>('DELETE FROM parking_lots WHERE id = ?', [id]);
        if (!result.affectedRows) throw new HttpError(404, 'Lot not found'); sendJson(response, 200, { message: 'Lot deleted' }); return;
    }
    if (!config) throw new HttpError(500, 'Server configuration unavailable');
    const data = await readJsonBody(request); const required = ['name', 'address', 'postal_code', 'slots', 'price_first_3h', 'price_per_extra_hour'];
    for (const field of required) if (data[field] === undefined || data[field] === '') throw new HttpError(400, `Missing required field: ${field}`);
    const postalCode = String(data.postal_code).trim(); const city = postOfficeForPostalCode(postalCode); if (!city) throw new HttpError(400, 'Postal code not found');
    const lotSlots = slots(data.slots); if (!Number.isFinite(Number(data.price_first_3h)) || !Number.isFinite(Number(data.price_per_extra_hour))) throw new HttpError(400, 'prices must be numeric');
    const coordinates = await geocode(String(data.address), postalCode, city);
    if (request.method === 'POST') {
        const result = await withTransaction(config, async (connection) => {
            const [insert] = await connection.execute<ResultSetHeader>({ sql: 'INSERT INTO parking_lots (name,address,city,postal_code,latitude,longitude,info,capacity,price_first_3h,price_per_extra_hour) VALUES (?,?,?,?,?,?,?,?,?,?)', values: [data.name as string, data.address as string, city, postalCode, coordinates.latitude, coordinates.longitude, data.info ?? null, lotSlots.length, data.price_first_3h as string, data.price_per_extra_hour as string] });
            for (let index = 0; index < lotSlots.length; index++) await connection.execute<ResultSetHeader>('INSERT INTO parking_slots (lot_id,slot_number,name,is_active) VALUES (?,?,?,?)', [insert.insertId, index + 1, lotSlots[index].name, lotSlots[index].is_active]);
            return { id: insert.insertId };
        }); sendJson(response, 201, result); return;
    }
    const id = url.searchParams.get('id'); if (!id) throw new HttpError(400, 'id is required');
    await withTransaction(config, async (connection) => {
        const [existing] = await connection.execute<DatabaseRow[]>('SELECT ps.id,ps.slot_number,ps.name,ps.is_active,EXISTS(SELECT 1 FROM parking_sessions s WHERE s.slot_id=ps.id AND s.end_time IS NULL) reserved FROM parking_slots ps WHERE ps.lot_id=? FOR UPDATE', [id]);
        const submittedIds = lotSlots.map((slot) => slot.id).filter((slot): slot is number => slot !== null);
        for (const slot of existing) { const submitted = lotSlots.find((item) => item.id === Number(slot.id)); if (Number(slot.reserved) && (!submitted || submitted.name !== slot.name || submitted.is_active !== Number(slot.is_active) || lotSlots.indexOf(submitted) !== Number(slot.slot_number) - 1)) throw new HttpError(409, 'A reserved slot cannot be edited, deleted, or renumbered'); }
        const existingIds = existing.map((slot) => Number(slot.id));
        const deletedIds = existingIds.filter((slotId) => !submittedIds.includes(slotId));
        if (deletedIds.length) {
            const marks = deletedIds.map(() => '?').join(',');
            const [history] = await connection.execute<DatabaseRow[]>(`SELECT id FROM parking_sessions WHERE slot_id IN (${marks})`, deletedIds);
            if (history.length) throw new HttpError(409, 'A slot with parking history cannot be deleted');
            await connection.execute<ResultSetHeader>(`DELETE FROM parking_slots WHERE id IN (${marks})`, deletedIds);
        }
        await connection.execute<ResultSetHeader>({ sql: 'UPDATE parking_slots SET slot_number = slot_number + 1000000 WHERE lot_id = ?', values: [id] });
        for (let index = 0; index < lotSlots.length; index++) {
            const slot = lotSlots[index];
            if (slot.id !== null) await connection.execute<ResultSetHeader>({ sql: 'UPDATE parking_slots SET slot_number=?,name=?,is_active=? WHERE id=? AND lot_id=?', values: [index + 1, slot.name, slot.is_active, slot.id, id] });
            else await connection.execute<ResultSetHeader>({ sql: 'INSERT INTO parking_slots (lot_id,slot_number,name,is_active) VALUES (?,?,?,?)', values: [id, index + 1, slot.name, slot.is_active] });
        }
        await connection.execute<ResultSetHeader>({ sql: 'UPDATE parking_lots SET name=?,address=?,city=?,postal_code=?,latitude=?,longitude=?,info=?,capacity=?,price_first_3h=?,price_per_extra_hour=? WHERE id=?', values: [data.name as string, data.address as string, city, postalCode, coordinates.latitude, coordinates.longitude, data.info ?? null, lotSlots.length, data.price_first_3h as string, data.price_per_extra_hour as string, id] });
    }); sendJson(response, 200, { message: 'Lot updated' }); return;
}

export async function handleSlots(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    database: Pool,
): Promise<void> {
    if (request.method !== 'GET') {
        throw new HttpError(405, 'Method not allowed');
    }
    const lotId = url.searchParams.get('lot_id');
    if (!lotId) {
        throw new HttpError(400, 'lot_id is required');
    }

    let sql = `SELECT s.id, s.lot_id, s.slot_number, s.name, s.is_active,
                      (ps.id IS NOT NULL) AS occupied
               FROM parking_slots s
               LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL
               WHERE s.lot_id = ?`;
    const status = url.searchParams.get('status');
    if (status === 'free') {
        sql += ' HAVING occupied = 0';
    } else if (status === 'occupied') {
        sql += ' HAVING occupied = 1';
    }
    sql += ' ORDER BY s.slot_number';

    const [rows] = await database.execute<DatabaseRow[]>(sql, [lotId]);
    sendJson(response, 200, rows);
}

export async function handleFreeSlot(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    database: Pool,
): Promise<void> {
    if (request.method !== 'GET') {
        throw new HttpError(405, 'Method not allowed');
    }
    const lotId = url.searchParams.get('lot_id');
    if (!lotId) {
        throw new HttpError(400, 'lot_id is required');
    }

    const [rows] = await database.execute<DatabaseRow[]>(
        `SELECT s.id, s.lot_id, s.slot_number, s.name
         FROM parking_slots s
         LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL
         WHERE s.lot_id = ? AND s.is_active = 1 AND ps.id IS NULL
         ORDER BY s.slot_number LIMIT 1`,
        [lotId],
    );
    if (!rows[0]) {
        throw new HttpError(404, 'No free slot available');
    }
    sendJson(response, 200, rows[0]);
}