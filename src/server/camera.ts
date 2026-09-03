import { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'mysql2/promise';
import { DatabaseRow, withTransaction } from './db';
import { ServerConfig } from './config';
import { calculatePrice } from './account';
import { HttpError, readJsonBody, sendJson } from './http';

function normalizePlate(value: string): string {
    return value.trim().toLocaleUpperCase('fi-FI');
}

function validPlate(value: string): boolean {
    return /^[A-ZÅÄÖ]{1,3}-[0-9]{1,3}$/.test(normalizePlate(value));
}

function parkingList(value: unknown): number[] {
    if (typeof value !== 'string') return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch {
        return [];
    }
}

function userSummary(user: DatabaseRow): Record<string, unknown> {
    return {
        id: Number(user.id), reg_number: user.reg_number, email: user.email,
        first_name: user.first_name, last_name: user.last_name,
    };
}

export async function handleCamera(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    config: ServerConfig,
    database: Pool,
): Promise<void> {
    if (request.method === 'GET' && url.searchParams.get('resource') === 'camera_lots') {
        const query = url.searchParams.get('q') ?? '';
        const like = `%${query.trim()}%`;
        const [rows] = await database.execute<DatabaseRow[]>(
            'SELECT id, name, address, postal_code, city FROM parking_lots WHERE CAST(id AS CHAR) = ? OR name LIKE ? OR address LIKE ? OR city LIKE ? ORDER BY name LIMIT 25',
            [query.trim(), like, like, like],
        );
        sendJson(response, 200, rows);
        return;
    }

    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const body = await readJsonBody(request);
    const plate = typeof body.plate === 'string' ? normalizePlate(body.plate) : '';
    if (!validPlate(plate)) throw new HttpError(400, 'invalid_plate');

    if (url.searchParams.get('resource') === 'camera_start') {
        const lotId = Number(body.lot_id);
        if (!Number.isInteger(lotId) || lotId <= 0) throw new HttpError(400, 'lot_id must be numeric');
        const result = await withTransaction(config, async (connection) => {
            const [users] = await connection.execute<DatabaseRow[]>('SELECT id, email, first_name, last_name, reg_number FROM users WHERE reg_number = ? FOR UPDATE', [plate]);
            const user = users[0];
            if (!user) throw new HttpError(404, 'plate_not_found');
            const [active] = await connection.execute<DatabaseRow[]>('SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE', [user.id]);
            if (active[0]) throw new HttpError(409, 'already_parking');
            const [lots] = await connection.execute<DatabaseRow[]>('SELECT * FROM parking_lots WHERE id = ? FOR UPDATE', [lotId]);
            const lot = lots[0];
            if (!lot) throw new HttpError(404, 'lot_not_found');
            const [slots] = await connection.execute<DatabaseRow[]>('SELECT ps.id, ps.slot_number, ps.name FROM parking_slots ps LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.end_time IS NULL WHERE ps.lot_id = ? AND ps.is_active = 1 AND s.id IS NULL ORDER BY ps.slot_number LIMIT 1 FOR UPDATE', [lotId]);
            const slot = slots[0];
            if (!slot) throw new HttpError(409, 'lot_full');
            const [insert] = await connection.execute<import('mysql2/promise').ResultSetHeader>('INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time) VALUES (?, ?, ?, NOW())', [slot.id, user.id, plate]);
            const [now] = await connection.query<DatabaseRow[]>('SELECT NOW() AS start_time');
            const startTime = now[0].start_time;
            await connection.execute('UPDATE users SET parking = ? WHERE id = ?', [JSON.stringify({ lot_id: Number(lot.id), start_time: startTime, session_id: insert.insertId }), user.id]);
            const parking = parkingList(lot.parking); parking.push(insert.insertId);
            await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(parking), lot.id]);
            return { plate, user: userSummary(user), parking_id: insert.insertId, lot_id: Number(lot.id), lot_name: lot.name, lot_address: lot.address, lot_city: lot.city, slot: slot.name || `Paikka ${slot.slot_number}`, start_time: startTime };
        });
        sendJson(response, 201, result); return;
    }

    const result = await withTransaction(config, async (connection) => {
        const [users] = await connection.execute<DatabaseRow[]>('SELECT id, email, first_name, last_name, reg_number FROM users WHERE reg_number = ? FOR UPDATE', [plate]);
        const user = users[0]; if (!user) throw new HttpError(404, 'plate_not_found');
        const [rows] = await connection.execute<DatabaseRow[]>('SELECT s.*, l.id AS lot_id, l.name AS lot_name, l.parking, l.price_first_3h, l.price_per_extra_hour, ps.slot_number, ps.name AS slot_name FROM parking_sessions s JOIN parking_slots ps ON ps.id = s.slot_id JOIN parking_lots l ON l.id = ps.lot_id WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE', [user.id]);
        const parking = rows[0]; if (!parking) throw new HttpError(404, 'no_active_parking');
        const [duration] = await connection.execute<DatabaseRow[]>('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS seconds', [parking.start_time]);
        const seconds = Math.max(0, Number(duration[0].seconds)); const price = calculatePrice(parking, seconds);
        await connection.execute('UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?', [price, parking.id]);
        await connection.execute('UPDATE users SET parking = NULL WHERE id = ?', [user.id]);
        await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(parkingList(parking.parking).filter((id) => id !== Number(parking.id))), parking.lot_id]);
        return { plate, user: userSummary(user), parking_id: Number(parking.id), lot_id: Number(parking.lot_id), lot_name: parking.lot_name, slot: parking.slot_name || `Paikka ${parking.slot_number}`, start_time: parking.start_time, duration_minutes: Math.round(seconds / 60), price_charged: price };
    });
    sendJson(response, 200, result);
}