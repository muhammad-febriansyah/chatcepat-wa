import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { IContactRepository, CreateContactData } from '@application/interfaces/repositories/IContactRepository';
import { WhatsAppContact, ContactMetadata } from '@domain/entities/WhatsAppContact';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface ContactRow extends RowDataPacket {
  id: number;
  user_id: number;
  whatsapp_session_id: number;
  phone_number: string;
  display_name: string | null;
  push_name: string | null;
  is_business: boolean;
  is_group: boolean;
  metadata: string | object | null; // MySQL JSON columns return objects directly
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@injectable()
export class ContactRepository implements IContactRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async create(contact: CreateContactData): Promise<WhatsAppContact> {
    return await this.db.transaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO whatsapp_contacts (
          user_id, whatsapp_session_id, phone_number, display_name, push_name,
          is_business, is_group, metadata, last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          display_name = COALESCE(VALUES(display_name), display_name),
          push_name = COALESCE(VALUES(push_name), push_name),
          is_business = VALUES(is_business),
          is_group = VALUES(is_group),
          metadata = COALESCE(VALUES(metadata), metadata),
          last_message_at = COALESCE(VALUES(last_message_at), last_message_at),
          updated_at = CURRENT_TIMESTAMP`,
        [
          contact.userId,
          contact.whatsappSessionId,
          contact.phoneNumber,
          contact.displayName,
          contact.pushName,
          contact.isBusiness,
          contact.isGroup,
          contact.metadata ? JSON.stringify(contact.metadata) : null,
          contact.lastMessageAt,
        ]
      );

      // Fetch the created/updated record
      const [rows] = await connection.execute<ContactRow[]>(
        'SELECT * FROM whatsapp_contacts WHERE user_id = ? AND whatsapp_session_id = ? AND phone_number = ?',
        [contact.userId, contact.whatsappSessionId, contact.phoneNumber]
      );

      return this.mapRowToEntity(rows[0]);
    });
  }

  async createBulk(contacts: CreateContactData[]): Promise<number> {
    if (contacts.length === 0) {
      return 0;
    }

    return await this.db.transaction(async (connection) => {
      const values = contacts.map(contact => [
        contact.userId,
        contact.whatsappSessionId,
        contact.phoneNumber,
        contact.displayName,
        contact.pushName,
        contact.isBusiness,
        contact.isGroup,
        contact.metadata ? JSON.stringify(contact.metadata) : null,
        contact.lastMessageAt,
      ]);

      const placeholders = contacts.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO whatsapp_contacts (
          user_id, whatsapp_session_id, phone_number, display_name, push_name,
          is_business, is_group, metadata, last_message_at
        ) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          display_name = COALESCE(VALUES(display_name), display_name),
          push_name = COALESCE(VALUES(push_name), push_name),
          is_business = VALUES(is_business),
          is_group = VALUES(is_group),
          metadata = COALESCE(VALUES(metadata), metadata),
          last_message_at = COALESCE(VALUES(last_message_at), last_message_at),
          updated_at = CURRENT_TIMESTAMP`,
        flatValues
      );

      return result.affectedRows;
    });
  }

  async findById(id: number): Promise<WhatsAppContact | null> {
    const rows = await this.db.query<ContactRow>(
      'SELECT * FROM whatsapp_contacts WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(rows[0]);
  }

  async findByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<WhatsAppContact[]> {
    const rows = await this.db.query<ContactRow>(
      'SELECT * FROM whatsapp_contacts WHERE user_id = ? AND whatsapp_session_id = ? ORDER BY created_at DESC',
      [userId, whatsappSessionId]
    );

    return rows.map((row: ContactRow) => this.mapRowToEntity(row));
  }

  async findByUserIdAndPhoneNumber(userId: number, phoneNumber: string): Promise<WhatsAppContact | null> {
    const rows = await this.db.query<ContactRow>(
      'SELECT * FROM whatsapp_contacts WHERE user_id = ? AND phone_number = ?',
      [userId, phoneNumber]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(rows[0]);
  }

  async update(id: number, contact: Partial<WhatsAppContact>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (contact.displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(contact.displayName);
    }
    if (contact.pushName !== undefined) {
      updates.push('push_name = ?');
      values.push(contact.pushName);
    }
    if (contact.isBusiness !== undefined) {
      updates.push('is_business = ?');
      values.push(contact.isBusiness);
    }
    if (contact.isGroup !== undefined) {
      updates.push('is_group = ?');
      values.push(contact.isGroup);
    }
    if (contact.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(contact.metadata ? JSON.stringify(contact.metadata) : null);
    }
    if (contact.lastMessageAt !== undefined) {
      updates.push('last_message_at = ?');
      values.push(contact.lastMessageAt);
    }

    if (updates.length === 0) {
      return;
    }

    values.push(id);

    await this.db.execute(
      `UPDATE whatsapp_contacts SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(
      'DELETE FROM whatsapp_contacts WHERE id = ?',
      [id]
    );
  }

  async deleteByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<void> {
    await this.db.execute(
      'DELETE FROM whatsapp_contacts WHERE user_id = ? AND whatsapp_session_id = ?',
      [userId, whatsappSessionId]
    );
  }

  private mapRowToEntity(row: ContactRow): WhatsAppContact {
    // Handle metadata - MySQL JSON columns return objects directly, not strings
    let metadata: ContactMetadata | null = null;
    if (row.metadata) {
      if (typeof row.metadata === 'object') {
        // Already parsed by MySQL driver (JSON column type)
        metadata = row.metadata as unknown as ContactMetadata;
      } else if (typeof row.metadata === 'string') {
        // String that needs parsing
        try {
          metadata = JSON.parse(row.metadata);
        } catch (e) {
          console.warn(`Invalid metadata JSON for contact ${row.id}: ${row.metadata}`);
          metadata = null;
        }
      }
    }

    return new WhatsAppContact(
      row.id,
      row.user_id,
      row.whatsapp_session_id,
      row.phone_number,
      row.display_name,
      row.push_name,
      row.is_business,
      row.is_group,
      metadata,
      row.last_message_at,
      row.created_at,
      row.updated_at
    );
  }
}
