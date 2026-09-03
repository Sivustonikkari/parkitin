import { Pool } from 'mysql2/promise';
import { DatabaseRow } from './db';
import { HttpError, sendJson } from './http';
import { postOfficeForPostalCode } from './postal';
import { IncomingMessage } from 'node:http';
import { ResultSetHeader } from 'mysql2/promise';

function enrichUser(user: DatabaseRow): DatabaseRow {
    return {
        ...user,
        city: user.postal_code === null || user.postal_code === undefined
            ? null
            : postOfficeForPostalCode(String(user.postal_code)),
    };
}

export async function handleUsers(
    method: string | undefined,
    response: import('node:http').ServerResponse,
    url: URL,
    database: Pool,
    actor: { role: string } | null = null,
    request?: IncomingMessage,
): Promise<void> {
    if (method !== 'GET') {
        if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE') throw new HttpError(405, 'Method not allowed');
        if (!request) throw new HttpError(500, 'Request unavailable');
        if (method === 'DELETE') {
            const id = url.searchParams.get('id'); if (!id) throw new HttpError(400, 'id is required');
            const [target] = await database.execute<DatabaseRow[]>('SELECT role FROM users WHERE id = ?', [id]);
            if (!target[0]) throw new HttpError(404, 'User not found');
            checkPermission(actor, String(target[0].role));
            await database.execute<ResultSetHeader>('DELETE FROM users WHERE id = ?', [id]); sendJson(response, 200, { message: 'User deleted' }); return;
        }
        const data = await (await import('./http')).readJsonBody(request);
        for (const field of ['reg_number', 'email', 'first_name', 'last_name', 'postal_code', 'role', 'status']) if (typeof data[field] !== 'string' || data[field] === '') throw new HttpError(400, `Missing required field: ${field}`);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email as string)) throw new HttpError(400, 'Invalid email');
        if (!/^\d{5}$/.test(data.postal_code as string)) throw new HttpError(400, 'Invalid postal code');
        if (!['owner', 'admin', 'customer'].includes(data.role as string)) throw new HttpError(400, 'Invalid role');
        if (!['pending', 'confirmed'].includes(data.status as string)) throw new HttpError(400, 'Invalid status');
        checkPermission(actor, data.role as string);
        try {
            if (method === 'POST') {
                const [result] = await database.execute<ResultSetHeader>({ sql: 'INSERT INTO users (reg_number,email,first_name,last_name,postal_code,role,status) VALUES (?,?,?,?,?,?,?)', values: [data.reg_number as string, data.email as string, data.first_name as string, data.last_name as string, data.postal_code as string, data.role as string, data.status as string] }); sendJson(response, 201, { id: result.insertId }); return;
            }
            const id = url.searchParams.get('id'); if (!id) throw new HttpError(400, 'id is required');
            const [target] = await database.execute<DatabaseRow[]>('SELECT role FROM users WHERE id = ?', [id]); if (!target[0]) throw new HttpError(404, 'User not found'); checkPermission(actor, String(target[0].role));
            const [result] = await database.execute<ResultSetHeader>({ sql: 'UPDATE users SET reg_number=?,email=?,first_name=?,last_name=?,postal_code=?,role=?,status=? WHERE id=?', values: [data.reg_number as string, data.email as string, data.first_name as string, data.last_name as string, data.postal_code as string, data.role as string, data.status as string, id] });
            if (!result.affectedRows) throw new HttpError(404, 'User not found'); sendJson(response, 200, { message: 'User updated' }); return;
        } catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A user with this reg_number or email already exists'); throw error; }
    }

    let rows: DatabaseRow[];
    if (url.searchParams.has('id')) {
        const [result] = await database.execute<DatabaseRow[]>(
            'SELECT * FROM users WHERE id = ?',
            [url.searchParams.get('id')],
        );
        rows = result;
    } else if (url.searchParams.has('reg_number')) {
        const [result] = await database.execute<DatabaseRow[]>(
            'SELECT * FROM users WHERE reg_number = ?',
            [url.searchParams.get('reg_number')],
        );
        rows = result;
    } else {
        const [result] = await database.query<DatabaseRow[]>('SELECT * FROM users ORDER BY id');
        sendJson(response, 200, result.map(enrichUser));
        return;
    }

    if (!rows[0]) {
        throw new HttpError(404, 'User not found');
    }
    sendJson(response, 200, enrichUser(rows[0]));
}

function checkPermission(actor: { role: string } | null, targetRole: string): void {
    if (!actor || (actor.role === 'owner' && targetRole !== 'owner') || (actor.role === 'admin' && targetRole === 'customer')) return;
    throw new HttpError(403, 'Forbidden');
}