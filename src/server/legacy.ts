import { Pool, ResultSetHeader } from 'mysql2/promise';
import { ServerConfig } from './config';
import { DatabaseRow, withTransaction } from './db';
import { HttpError, readJsonBody, sendJson } from './http';
import { IncomingMessage, ServerResponse } from 'node:http';
import { calculatePrice } from './account';

export async function handleLegacySession(
    request: IncomingMessage,
    response: ServerResponse,
    resource: string,
    config: ServerConfig,
    database: Pool,
): Promise<void> {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    const body = await readJsonBody(request);
    if (resource === 'sessions') {
        if (typeof body.reg_number !== 'string' || body.reg_number === '' || body.lot_id === undefined) {
            throw new HttpError(400, 'Missing required field: reg_number');
        }
        const regNumber = body.reg_number;
        const lotId = body.lot_id as string | number;
        const result = await withTransaction(config, async (connection) => {
            const [lots] = await connection.execute<DatabaseRow[]>('SELECT * FROM parking_lots WHERE id = ?', [lotId]);
            const lot = lots[0]; if (!lot) throw new HttpError(404, 'Lot not found');
            const [users] = await connection.execute<DatabaseRow[]>('SELECT * FROM users WHERE reg_number = ? FOR UPDATE', [regNumber]);
            let user = users[0];
            if (!user) {
                const [insert] = await connection.execute<ResultSetHeader>('INSERT INTO users (reg_number) VALUES (?)', [regNumber]);
                const [created] = await connection.execute<DatabaseRow[]>('SELECT * FROM users WHERE id = ?', [insert.insertId]); user = created[0];
            }
            const [active] = await connection.execute<DatabaseRow[]>('SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE', [user.id]);
            if (active[0]) throw new HttpError(409, 'User already has active parking');
            const [slots] = await connection.execute<DatabaseRow[]>('SELECT s.id FROM parking_slots s LEFT JOIN parking_sessions ps ON ps.slot_id = s.id AND ps.end_time IS NULL WHERE s.lot_id = ? AND s.is_active = 1 AND ps.id IS NULL ORDER BY s.slot_number LIMIT 1 FOR UPDATE', [lotId]);
            if (!slots[0]) throw new HttpError(409, 'No free slot available');
            const [insert] = await connection.execute<ResultSetHeader>('INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time) VALUES (?, ?, ?, NOW())', [slots[0].id, user.id, regNumber]);
            const [now] = await connection.query<DatabaseRow[]>('SELECT NOW() AS start_time');
            await connection.execute('UPDATE users SET parking = ? WHERE id = ?', [JSON.stringify({ lot_id: Number(lot.id), start_time: now[0].start_time, session_id: insert.insertId }), user.id]);
            const parking = typeof lot.parking === 'string' ? JSON.parse(lot.parking) as unknown : []; const list = Array.isArray(parking) ? parking : []; list.push(insert.insertId);
            await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(list), lot.id]);
            return { session_id: insert.insertId, slot_id: Number(slots[0].id) };
        });
        sendJson(response, 201, result); return;
    }
    if (body.session_id === undefined && body.slot_id === undefined) throw new HttpError(400, 'session_id or slot_id is required');
    const result = await withTransaction(config, async (connection) => {
        const sessionIdOrSlotId = body.session_id ?? body.slot_id;
        if (typeof sessionIdOrSlotId !== 'string' && typeof sessionIdOrSlotId !== 'number') throw new HttpError(400, 'session_id or slot_id is required');
        const [rows] = await connection.execute<DatabaseRow[]>(body.session_id !== undefined ? 'SELECT * FROM parking_sessions WHERE id = ?' : 'SELECT * FROM parking_sessions WHERE slot_id = ? AND end_time IS NULL', [sessionIdOrSlotId]);
        const session = rows[0]; if (!session) throw new HttpError(404, 'Active session not found');
        if (session.end_time !== null) throw new HttpError(400, 'Session already closed');
        const [lots] = await connection.execute<DatabaseRow[]>('SELECT l.* FROM parking_lots l JOIN parking_slots s ON s.lot_id = l.id WHERE s.id = ?', [session.slot_id]);
        const lot = lots[0]; const [duration] = await connection.execute<DatabaseRow[]>('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS seconds', [session.start_time]);
        const price = calculatePrice(lot, Math.max(0, Number(duration[0].seconds)));
        await connection.execute('UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?', [price, session.id]);
        await connection.execute('UPDATE users SET parking = NULL WHERE id = ?', [session.user_id]);
        const list = typeof lot.parking === 'string' ? JSON.parse(lot.parking) as unknown : []; const remaining = Array.isArray(list) ? list.map(Number).filter((id) => id !== Number(session.id)) : [];
        await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(remaining), lot.id]);
        return { session_id: Number(session.id), price_charged: price };
    });
    sendJson(response, 200, result);
}