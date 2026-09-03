import { Pool } from 'mysql2/promise';
import { DatabaseRow } from './db';
import { HttpError, sendJson } from './http';
import { postOfficeForPostalCode } from './postal';

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
): Promise<void> {
    if (method !== 'GET') {
        throw new HttpError(405, 'Method not allowed');
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