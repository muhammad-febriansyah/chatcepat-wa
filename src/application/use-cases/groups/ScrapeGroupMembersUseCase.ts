import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { RowDataPacket } from 'mysql2';

export interface GroupMember {
  participantJid: string;
  phoneNumber: string | null;
  displayName: string | null;
  pushName: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLidFormat: boolean;
}

export interface ScrapeGroupMembersResult {
  groupId: number;
  groupName: string;
  totalMembers: number;
  totalSaved: number;
  totalWithPhone: number;
  members: GroupMember[];
}

interface GroupRow extends RowDataPacket {
  id: number;
  group_jid: string;
  name: string;
  whatsapp_session_id: number;
}

interface SessionRow extends RowDataPacket {
  session_id: string;
}

@injectable()
export class ScrapeGroupMembersUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.WhatsAppClient) private whatsappClient: IWhatsAppClient,
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async execute(userId: number, groupId: number): Promise<ScrapeGroupMembersResult> {
    // Get group from database
    const group = await this.db.queryOne<GroupRow>(
      `SELECT id, group_jid, name, whatsapp_session_id
       FROM whatsapp_groups
       WHERE id = ? AND user_id = ?`,
      [groupId, userId]
    );

    if (!group) {
      throw new Error('Grup tidak ditemukan atau bukan milik Anda');
    }

    // Get session
    const sessionRow = await this.db.queryOne<SessionRow>(
      `SELECT session_id FROM whatsapp_sessions WHERE id = ?`,
      [group.whatsapp_session_id]
    );

    if (!sessionRow) {
      throw new Error('Session tidak ditemukan');
    }

    // Get WhatsApp socket
    const socket = this.whatsappClient.getSession(sessionRow.session_id);
    if (!socket || !socket.user) {
      throw new Error('Session WhatsApp tidak terhubung. Silakan hubungkan ulang session.');
    }

    console.log(`🔍 Scraping members for group: ${group.name} (${group.group_jid})`);

    // Fetch group metadata with participants
    const groupMetadata = await socket.groupMetadata(group.group_jid);

    if (!groupMetadata || !groupMetadata.participants) {
      throw new Error('Gagal mengambil data peserta grup');
    }

    console.log(`📊 Found ${groupMetadata.participants.length} participants`);

    const members: GroupMember[] = [];
    const lidToResolve: string[] = [];

    // First pass: identify LIDs
    for (const participant of groupMetadata.participants) {
      if (participant.id.includes('@lid')) {
        lidToResolve.push(participant.id);
      }
    }

    console.log(`📋 Found ${lidToResolve.length} LIDs to resolve`);

    // Try to resolve LIDs to phone numbers
    const lidToPhoneMap: Map<string, string> = new Map();

    if (lidToResolve.length > 0) {
      try {
        const batchSize = 50;
        for (let i = 0; i < lidToResolve.length; i += batchSize) {
          const batch = lidToResolve.slice(i, i + batchSize);
          console.log(`🔄 Resolving LIDs batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(lidToResolve.length/batchSize)}...`);

          try {
            const result = await (socket as any).query({
              tag: 'iq',
              attrs: {
                to: '@s.whatsapp.net',
                type: 'get',
                xmlns: 'usync',
              },
              content: [{
                tag: 'usync',
                attrs: {
                  sid: `${Date.now()}`,
                  mode: 'query',
                  last: 'true',
                  index: '0',
                  context: 'interactive',
                },
                content: [{
                  tag: 'query',
                  attrs: {},
                  content: [{
                    tag: 'devices',
                    attrs: { version: '2' },
                  }],
                }, {
                  tag: 'list',
                  attrs: {},
                  content: batch.map(lid => ({
                    tag: 'user',
                    attrs: {},
                    content: [{
                      tag: 'contact',
                      attrs: {},
                      content: lid.replace('@lid', ''),
                    }],
                  })),
                }],
              }],
            });

            if (result?.content) {
              for (const item of result.content) {
                if (item.tag === 'usync' && item.content) {
                  for (const listItem of item.content) {
                    if (listItem.tag === 'list' && listItem.content) {
                      for (const user of listItem.content) {
                        if (user.tag === 'user' && user.content) {
                          const lidNum = user.attrs?.jid?.replace('@lid', '') || '';
                          for (const contact of user.content) {
                            if (contact.tag === 'contact' && contact.attrs?.type === 'in') {
                              const phoneJid = contact.content?.toString() || '';
                              if (phoneJid && phoneJid.includes('@s.whatsapp.net')) {
                                const lid = `${lidNum}@lid`;
                                lidToPhoneMap.set(lid, phoneJid);
                                console.log(`  ✅ Resolved: ${lid} -> ${phoneJid}`);
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (queryError) {
            console.log(`⚠️ Could not resolve LIDs via usync: ${queryError}`);
          }

          if (i + batchSize < lidToResolve.length) {
            await this.sleep(1000);
          }
        }
      } catch (e) {
        console.log(`⚠️ LID resolution failed: ${e}`);
      }
    }

    console.log(`✅ Resolved ${lidToPhoneMap.size} LIDs to phone numbers`);

    // Process all participants
    for (const participant of groupMetadata.participants) {
      let phoneNumber: string | null = null;
      let isLidFormat = false;

      if (participant.id.includes('@lid')) {
        const resolvedJid = lidToPhoneMap.get(participant.id);
        if (resolvedJid) {
          phoneNumber = this.cleanPhoneNumber(resolvedJid);
        }
        isLidFormat = true;
      } else if (participant.id.includes('@s.whatsapp.net')) {
        phoneNumber = this.cleanPhoneNumber(participant.id);
      }

      // Try to get contact info
      let displayName: string | null = null;
      let pushName: string | null = null;

      try {
        const contactInfo = socket.store?.contacts?.[participant.id];
        if (contactInfo) {
          displayName = contactInfo.name || null;
          pushName = contactInfo.notify || null;
        }
      } catch (e) {
        // Ignore
      }

      const isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
      const isSuperAdmin = participant.admin === 'superadmin';

      members.push({
        participantJid: participant.id,
        phoneNumber,
        displayName,
        pushName,
        isAdmin,
        isSuperAdmin,
        isLidFormat,
      });
    }

    // Save to database
    const totalSaved = await this.saveMembersToDatabase(group.id, members);
    const totalWithPhone = members.filter(m => m.phoneNumber !== null).length;

    // Update group participants count
    await this.db.execute(
      `UPDATE whatsapp_groups SET participants_count = ?, admins_count = ? WHERE id = ?`,
      [members.length, members.filter(m => m.isAdmin).length, group.id]
    );

    console.log(`✅ Saved ${totalSaved} members, ${totalWithPhone} with phone numbers`);

    return {
      groupId: group.id,
      groupName: group.name,
      totalMembers: members.length,
      totalSaved,
      totalWithPhone,
      members,
    };
  }

  private async saveMembersToDatabase(groupId: number, members: GroupMember[]): Promise<number> {
    if (members.length === 0) return 0;

    // Delete existing members first
    await this.db.execute(
      `DELETE FROM whatsapp_group_members WHERE whatsapp_group_id = ?`,
      [groupId]
    );

    // Insert new members
    const values: any[] = [];
    const placeholders: string[] = [];

    for (const member of members) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())');
      values.push(
        groupId,
        member.participantJid,
        member.phoneNumber,
        member.displayName,
        member.pushName,
        member.isAdmin ? 1 : 0,
        member.isSuperAdmin ? 1 : 0,
        member.isLidFormat ? 1 : 0,
        JSON.stringify({})
      );
    }

    const query = `
      INSERT INTO whatsapp_group_members
      (whatsapp_group_id, participant_jid, phone_number, display_name, push_name, is_admin, is_super_admin, is_lid_format, metadata, created_at, updated_at)
      VALUES ${placeholders.join(', ')}
    `;

    await this.db.execute(query, values);
    return members.length;
  }

  private cleanPhoneNumber(jid: string): string | null {
    if (!jid.endsWith('@s.whatsapp.net')) return null;

    let cleanJid = jid;
    if (jid.includes(':')) {
      cleanJid = jid.split(':')[0] + '@s.whatsapp.net';
    }

    const match = cleanJid.match(/^(\d+)@s\.whatsapp\.net$/);
    if (!match) return null;

    const phoneNumber = match[1];
    if (phoneNumber.length < 10 || phoneNumber.length > 15) return null;

    return phoneNumber;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
