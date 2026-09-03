import { createReadStream, promises as fs } from 'node:fs';
import { join, normalize, extname, relative, sep } from 'node:path';
import { ServerResponse } from 'node:http';

const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8',
};

export async function serveStatic(pathname: string, response: ServerResponse): Promise<boolean> {
    const requestedPath = pathname === '/'
        ? 'index.html'
        : pathname === '/camera'
            ? 'camera/index.html'
        : pathname.endsWith('/')
            ? `${pathname.replace(/^\/+|\/$/g, '')}/index.html`
            : pathname.replace(/^\/+/, '');
    const root = process.cwd();
    const filePath = normalize(join(root, requestedPath));
    const relativePath = relative(root, filePath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || relativePath.includes(`..${sep}`)) return false;
    try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) return false;
        response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'text/html; charset=utf-8' });
        createReadStream(filePath).pipe(response);
        return true;
    } catch {
        return false;
    }
}

export async function localeMetadata(response: ServerResponse): Promise<void> {
    const files = (await fs.readdir(join(process.cwd(), 'i18n'))).filter((file) => file.endsWith('.json'));
    const locales = [];
    for (const file of files) {
        const data = JSON.parse(await fs.readFile(join(process.cwd(), 'i18n', file), 'utf8')) as Record<string, unknown>;
        if (typeof data.locale !== 'string') continue;
        locales.push({ locale: data.locale, name: data.name ?? data.locale, default: Boolean(data.default) });
    }
    const payload = JSON.stringify(locales);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
    response.end(payload);
}