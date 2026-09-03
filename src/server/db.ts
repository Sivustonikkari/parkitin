import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ServerConfig } from './config';

let pool: Pool | null = null;

export function getPool(config: ServerConfig): Pool {
    if (pool === null) {
        pool = mysql.createPool({
            host: config.database.host,
            database: config.database.name,
            user: config.database.user,
            password: config.database.password,
            charset: config.database.charset,
            waitForConnections: true,
            connectionLimit: 10,
            namedPlaceholders: false,
            decimalNumbers: false,
        });
    }
    return pool;
}

export async function withTransaction<T>(
    config: ServerConfig,
    operation: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
    const connection = await getPool(config).getConnection();
    try {
        await connection.beginTransaction();
        const result = await operation(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export type DatabaseRow = RowDataPacket & Record<string, unknown>;
export type InsertResult = ResultSetHeader;