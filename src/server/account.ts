import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ServerConfig } from './config';
import { DatabaseRow, withTransaction } from './db';
import { HttpError } from './http';
import { requireAccountSession } from './auth';
import { postOfficeForPostalCode } from './postal';
import type { IncomingMessage } from 'node:http';

const LOGIN_TOKEN_TTL_MINUTES = 15;
const SESSION_TTL_MINUTES = 60;

export type LoginLinkSender = (email: string, link: string) => Promise<void>;

export function calculatePrice(lot: DatabaseRow, seconds: number): number {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const firstMinutes = Math.min(minutes, 180);
    const remainingMinutes = Math.max(0, minutes - 180);
    return firstMinutes * Number(lot.price_first_3h) + remainingMinutes * Number(lot.price_per_extra_hour);
}

interface UserRow extends RowDataPacket {
    id: number;
    email: string | null;
    role: 'owner' | 'admin' | 'customer';
}

interface LoginTokenRow extends RowDataPacket {
    id: number;
    user_id: number;
    token_hash: string;
}

export class AccountService {
    public constructor(
        private readonly config: ServerConfig,
        private readonly database: Pool,
        private readonly sendLoginLink: LoginLinkSender,
    ) {}

    public async requestLogin(email: string): Promise<Record<string, unknown>> {
        const [rows] = await this.database.execute<UserRow[]>(
            'SELECT id, email, role FROM users WHERE email = ?',
            [email],
        );
        const account = rows[0];
        if (!account) {
            return { needs_registration: true };
        }

        await this.issueLoginLink(account);
        return { message: 'Login link sent, check your email' };
    }

    public async register(email: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
        const role = await this.roleForNewUser();
        let accountId: number;

        try {
            const [result] = await this.database.execute<ResultSetHeader>(
                "INSERT INTO users (email, role, status) VALUES (?, ?, 'pending')",
                [email, role],
            );
            accountId = result.insertId;
        } catch (error) {
            if (isDuplicateKey(error)) {
                throw new HttpError(409, 'An account with this email already exists');
            }
            throw error;
        }

        await this.issueLoginLink({ id: accountId, email, role });
        return {
            statusCode: 201,
            body: { message: 'Account created, check your email to confirm' },
        };
    }

    public async verify(token: string): Promise<Record<string, unknown>> {
        const [rows] = await this.database.query<LoginTokenRow[]>(
            'SELECT id, user_id, token_hash FROM login_tokens WHERE expires_at > NOW() AND used_at IS NULL',
        );
        const matched = await this.findMatchingToken(rows, token);
        if (!matched) {
            throw new HttpError(400, 'Invalid or expired token');
        }

        return withTransaction(this.config, async (connection) => {
            const [updated] = await connection.execute<ResultSetHeader>(
                'UPDATE login_tokens SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND expires_at > NOW()',
                [matched.id],
            );
            if (updated.affectedRows !== 1) {
                throw new HttpError(400, 'Invalid or expired token');
            }

            await connection.execute(
                "UPDATE users SET status = 'confirmed' WHERE id = ? AND status = 'pending'",
                [matched.user_id],
            );

            const sessionToken = randomBytes(32).toString('hex');
            await connection.execute(
                `INSERT INTO user_sessions (user_id, token_hash, expires_at)
                 VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${SESSION_TTL_MINUTES} MINUTE))`,
                [matched.user_id, await bcrypt.hash(sessionToken, 10)],
            );

            return {
                session_token: sessionToken,
                expires_in: SESSION_TTL_MINUTES * 60,
            };
        });
    }

    public async me(request: IncomingMessage): Promise<Record<string, unknown>> {
        const session = await requireAccountSession(request, this.database);
        const hasDetails = session.reg_number !== null && session.first_name !== null
            && session.last_name !== null && session.postal_code !== null;
        return {
            email: session.email,
            status: session.status,
            role: session.role,
            reg_number: session.reg_number,
            first_name: session.first_name,
            last_name: session.last_name,
            postal_code: session.postal_code,
            city: session.postal_code === null ? null : postOfficeForPostalCode(String(session.postal_code)),
            needs_details: !hasDetails,
        };
    }

