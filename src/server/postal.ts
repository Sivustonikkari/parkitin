import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let postOffices: Map<string, string> | null = null;

export function postOfficeForPostalCode(postalCode: string): string | null {
    if (postOffices === null) {
        postOffices = new Map();
        const xml = readFileSync(join(process.cwd(), 'assets', 'postitoimipaikat.xml'), 'utf8');
        for (const entry of xml.matchAll(/<toimipaikka>([\s\S]*?)<\/toimipaikka>/g)) {
            const content = entry[1];
            const code = /<postinumero>([^<]+)<\/postinumero>/.exec(content)?.[1]?.trim();
            const rawName = /<nimi>([^<]+)<\/nimi>/.exec(content)?.[1] ?? '';
            const name = rawName.split('-').map((part) => part.replace(/\s+\d+$/, '').trim()).filter(Boolean).join(' - ');
            if (code && name && !postOffices.has(code)) {
                postOffices.set(code, name);
            }
        }
    }
    return postOffices.get(postalCode) ?? null;
}