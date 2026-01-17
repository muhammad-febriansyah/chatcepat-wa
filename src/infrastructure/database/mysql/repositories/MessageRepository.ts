import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { IMessageRepository, MessageFilter, CreateMessageData } from '@application/interfaces/repositories/IMessageRepository';
import { WhatsAppMessage, MessageDirection, MessageStatus, MessageType } from '@domain/entities/WhatsAppMessage';
import type { RowDataPacket } from 'mysql2';

interface MessageRow extends RowDataPacket {
  id: number;
  whatsapp_session_id: number;
  message_id: string;
  from_number: string;
  push_name: string | null;
  to_number: string;
  direction: MessageDirection;
  type: MessageType;
  content: string | null;
  media_metadata: string | null;
  status: MessageStatus;
  is_auto_reply: number;
  auto_reply_source: string | null;
  context: string | null;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@injectable()
export class MessageRepository implements IMessageRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async findById(id: number): Promise<WhatsAppMessage | null> {
    const row = await this.db.queryOne<MessageRow>(
      'SELECT * FROM whatsapp_messages WHERE id = ?',
      [id]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async findByMessageId(messageId: string): Promise<WhatsAppMessage | null> {
    const row = await this.db.queryOne<MessageRow>(
      'SELECT * FROM whatsapp_messages WHERE message_id = ?',
      [messageId]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async findBySessionId(sessionId: number, options?: MessageFilter): Promise<WhatsAppMessage[]> {
    let query = 'SELECT * FROM whatsapp_messages WHERE whatsapp_session_id = ?';
    const params: any[] = [sessionId];

    if (options) {
      if (options.direction) {
        query += ' AND direction = ?';
        params.push(options.direction);
      }
      if (options.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }
      if (options.isAutoReply !== undefined) {
        query += ' AND is_auto_reply = ?';
        params.push(options.isAutoReply ? 1 : 0);
      }
      if (options.fromNumber) {
        query += ' AND from_number = ?';
        params.push(options.fromNumber);
      }
      if (options.toNumber) {
        query += ' AND to_number = ?';
        params.push(options.toNumber);
      }
      if (options.startDate) {
        query += ' AND created_at >= ?';
        params.push(options.startDate);
      }
      if (options.endDate) {
        query += ' AND created_at <= ?';
        params.push(options.endDate);
      }
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = await this.db.query<MessageRow>(query, params);
    return rows.map(row => this.mapToEntity(row));
  }

  async findConversation(sessionId: number, phoneNumber: string, limit: number = 50): Promise<WhatsAppMessage[]> {
    const rows = await this.db.query<MessageRow>(
      `SELECT * FROM whatsapp_messages
       WHERE whatsapp_session_id = ?
       AND (from_number = ? OR to_number = ?)
       ORDER BY created_at DESC
       LIMIT ?`,
      [sessionId, phoneNumber, phoneNumber, limit]
    );

    return rows.map(row => this.mapToEntity(row));
  }

  async create(message: CreateMessageData): Promise<WhatsAppMessage> {
    const result = await this.db.execute(
      `INSERT INTO whatsapp_messages (
        whatsapp_session_id, message_id, from_number, push_name, to_number, direction, type,
        content, media_metadata, status, is_auto_reply, auto_reply_source, context,
        sent_at, delivered_at, read_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.whatsappSessionId,
        message.messageId,
        message.fromNumber,
        message.pushName || null,
        message.toNumber,
        message.direction,
        message.type,
        message.content,
        message.mediaMetadata ? JSON.stringify(message.mediaMetadata) : null,
        message.status,
        message.isAutoReply ? 1 : 0,
        message.autoReplySource,
        message.context ? JSON.stringify(message.context) : null,
        message.sentAt,
        message.deliveredAt,
        message.readAt,
      ]
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error('Failed to create message');
    }

    return created;
  }

  async updateStatus(messageId: string, status: MessageStatus): Promise<void> {
    const updates: string[] = ['status = ?'];
    const values: any[] = [status];

    if (status === 'sent') {
      updates.push('sent_at = NOW()');
    } else if (status === 'delivered') {
      updates.push('delivered_at = NOW()');
    } else if (status === 'read') {
      updates.push('read_at = NOW()');
    }

    values.push(messageId);

    await this.db.execute(
      `UPDATE whatsapp_messages SET ${updates.join(', ')}, updated_at = NOW() WHERE message_id = ?`,
      values
    );
  }

  async countBySessionId(sessionId: number, filters?: MessageFilter): Promise<number> {
    let query = 'SELECT COUNT(*) as count FROM whatsapp_messages WHERE whatsapp_session_id = ?';
    const params: any[] = [sessionId];

    if (filters) {
      if (filters.direction) {
        query += ' AND direction = ?';
        params.push(filters.direction);
      }
      if (filters.isAutoReply !== undefined) {
        query += ' AND is_auto_reply = ?';
        params.push(filters.isAutoReply ? 1 : 0);
      }
    }

    const result = await this.db.queryOne<{ count: number }>(query, params);
    return result?.count || 0;
  }

  private mapToEntity(row: MessageRow): WhatsAppMessage {
    return new WhatsAppMessage(
      row.id,
      row.whatsapp_session_id,
      row.message_id,
      row.from_number,
      row.to_number,
      row.direction,
      row.type,
      row.content,
      row.media_metadata
        ? (typeof row.media_metadata === 'string' ? JSON.parse(row.media_metadata) : row.media_metadata)
        : null,
      row.status,
      row.is_auto_reply === 1,
      row.auto_reply_source,
      row.context
        ? (typeof row.context === 'string' ? JSON.parse(row.context) : row.context)
        : null,
      row.sent_at,
      row.delivered_at,
      row.read_at,
      row.created_at,
      row.updated_at
    );
  }
}