    public async updateProfile(request: IncomingMessage, data: Record<string, unknown>): Promise<Record<string, string>> {
        const session = await requireAccountSession(request, this.database);
        const fields = ['reg_number', 'first_name', 'last_name', 'postal_code'];
        for (const field of fields) {
            if (typeof data[field] !== 'string' || data[field] === '') {
                throw new HttpError(400, `Missing required field: ${field}`);
            }
        }
        const postalCode = data.postal_code as string;
        if (!/^\d{5}$/.test(postalCode)) {
            throw new HttpError(400, 'Invalid postal code');
        }
        if (postOfficeForPostalCode(postalCode) === null) {
            throw new HttpError(400, 'Postal code not found');
        }
        await this.database.execute<ResultSetHeader>(
            'UPDATE users SET reg_number = ?, first_name = ?, last_name = ?, postal_code = ? WHERE id = ?',
            [data.reg_number as string, data.first_name as string, data.last_name as string, postalCode, session.user_id],
        );
        return { message: 'Profile updated' };
    }

    public async deleteProfile(request: IncomingMessage): Promise<Record<string, string>> {
        const session = await requireAccountSession(request, this.database);
        await this.database.execute('DELETE FROM users WHERE id = ?', [session.user_id]);
        return { message: 'Profile deleted' };
    }

    public async mapLots(request: IncomingMessage): Promise<unknown[]> {
        await requireAccountSession(request, this.database);
        const [rows] = await this.database.execute<DatabaseRow[]>(
            `SELECT l.id, l.name, l.address, l.city, l.postal_code, l.latitude, l.longitude, l.info, l.capacity,
                    l.price_first_3h, l.price_per_extra_hour,
                    COUNT(s.id) AS reserved_slots,
                    COUNT(ps.id) - COUNT(s.id) AS available_slots
             FROM parking_lots l
             LEFT JOIN parking_slots ps ON ps.lot_id = l.id AND ps.is_active = 1
             LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.end_time IS NULL
             GROUP BY l.id ORDER BY l.name`,
        );
        return rows;
    }

