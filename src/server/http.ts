import { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
    public constructor(public readonly statusCode: number, message: string) {
        super(message);
    }
}

export function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    response.end(payload);
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 1024 * 1024) {
            throw new HttpError(413, 'Request body too large');
        }
        chunks.push(buffer);
    }

    if (chunks.length === 0) {
        return {};
    }

    try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
    } catch {
        throw new HttpError(400, 'Invalid JSON');
    }

    throw new HttpError(400, 'Invalid JSON');
}

export function requireMethod(request: IncomingMessage, method: string): void {
    if (request.method !== method) {
        throw new HttpError(405, 'Method not allowed');
    }
}

export function requireFields(data: Record<string, unknown>, fields: string[]): void {
    for (const field of fields) {
        if (!(field in data) || data[field] === '' || data[field] === null || data[field] === undefined) {
            throw new HttpError(400, `Missing required field: ${field}`);
        }
    }
}

export function getBearerToken(request: IncomingMessage): string {
    const header = request.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
        throw new HttpError(401, 'Missing session token');
    }
    return match[1];
}