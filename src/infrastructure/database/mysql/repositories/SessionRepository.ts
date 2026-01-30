import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { WhatsAppSession, SessionStatus } from '@domain/entities/WhatsAppSession';
import type { RowDataPacket } from 'mysql2';

interface SessionRow extends RowDataPacket {
  id: number;
  user_id: number;
  session_id: string;
  phone_number: string | null;
  name: string;
  status: SessionStatus;
  ai_assistant_type: string;
  qr_code: string | null;
  qr_expires_at: Date | null;
  webhook_url: string | null;
  settings: string | null;
  last_connected_at: Date | null;
  last_disconnected_at: Date | null;
  is_active: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

@injectable()
export class SessionRepository implements ISessionRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async findById(id: number): Promise<WhatsAppSession | null> {
    const row = await this.db.queryOne<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async findBySessionId(sessionId: string): Promise<WhatsAppSession | null> {
    const row = await this.db.queryOne<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE session_id = ? AND deleted_at IS NULL',
      [sessionId]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async findByUserId(userId: number): Promise<WhatsAppSession[]> {
    const rows = await this.db.query<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );

    return rows.map(row => this.mapToEntity(row));
  }

  async findActiveByUserId(userId: number): Promise<WhatsAppSession[]> {
    const rows = await this.db.query<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE user_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );

    return rows.map(row => this.mapToEntity(row));
  }

  async findAll(): Promise<WhatsAppSession[]> {
    const rows = await this.db.query<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );

    return rows.map(row => this.mapToEntity(row));
  }

  async findByUserIdAndSessionId(userId: number, sessionId: string): Promise<WhatsAppSession | null> {
    const row = await this.db.queryOne<SessionRow>(
      'SELECT * FROM whatsapp_sessions WHERE user_id = ? AND session_id = ? AND deleted_at IS NULL',
      [userId, sessionId]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async create(session: Omit<WhatsAppSession, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<WhatsAppSession> {
    const result = await this.db.execute(
      `INSERT INTO whatsapp_sessions (
        user_id, session_id, phone_number, name, status, ai_assistant_type, qr_code, qr_expires_at,
        webhook_url, settings, last_connected_at, last_disconnected_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        session.sessionId,
        session.phoneNumber,
        session.name,
        session.status,
        session.aiAssistantType || 'general',
        session.qrCode,
        session.qrExpiresAt,
        session.webhookUrl,
        session.settings ? JSON.stringify(session.settings) : null,
        session.lastConnectedAt,
        session.lastDisconnectedAt,
        session.isActive ? 1 : 0,
      ]
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error('Failed to create session');
    }

    return created;
  }

  async update(sessionId: string, data: Partial<WhatsAppSession>): Promise<WhatsAppSession> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.phoneNumber !== undefined) {
      updates.push('phone_number = ?');
      values.push(data.phoneNumber);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.aiAssistantType !== undefined) {
      updates.push('ai_assistant_type = ?');
      values.push(data.aiAssistantType);
    }
    if (data.aiConfig !== undefined) {
      updates.push('ai_config = ?');
      values.push(data.aiConfig ? JSON.stringify(data.aiConfig) : null);
    }
    if (data.qrCode !== undefined) {
      updates.push('qr_code = ?');
      values.push(data.qrCode);
    }
    if (data.qrExpiresAt !== undefined) {
      updates.push('qr_expires_at = ?');
      values.push(data.qrExpiresAt);
    }
    if (data.webhookUrl !== undefined) {
      updates.push('webhook_url = ?');
      values.push(data.webhookUrl);
    }
    if (data.settings !== undefined) {
      updates.push('settings = ?');
      values.push(data.settings ? JSON.stringify(data.settings) : null);
    }
    if (data.lastConnectedAt !== undefined) {
      updates.push('last_connected_at = ?');
      values.push(data.lastConnectedAt);
    }
    if (data.lastDisconnectedAt !== undefined) {
      updates.push('last_disconnected_at = ?');
      values.push(data.lastDisconnectedAt);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      const existing = await this.findBySessionId(sessionId);
      if (!existing) throw new Error('Session not found');
      return existing;
    }

    updates.push('updated_at = NOW()');
    values.push(sessionId);

    await this.db.execute(
      `UPDATE whatsapp_sessions SET ${updates.join(', ')} WHERE session_id = ? AND deleted_at IS NULL`,
      values
    );

    const updated = await this.findBySessionId(sessionId);
    if (!updated) {
      // Session might be soft deleted, log warning but don't throw error
      console.warn(`⚠️  Session ${sessionId} not found after update (might be deleted)`);
      // Return a minimal session object to prevent crashes
      return null as any;
    }

    return updated;
  }

  async updateStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.db.execute(
      'UPDATE whatsapp_sessions SET status = ?, updated_at = NOW() WHERE session_id = ?',
      [status, sessionId]
    );
  }

  async updateQRCode(sessionId: string, qrCode: string, expiresAt: Date): Promise<void> {
    await this.db.execute(
      'UPDATE whatsapp_sessions SET qr_code = ?, qr_expires_at = ?, status = ?, updated_at = NOW() WHERE session_id = ?',
      [qrCode, expiresAt, 'qr_pending', sessionId]
    );
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.execute(
      'DELETE FROM whatsapp_sessions WHERE session_id = ?',
      [sessionId]
    );
  }

  async softDelete(sessionId: string): Promise<void> {
    await this.db.execute(
      'UPDATE whatsapp_sessions SET deleted_at = NOW(), is_active = 0 WHERE session_id = ?',
      [sessionId]
    );
  }

  private mapToEntity(row: SessionRow): WhatsAppSession {
    let settings = null;
    if (row.settings) {
      try {
        settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
      } catch (e) {
        console.error('Error parsing settings:', e);
        settings = null;
      }
    }

    let aiConfig = null;
    if ((row as any).ai_config) {
      try {
        aiConfig = typeof (row as any).ai_config === 'string' ? JSON.parse((row as any).ai_config) : (row as any).ai_config;
      } catch (e) {
        console.error('Error parsing ai_config:', e);
        aiConfig = null;
      }
    }

    return new WhatsAppSession(
      row.id,
      row.user_id,
      row.session_id,
      row.phone_number,
      row.name,
      row.status,
      row.ai_assistant_type || 'general',
      aiConfig,
      row.qr_code,
      row.qr_expires_at,
      row.webhook_url,
      settings,
      row.last_connected_at,
      row.last_disconnected_at,
      row.is_active === 1,
      row.created_at,
      row.updated_at,
      row.deleted_at
    );
  }
}
