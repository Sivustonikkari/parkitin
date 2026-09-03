import { IncomingMessage, ServerResponse } from 'node:http';
import { Pool } from 'mysql2/promise';
import { DatabaseRow } from './db';
import { HttpError, sendJson } from './http';

export async function handleLots(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    database: Pool,
): Promise<void> {
    if (request.method !== 'GET') {
        throw new HttpError(405, 'Method not allowed');
    }

    if (url.searchParams.has('id')) {
        const [rows] = await database.execute<DatabaseRow[]>(
            'SELECT * FROM parking_lots WHERE id = ?',
            [url.searchParams.get('id')],
        );
        if (!rows[0]) {
            throw new HttpError(404, 'Lot not found');
        }
        sendJson(response, 200, rows[0]);
        return;
    }

    const [rows] = await database.query<DatabaseRow[]>('SELECT * FROM parking_lots ORDER BY id');
    sendJson(response, 200, rows);
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