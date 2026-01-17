import mysql from 'mysql2/promise';
import { injectable } from 'inversify';
import { databaseConfig } from '@shared/config/database';

@injectable()
export class MysqlConnection {
  private pool: mysql.Pool | null = null;

  async getPool(): Promise<mysql.Pool> {
    if (!this.pool) {
      this.pool = mysql.createPool(databaseConfig);
      console.log('✅ MySQL connection pool created');
    }
    return this.pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const pool = await this.getPool();
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  async execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
    const pool = await this.getPool();
    const [result] = await pool.execute(sql, params);
    return result as mysql.ResultSetHeader;
  }

  async transaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('MySQL connection pool closed');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const pool = await this.getPool();
      await pool.query('SELECT 1');
      console.log('✅ MySQL connection test successful');
      return true;
    } catch (error) {
      console.error('❌ MySQL connection test failed:', error);
      return false;
    }
  }
}