    public async startParking(request: IncomingMessage, lotId: number): Promise<Record<string, unknown>> {
        const session = await requireAccountSession(request, this.database);
        return withTransaction(this.config, async (connection) => {
            const [active] = await connection.execute<DatabaseRow[]>(
                'SELECT id FROM parking_sessions WHERE user_id = ? AND end_time IS NULL FOR UPDATE',
                [session.user_id],
            );
            if (active[0]) {
                throw new HttpError(409, 'You already have active parking');
            }
            const [lots] = await connection.execute<DatabaseRow[]>(
                'SELECT * FROM parking_lots WHERE id = ? FOR UPDATE',
                [lotId],
            );
            const lot = lots[0];
            if (!lot) {
                throw new HttpError(404, 'Lot not found');
            }
            const [slots] = await connection.execute<DatabaseRow[]>(
                `SELECT ps.id, ps.slot_number, ps.name FROM parking_slots ps
                 LEFT JOIN parking_sessions s ON s.slot_id = ps.id AND s.end_time IS NULL
                 WHERE ps.lot_id = ? AND ps.is_active = 1 AND s.id IS NULL
                 ORDER BY ps.slot_number LIMIT 1 FOR UPDATE`,
                [lotId],
            );
            const slot = slots[0];
            if (!slot) {
                throw new HttpError(409, 'No free slots available');
            }
            const [insert] = await connection.execute<ResultSetHeader>(
                'INSERT INTO parking_sessions (slot_id, user_id, reg_number, start_time) VALUES (?, ?, ?, NOW())',
                [slot.id, session.user_id, session.reg_number],
            );
            const [nowRows] = await connection.query<DatabaseRow[]>('SELECT NOW() AS start_time');
            const startTime = nowRows[0].start_time;
            await connection.execute(
                'UPDATE users SET parking = ? WHERE id = ?',
                [JSON.stringify({ lot_id: Number(lot.id), start_time: startTime, session_id: insert.insertId }), session.user_id],
            );
            const parking = jsonArray(lot.parking);
            parking.push(insert.insertId);
            await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(parking), lot.id]);
            return {
                parking_id: insert.insertId,
                lot_id: Number(lot.id),
                start_time: startTime,
                slot_id: Number(slot.id),
                slot_number: Number(slot.slot_number),
                slot_name: slot.name,
            };
        });
    }

    public async cancelParking(request: IncomingMessage): Promise<Record<string, string>> {
        const session = await requireAccountSession(request, this.database);
        return withTransaction(this.config, async (connection) => {
            const [rows] = await connection.execute<DatabaseRow[]>(
                `SELECT s.id, l.id AS lot_id, l.parking FROM parking_sessions s
                 JOIN parking_slots ps ON ps.id = s.slot_id JOIN parking_lots l ON l.id = ps.lot_id
                 WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE`,
                [session.user_id],
            );
            const parking = rows[0];
            if (!parking) {
                throw new HttpError(404, 'No active parking');
            }
            await connection.execute('DELETE FROM parking_sessions WHERE id = ?', [parking.id]);
            await connection.execute('UPDATE users SET parking = NULL WHERE id = ?', [session.user_id]);
            const remaining = jsonArray(parking.parking).filter((id) => id !== Number(parking.id));
            await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(remaining), parking.lot_id]);
            return { message: 'Parking cancelled' };
        });
    }

    public async parkingStatus(request: IncomingMessage): Promise<Record<string, unknown>> {
        const session = await requireAccountSession(request, this.database);
        const active = parseObject(session.parking);
        if (!active || !active.lot_id || !active.start_time) {
            return { parking: null };
        }
        const activeLotId = active.lot_id as string | number;
        const activeStartTime = active.start_time as string;
        const [rows] = await this.database.execute<DatabaseRow[]>(
            'SELECT id AS lot_id, name AS lot_name, price_first_3h, price_per_extra_hour FROM parking_lots WHERE id = ?',
            [activeLotId],
        );
        if (!rows[0]) {
            return { parking: null };
        }
        const [duration] = await this.database.execute<DatabaseRow[]>('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS seconds', [activeStartTime]);
        const parking: DatabaseRow & { price: number } = { ...rows[0], id: active.session_id ?? null, start_time: activeStartTime, price: 0 };
        parking.price = calculatePrice(parking, Math.max(0, Number(duration[0].seconds)));
        return { parking };
    }

    public async stopParking(request: IncomingMessage): Promise<Record<string, unknown>> {
        const session = await requireAccountSession(request, this.database);
        return withTransaction(this.config, async (connection) => {
            const [rows] = await connection.execute<DatabaseRow[]>(
                `SELECT s.*, l.id AS lot_id, l.name AS lot_name, l.parking, l.price_first_3h, l.price_per_extra_hour,
                        ps.slot_number, ps.name AS slot_name
                 FROM parking_sessions s JOIN parking_slots ps ON ps.id = s.slot_id JOIN parking_lots l ON l.id = ps.lot_id
                 WHERE s.user_id = ? AND s.end_time IS NULL FOR UPDATE`,
                [session.user_id],
            );
            const parking = rows[0];
            if (!parking) {
                throw new HttpError(404, 'No active parking');
            }
            const [duration] = await connection.execute<DatabaseRow[]>('SELECT TIMESTAMPDIFF(SECOND, ?, NOW()) AS seconds', [parking.start_time]);
            const seconds = Math.max(0, Number(duration[0].seconds));
            const price = calculatePrice(parking, seconds);
            await connection.execute('UPDATE parking_sessions SET end_time = NOW(), price_charged = ? WHERE id = ?', [price, parking.id]);
            await connection.execute('UPDATE users SET parking = NULL WHERE id = ?', [session.user_id]);
            const remaining = jsonArray(parking.parking).filter((id) => id !== Number(parking.id));
            await connection.execute('UPDATE parking_lots SET parking = ? WHERE id = ?', [JSON.stringify(remaining), parking.lot_id]);
            return {
                price_charged: price,
                lot_name: parking.lot_name,
                slot: parking.slot_name || `Slot ${parking.slot_number}`,
                duration_minutes: Math.round(seconds / 60),
            };
        });
    }

    public async receipt(request: IncomingMessage, parkingId: number): Promise<DatabaseRow> {
        const session = await requireAccountSession(request, this.database);
        const [rows] = await this.database.execute<DatabaseRow[]>(
            'SELECT s.id, s.start_time, s.end_time, s.price_charged FROM parking_sessions s WHERE s.id = ? AND s.user_id = ? AND s.end_time IS NOT NULL',
            [parkingId, session.user_id],
        );
        const receipt = rows[0];
        if (!receipt) {
            throw new HttpError(404, 'Parking receipt not found');
        }
        const [duration] = await this.database.execute<DatabaseRow[]>('SELECT TIMESTAMPDIFF(SECOND, ?, ?) AS seconds', [receipt.start_time, receipt.end_time]);
        receipt.duration_minutes = Math.round(Math.max(0, Number(duration[0].seconds)) / 60);
        return receipt;
    }

    public async payments(request: IncomingMessage, status: string): Promise<DatabaseRow[]> {
        const session = await requireAccountSession(request, this.database);
        if (status !== 'open' && status !== 'paid') {
            throw new HttpError(400, 'Invalid status');
        }
        const [rows] = await this.database.execute<DatabaseRow[]>(
            `SELECT s.id, l.name AS lot_name, s.start_time, s.end_time, s.price_charged, s.status
             FROM parking_sessions s JOIN parking_slots ps ON ps.id = s.slot_id JOIN parking_lots l ON l.id = ps.lot_id
             WHERE s.user_id = ? AND s.end_time IS NOT NULL AND s.status = ? ORDER BY s.end_time DESC`,
            [session.user_id, status],
        );
        return rows;
    }

    public async pay(request: IncomingMessage): Promise<Record<string, number>> {
        const session = await requireAccountSession(request, this.database);
        const [result] = await this.database.execute<ResultSetHeader>(
            "UPDATE parking_sessions SET status = 'paid' WHERE user_id = ? AND end_time IS NOT NULL AND status = 'open'",
            [session.user_id],
        );
        return { paid_count: result.affectedRows };
    }

    private async roleForNewUser(): Promise<string> {
        const [rows] = await this.database.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM users');
        return Number(rows[0].count) === 0 ? 'owner' : 'customer';
    }

    private async issueLoginLink(account: UserRow | { id: number; email: string; role: string }): Promise<void> {
        if (!account.email) {
            throw new HttpError(400, 'Invalid email');
        }
        const token = randomBytes(32).toString('hex');
        await this.database.execute(
            `INSERT INTO login_tokens (user_id, token_hash, expires_at)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${LOGIN_TOKEN_TTL_MINUTES} MINUTE))`,
            [account.id, await bcrypt.hash(token, 10)],
        );
        await this.sendLoginLink(account.email, `${this.config.appUrl}?token=${encodeURIComponent(token)}`);
    }

    private async findMatchingToken(rows: LoginTokenRow[], token: string): Promise<LoginTokenRow | null> {
        for (const row of rows) {
            if (await bcrypt.compare(token, row.token_hash)) {
                return row;
            }
        }
        return null;
    }
}

function isDuplicateKey(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
        && (error as { code?: string }).code === 'ER_DUP_ENTRY';
}

function jsonArray(value: unknown): number[] {
    if (typeof value !== 'string') {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch {
        return [];
    }
}

function parseObject(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'string') {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}