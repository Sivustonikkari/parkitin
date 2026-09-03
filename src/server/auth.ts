import bcrypt from 'bcryptjs';
import { IncomingMessage } from 'node:http';
import { Pool } from 'mysql2/promise';
import { ServerConfig } from './config';
import { DatabaseRow } from './db';
import { getBearerToken, HttpError } from './http';

export type AccountSession = DatabaseRow & {
    user_id: number;
    email: string | null;
    status: 'pending' | 'confirmed';
    role: 'owner' | 'admin' | 'customer';
};

export async function requireApiKey(
    request: IncomingMessage,
    config: ServerConfig,
    database: Pool,
): Promise<void> {
    const key = request.headers['x-api-key'];
    const suppliedKey = Array.isArray(key) ? key[0] : key;
    if (!suppliedKey) {
        throw new HttpError(401, 'Missing X-Api-Key header');
    }

    if (config.devApiKey !== '' && suppliedKey === config.devApiKey) {
        return;
    }

    const [rows] = await database.query<DatabaseRow[]>('SELECT key_hash FROM api_keys');
    for (const row of rows) {
        if (typeof row.key_hash === 'string' && await bcrypt.compare(suppliedKey, row.key_hash)) {
            return;
        }
    }

    throw new HttpError(401, 'Invalid API key');
}

export async function requireAccountSession(
    request: IncomingMessage,
    database: Pool,
): Promise<AccountSession> {
    const token = getBearerToken(request);
    const [rows] = await database.query<AccountSession[]>(
        `SELECT s.*, a.email, a.status, a.role, a.reg_number, a.first_name,
                a.last_name, a.postal_code, a.parking
         FROM user_sessions s
         JOIN users a ON a.id = s.user_id
         WHERE s.expires_at > NOW()`,
    );

    for (const row of rows) {
        if (typeof row.token_hash === 'string' && await bcrypt.compare(token, row.token_hash)) {
            return row;
        }
    }

    throw new HttpError(401, 'Invalid or expired session');
}

export async function requireApiKeyOrAdminSession(
    request: IncomingMessage,
    config: ServerConfig,
    database: Pool,
): Promise<AccountSession | null> {
    if (request.headers['x-api-key']) {
        await requireApiKey(request, config, database);
        return null;
    }

    const session = await requireAccountSession(request, database);
    if (session.role !== 'owner' && session.role !== 'admin') {
        throw new HttpError(403, 'Forbidden');
    }
    return session;
}