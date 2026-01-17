import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { IGroupRepository, CreateGroupData } from '@application/interfaces/repositories/IGroupRepository';
import { WhatsAppGroup, GroupMetadata } from '@domain/entities/WhatsAppGroup';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface GroupRow extends RowDataPacket {
  id: number;
  user_id: number;
  whatsapp_session_id: number;
  group_jid: string;
  name: string;
  description: string | null;
  owner_jid: string | null;
  subject_time: Date | null;
  subject_owner_jid: string | null;
  participants_count: number;
  admins_count: number;
  is_announce: boolean;
  is_locked: boolean;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
}

@injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async create(group: CreateGroupData): Promise<WhatsAppGroup> {
    return await this.db.transaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO whatsapp_groups (
          user_id, whatsapp_session_id, group_jid, name, description,
          owner_jid, subject_time, subject_owner_jid,
          participants_count, admins_count, is_announce, is_locked, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          owner_jid = VALUES(owner_jid),
          subject_time = VALUES(subject_time),
          subject_owner_jid = VALUES(subject_owner_jid),
          participants_count = VALUES(participants_count),
          admins_count = VALUES(admins_count),
          is_announce = VALUES(is_announce),
          is_locked = VALUES(is_locked),
          metadata = VALUES(metadata),
          updated_at = CURRENT_TIMESTAMP`,
        [
          group.userId,
          group.whatsappSessionId,
          group.groupJid,
          group.name,
          group.description,
          group.ownerJid,
          group.subjectTime,
          group.subjectOwnerJid,
          group.participantsCount,
          group.adminsCount,
          group.isAnnounce,
          group.isLocked,
          group.metadata ? JSON.stringify(group.metadata) : null,
        ]
      );

      // Fetch the created/updated record
      const [rows] = await connection.execute<GroupRow[]>(
        'SELECT * FROM whatsapp_groups WHERE user_id = ? AND whatsapp_session_id = ? AND group_jid = ?',
        [group.userId, group.whatsappSessionId, group.groupJid]
      );

      return this.mapRowToEntity(rows[0]);
    });
  }

  async createBulk(groups: CreateGroupData[]): Promise<number> {
    if (groups.length === 0) {
      return 0;
    }

    return await this.db.transaction(async (connection) => {
      const values = groups.map(group => [
        group.userId,
        group.whatsappSessionId,
        group.groupJid,
        group.name,
        group.description,
        group.ownerJid,
        group.subjectTime,
        group.subjectOwnerJid,
        group.participantsCount,
        group.adminsCount,
        group.isAnnounce,
        group.isLocked,
        group.metadata ? JSON.stringify(group.metadata) : null,
      ]);

      const placeholders = groups.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO whatsapp_groups (
          user_id, whatsapp_session_id, group_jid, name, description,
          owner_jid, subject_time, subject_owner_jid,
          participants_count, admins_count, is_announce, is_locked, metadata
        ) VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          owner_jid = VALUES(owner_jid),
          subject_time = VALUES(subject_time),
          subject_owner_jid = VALUES(subject_owner_jid),
          participants_count = VALUES(participants_count),
          admins_count = VALUES(admins_count),
          is_announce = VALUES(is_announce),
          is_locked = VALUES(is_locked),
          metadata = VALUES(metadata),
          updated_at = CURRENT_TIMESTAMP`,
        flatValues
      );

      return result.affectedRows;
    });
  }

  async findById(id: number): Promise<WhatsAppGroup | null> {
    const rows = await this.db.query<GroupRow>(
      'SELECT * FROM whatsapp_groups WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(rows[0]);
  }

  async findByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<WhatsAppGroup[]> {
    const rows = await this.db.query<GroupRow>(
      'SELECT * FROM whatsapp_groups WHERE user_id = ? AND whatsapp_session_id = ? ORDER BY participants_count DESC',
      [userId, whatsappSessionId]
    );

    return rows.map((row: GroupRow) => this.mapRowToEntity(row));
  }

  async findByUserIdAndGroupJid(userId: number, groupJid: string): Promise<WhatsAppGroup | null> {
    const rows = await this.db.query<GroupRow>(
      'SELECT * FROM whatsapp_groups WHERE user_id = ? AND group_jid = ?',
      [userId, groupJid]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(rows[0]);
  }

  async update(id: number, group: Partial<WhatsAppGroup>): Promise<void> {
    const updates: string[] = [];
    const values: any[] = [];

    if (group.name !== undefined) {
      updates.push('name = ?');
      values.push(group.name);
    }
    if (group.description !== undefined) {
      updates.push('description = ?');
      values.push(group.description);
    }
    if (group.ownerJid !== undefined) {
      updates.push('owner_jid = ?');
      values.push(group.ownerJid);
    }
    if (group.participantsCount !== undefined) {
      updates.push('participants_count = ?');
      values.push(group.participantsCount);
    }
    if (group.adminsCount !== undefined) {
      updates.push('admins_count = ?');
      values.push(group.adminsCount);
    }
    if (group.isAnnounce !== undefined) {
      updates.push('is_announce = ?');
      values.push(group.isAnnounce);
    }
    if (group.isLocked !== undefined) {
      updates.push('is_locked = ?');
      values.push(group.isLocked);
    }
    if (group.metadata !== undefined) {
      updates.push('metadata = ?');
      values.push(group.metadata ? JSON.stringify(group.metadata) : null);
    }

    if (updates.length === 0) {
      return;
    }

    values.push(id);

    await this.db.execute(
      `UPDATE whatsapp_groups SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(
      'DELETE FROM whatsapp_groups WHERE id = ?',
      [id]
    );
  }

  async deleteByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<void> {
    await this.db.execute(
      'DELETE FROM whatsapp_groups WHERE user_id = ? AND whatsapp_session_id = ?',
      [userId, whatsappSessionId]
    );
  }

  private mapRowToEntity(row: GroupRow): WhatsAppGroup {
    let metadata: GroupMetadata | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch (e) {
        // If parsing fails, set to null
        metadata = null;
      }
    }

    return new WhatsAppGroup(
      row.id,
      row.user_id,
      row.whatsapp_session_id,
      row.group_jid,
      row.name,
      row.description,
      row.owner_jid,
      row.subject_time,
      row.subject_owner_jid,
      row.participants_count,
      row.admins_count,
      Boolean(row.is_announce),
      Boolean(row.is_locked),
      metadata,
      row.created_at,
      row.updated_at
    );
  }
}
