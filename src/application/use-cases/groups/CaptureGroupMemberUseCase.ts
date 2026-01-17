import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { RowDataPacket } from 'mysql2';

interface GroupRow extends RowDataPacket {
  id: number;
  user_id: number;
}

interface MemberRow extends RowDataPacket {
  id: number;
  phone_number: string | null;
}

@injectable()
export class CaptureGroupMemberUseCase {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  /**
   * Capture phone number from group message sender
   * Called when a message is received from a group
   */
  async execute(params: {
    sessionId: string;
    groupJid: string;
    participantJid: string;
    pushName: string | null;
  }): Promise<boolean> {
    const { sessionId, groupJid, participantJid, pushName } = params;

    // Extract phone number from participant JID
    const phoneNumber = this.extractPhoneNumber(participantJid);

    if (!phoneNumber) {
      console.log(`⏭️ CaptureGroupMember: Could not extract phone number from ${participantJid}`);
      return false;
    }

    // Check if this is a valid phone number (not LID)
    if (this.isLidFormat(participantJid)) {
      console.log(`⏭️ CaptureGroupMember: Skipping LID format ${participantJid}`);
      return false;
    }

    try {
      // Get session info
      const session = await this.db.queryOne<{ id: number; user_id: number }>(
        `SELECT id, user_id FROM whatsapp_sessions WHERE session_id = ?`,
        [sessionId]
      );

      if (!session) {
        console.log(`⏭️ CaptureGroupMember: Session not found ${sessionId}`);
        return false;
      }

      // Find the group in database
      const group = await this.db.queryOne<GroupRow>(
        `SELECT id, user_id FROM whatsapp_groups
         WHERE group_jid = ? AND whatsapp_session_id = ?`,
        [groupJid, session.id]
      );

      if (!group) {
        console.log(`⏭️ CaptureGroupMember: Group not found ${groupJid}`);
        return false;
      }

      // Check if member already exists with this phone number
      const existingMember = await this.db.queryOne<MemberRow>(
        `SELECT id, phone_number FROM whatsapp_group_members
         WHERE whatsapp_group_id = ? AND phone_number = ?`,
        [group.id, phoneNumber]
      );

      if (existingMember) {
        // Update push_name if available
        if (pushName) {
          await this.db.execute(
            `UPDATE whatsapp_group_members
             SET push_name = ?, updated_at = NOW()
             WHERE id = ?`,
            [pushName, existingMember.id]
          );
          console.log(`✏️ CaptureGroupMember: Updated push_name for ${phoneNumber} in group ${groupJid}`);
        }
        return true;
      }

      // Check if member exists with LID format (update it with phone number)
      const lidMember = await this.db.queryOne<MemberRow>(
        `SELECT id FROM whatsapp_group_members
         WHERE whatsapp_group_id = ? AND participant_jid = ? AND is_lid_format = 1`,
        [group.id, participantJid]
      );

      if (lidMember) {
        // Update LID member with actual phone number
        await this.db.execute(
          `UPDATE whatsapp_group_members
           SET phone_number = ?, push_name = ?, is_lid_format = 0, updated_at = NOW()
           WHERE id = ?`,
          [phoneNumber, pushName, lidMember.id]
        );
        console.log(`✅ CaptureGroupMember: Updated LID member with phone ${phoneNumber} in group ${groupJid}`);
        return true;
      }

      // Insert new member
      await this.db.execute(
        `INSERT INTO whatsapp_group_members
         (whatsapp_group_id, participant_jid, phone_number, push_name, is_admin, is_super_admin, is_lid_format, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, '{}', NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           phone_number = VALUES(phone_number),
           push_name = VALUES(push_name),
           is_lid_format = 0,
           updated_at = NOW()`,
        [group.id, participantJid, phoneNumber, pushName]
      );

      console.log(`✅ CaptureGroupMember: Captured phone ${phoneNumber} (${pushName || 'no name'}) from group ${groupJid}`);

      // Update group stats
      await this.updateGroupStats(group.id);

      return true;
    } catch (error) {
      console.error(`❌ CaptureGroupMember error:`, error);
      return false;
    }
  }

  private extractPhoneNumber(jid: string): string | null {
    if (!jid) return null;

    // Remove @s.whatsapp.net or @lid suffix
    let cleanJid = jid.split('@')[0];

    // Handle device suffix (e.g., 6281234567890:23 -> 6281234567890)
    if (cleanJid.includes(':')) {
      cleanJid = cleanJid.split(':')[0];
    }

    // Validate it looks like a phone number
    if (!/^\d{10,15}$/.test(cleanJid)) {
      return null;
    }

    return cleanJid;
  }

  private isLidFormat(jid: string): boolean {
    return jid.includes('@lid');
  }

  private async updateGroupStats(groupId: number): Promise<void> {
    try {
      // Count members with phone numbers
      const stats = await this.db.queryOne<{ total: number; with_phone: number }>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN phone_number IS NOT NULL THEN 1 ELSE 0 END) as with_phone
         FROM whatsapp_group_members
         WHERE whatsapp_group_id = ?`,
        [groupId]
      );

      if (stats) {
        await this.db.execute(
          `UPDATE whatsapp_groups
           SET participants_count = ?, updated_at = NOW()
           WHERE id = ?`,
          [stats.total, groupId]
        );
      }
    } catch (error) {
      console.error(`❌ Error updating group stats:`, error);
    }
  }
}
