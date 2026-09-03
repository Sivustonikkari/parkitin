export interface ServerConfig {
    host: string;
    port: number;
    appUrl: string;
    devApiKey: string;
    smtp: {
        host: string;
        port: number;
        user: string;
        password: string;
        from: string;
    };
    database: {
        host: string;
        name: string;
        user: string;
        password: string;
        charset: string;
    };
}

function readPort(value: string | undefined): number {
    const port = Number(value ?? '3000');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535');
    }
    return port;
}

export function loadConfig(): ServerConfig {
    return {
        host: process.env.HOST ?? '127.0.0.1',
        port: readPort(process.env.PORT),
        appUrl: required('APP_URL'),
        devApiKey: process.env.DEV_API_KEY ?? '',
        smtp: {
            host: required('SMTP_HOST'),
            port: readPort(process.env.SMTP_PORT ?? '587'),
            user: required('SMTP_USER'),
            password: required('SMTP_PASSWORD'),
            from: required('SMTP_FROM'),
        },
        database: {
            host: required('DB_HOST'),
            name: required('DB_NAME'),
            user: required('DB_USER'),
            password: process.env.DB_PASS ?? '',
            charset: process.env.DB_CHARSET ?? 'utf8mb4',
        },
    };
}

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}