import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config';
import { AccountService } from './account';
import { getPool } from './db';
import { HttpError, readJsonBody, sendJson } from './http';
import { createLoginLinkSender } from './mail';
import { handleFreeSlot, handleLots, handleSlots } from './resources';
import { handleUsers } from './users';
import { Pool } from 'mysql2/promise';
import { requireApiKey, requireApiKeyOrAdminSession } from './auth';
import { handleCamera } from './camera';
import { handleLegacySession } from './legacy';
import { localeMetadata, serveStatic } from './static';

interface ServerContext {
    account: AccountService;
    config: ReturnType<typeof loadConfig>;
    database: Pool;
}

export async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    context?: ServerContext,
): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    try {
        if (request.method === 'GET' && requestUrl.pathname === '/health') {
            sendJson(response, 200, { status: 'ok' });
            return;
        }

        if (request.method === 'GET' && requestUrl.pathname === '/i18n') {
            await localeMetadata(response);
            return;
        }

        if (requestUrl.pathname === '/api' && context) {
            const resource = requestUrl.searchParams.get('resource');
            if (resource === 'camera_start' || resource === 'camera_stop' || resource === 'camera_lots') {
                await requireApiKey(request, context.config, context.database);
                await handleCamera(request, response, requestUrl, context.config, context.database);
                return;
            }
            if (resource === 'sessions' || resource === 'sessions_end') {
                await requireApiKey(request, context.config, context.database);
                await handleLegacySession(request, response, resource, context.config, context.database);
                return;
            }
            if (resource === 'lots' || resource === 'slots') {
                await requireApiKeyOrAdminSession(request, context.config, context.database);
                if (resource === 'lots') {
                    await handleLots(request, response, requestUrl, context.database, context.config);
                } else {
                    await handleSlots(request, response, requestUrl, context.database);
                }
                return;
            }
            if (resource === 'free_slot') {
                await requireApiKey(request, context.config, context.database);
                await handleFreeSlot(request, response, requestUrl, context.database);
                return;
            }
            if (resource === 'users') {
                const actor = await requireApiKeyOrAdminSession(request, context.config, context.database);
                await handleUsers(request.method, response, requestUrl, context.database, actor, request);
                return;
            }
            if (resource === 'login_request' || resource === 'register') {
                if (request.method !== 'POST') {
                    throw new HttpError(405, 'Method not allowed');
                }
                const body = await readJsonBody(request);
                const email = body.email;
                if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    throw new HttpError(400, 'Invalid email');
                }
                if (resource === 'login_request') {
                    sendJson(response, 200, await context.account.requestLogin(email));
                    return;
                }
                const result = await context.account.register(email);
                sendJson(response, result.statusCode, result.body);
                return;
            }
            if (resource === 'verify') {
                if (request.method !== 'GET') {
                    throw new HttpError(405, 'Method not allowed');
                }
                const token = requestUrl.searchParams.get('token');
                if (!token) {
                    throw new HttpError(400, 'Missing token');
                }
                sendJson(response, 200, await context.account.verify(token));
                return;
            }
            if (resource === 'me') {
                if (request.method !== 'GET') {
                    throw new HttpError(405, 'Method not allowed');
                }
                sendJson(response, 200, await context.account.me(request));
                return;
            }
            if (resource === 'update_profile' || resource === 'delete_profile') {
                const method = resource === 'update_profile' ? 'POST' : 'DELETE';
                if (request.method !== method) {
                    throw new HttpError(405, 'Method not allowed');
                }
                const body = resource === 'update_profile' ? await readJsonBody(request) : {};
                const result = resource === 'update_profile'
                    ? await context.account.updateProfile(request, body)
                    : await context.account.deleteProfile(request);
                sendJson(response, 200, result);
                return;
            }
            if (resource === 'map_lots') {
                if (request.method !== 'GET') {
                    throw new HttpError(405, 'Method not allowed');
                }
                sendJson(response, 200, await context.account.mapLots(request));
                return;
            }
            if (resource === 'parking_start' || resource === 'parking_cancel' || resource === 'parking_stop' || resource === 'payments_pay') {
                if (request.method !== 'POST') {
                    throw new HttpError(405, 'Method not allowed');
                }
                const body = await readJsonBody(request);
                let result: Record<string, unknown>;
                if (resource === 'parking_start') {
                    const lotId = Number(body.lot_id);
                    if (!Number.isInteger(lotId) || lotId <= 0) {
                        throw new HttpError(400, 'Missing required field: lot_id');
                    }
                    result = await context.account.startParking(request, lotId);
                } else if (resource === 'parking_cancel') {
                    result = await context.account.cancelParking(request);
                } else if (resource === 'parking_stop') {
                    result = await context.account.stopParking(request);
                } else {
                    result = await context.account.pay(request);
                }
                sendJson(response, resource === 'parking_start' ? 201 : 200, result);
                return;
            }
            if (resource === 'parking_status') {
                if (request.method !== 'GET') {
                    throw new HttpError(405, 'Method not allowed');
                }
                sendJson(response, 200, await context.account.parkingStatus(request));
                return;
            }
            if (resource === 'parking_receipt' || resource === 'payments') {
                if (request.method !== 'GET') {
                    throw new HttpError(405, 'Method not allowed');
                }
                if (resource === 'payments') {
                    sendJson(response, 200, await context.account.payments(request, requestUrl.searchParams.get('status') ?? 'open'));
                } else {
                    const parkingId = Number(requestUrl.searchParams.get('parking_id'));
                    if (!Number.isInteger(parkingId) || parkingId <= 0) {
                        throw new HttpError(400, 'parking_id is required');
                    }
                    sendJson(response, 200, await context.account.receipt(request, parkingId));
                }
                return;
            }
        }

        if (request.method === 'GET' && await serveStatic(requestUrl.pathname, response)) {
            return;
        }
        sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
        if (error instanceof HttpError) {
            sendJson(response, error.statusCode, { error: error.message });
            return;
        }
        console.error(error);
        sendJson(response, 500, { error: 'Internal server error' });
    }
}

export function createApplication() {
    const config = loadConfig();
    const database = getPool(config);
    const context: ServerContext = {
        config,
        database,
        account: new AccountService(config, database, createLoginLinkSender(config)),
    };
    return createServer((request, response) => handleRequest(request, response, context));
}

export function startServer(): void {
    const config = loadConfig();
    createApplication().listen(config.port, config.host, () => {
        console.log(`Parkitin server listening on http://${config.host}:${config.port}`);
    });
}

if (require.main === module) {
    startServer();
}