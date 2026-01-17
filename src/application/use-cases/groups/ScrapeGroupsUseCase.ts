import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IGroupRepository, CreateGroupData } from '@application/interfaces/repositories/IGroupRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import { WhatsAppGroup, GroupMetadata } from '@domain/entities/WhatsAppGroup';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { scrapingConfig } from '@shared/config/scraping';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface ScrapeGroupsResult {
  totalScraped: number;
  totalSaved: number;
  groups: WhatsAppGroup[];
  message?: string;
}

interface ScrapingLog extends RowDataPacket {
  id: number;
  started_at: Date;
}

@injectable()
export class ScrapeGroupsUseCase {
  constructor(
    @inject(TYPES.GroupRepository) private groupRepository: IGroupRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.WhatsAppClient) private whatsappClient: IWhatsAppClient,
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async execute(userId: number, sessionId: string): Promise<ScrapeGroupsResult> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    if (!session) {
      throw new Error('Session not found or does not belong to user');
    }

    // ✅ Check database status first - more reliable than memory check
    if (!session.isConnected() || !session.isActive) {
      throw new Error(
        `Session is not connected. Current status: ${session.status}. ` +
        `Please ensure the WhatsApp session is connected before scraping groups.`
      );
    }

    // Check rate limiting - cooldown between scrapes
    await this.checkCooldown(userId, session.id, 'groups');

    // Check daily scraping limit
    await this.checkDailyLimit(userId, 'groups');

    // Get the WhatsApp socket
    const socket = this.whatsappClient.getSession(sessionId);
    if (!socket || !socket.user) {
      // ✅ More descriptive error message
      const isInMemory = this.whatsappClient.isSessionActive(sessionId);
      throw new Error(
        `WhatsApp connection not available for this session. ` +
        `Database status: ${session.status}, In memory: ${isInMemory}. ` +
        `Please try reconnecting the session or contact support if the issue persists.`
      );
    }

    // Create scraping log
    const logId = await this.createScrapingLog(userId, session.id, 'groups');

    const groupsToSave: CreateGroupData[] = [];
    let totalScraped = 0;

    try {
      console.log(`🔍 Starting group scraping for user ${userId}, session ${sessionId}`);

      // Fetch all groups
      const chats = await socket.groupFetchAllParticipating();
      const groupJids = Object.keys(chats).filter(jid => jid.endsWith('@g.us'));

      console.log(`📊 Found ${groupJids.length} groups`);

      // Process groups with delay to avoid detection
      for (let i = 0; i < groupJids.length; i++) {
        const jid = groupJids[i];
        const group = chats[jid];

        if (group && typeof group === 'object') {
          const groupData = group as any;

          // Count admins
          let adminsCount = 0;
          if (groupData.participants) {
            adminsCount = groupData.participants.filter((p: any) =>
              p.admin === 'admin' || p.admin === 'superadmin'
            ).length;
          }

          const groupInfo: CreateGroupData = {
            userId,
            whatsappSessionId: session.id,
            groupJid: jid,
            name: groupData.subject || 'Unknown Group',
            description: groupData.desc || null,
            ownerJid: groupData.owner || null,
            subjectTime: groupData.subjectTime ? new Date(groupData.subjectTime * 1000) : null,
            subjectOwnerJid: groupData.subjectOwner || null,
            participantsCount: groupData.participants?.length || 0,
            adminsCount: adminsCount,
            isAnnounce: groupData.announce || false,
            isLocked: groupData.restrict || false,
            metadata: {
              size: typeof groupData.size === 'number' ? groupData.size : null,
              creation: typeof groupData.creation === 'number' ? groupData.creation : null,
              inviteCode: typeof groupData.inviteCode === 'string' ? groupData.inviteCode : null,
            } as GroupMetadata,
          };

          groupsToSave.push(groupInfo);
          totalScraped++;

          console.log(`📁 Scraped group: ${groupInfo.name} (${groupInfo.participantsCount} members)`);
        }

        // Add random delay between groups to avoid detection
        if (i < groupJids.length - 1) {
          const delay = this.getRandomDelay(
            scrapingConfig.delays.minDelayBetweenGroups,
            scrapingConfig.delays.maxDelayBetweenGroups
          );
          console.log(`⏳ Waiting ${delay}ms before processing next group...`);
          await this.sleep(delay);
        }
      }

      console.log(`✅ Scraped ${totalScraped} groups`);

      // Save groups in batches
      const totalSaved = await this.saveGroupsInBatches(groupsToSave);

      // Update scraping log
      await this.updateScrapingLog(logId, 'completed', totalScraped);

      // Fetch saved groups to return
      const savedGroups = await this.groupRepository.findByUserIdAndSessionId(
        userId,
        session.id
      );

      return {
        totalScraped,
        totalSaved,
        groups: savedGroups,
      };
    } catch (error) {
      console.error('❌ Error scraping groups:', error);
      await this.updateScrapingLog(
        logId,
        'failed',
        totalScraped,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(`Failed to scrape groups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async checkCooldown(userId: number, sessionId: number, type: string): Promise<void> {
    const cooldownMs = scrapingConfig.rateLimit.cooldownBetweenScrapes;
    const lastScrape = await this.db.queryOne<ScrapingLog>(
      `SELECT id, started_at FROM scraping_logs
       WHERE user_id = ? AND whatsapp_session_id = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT 1`,
      [userId, sessionId]
    );

    if (lastScrape) {
      const timeSinceLastScrape = Date.now() - new Date(lastScrape.started_at).getTime();
      if (timeSinceLastScrape < cooldownMs) {
        const remainingTime = Math.ceil((cooldownMs - timeSinceLastScrape) / 1000 / 60);
        throw new Error(
          `Mohon tunggu ${remainingTime} menit sebelum scraping lagi. Ini untuk mencegah akun Anda diblokir.`
        );
      }
    }
  }

  private async checkDailyLimit(userId: number, type: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM scraping_logs
       WHERE user_id = ? AND status = 'completed' AND started_at >= ?`,
      [userId, today]
    );

    if (count && count.count >= scrapingConfig.rateLimit.maxScrapesPerDay) {
      throw new Error(
        `Batas scraping harian tercapai (${scrapingConfig.rateLimit.maxScrapesPerDay} scraping per hari). Silakan coba lagi besok.`
      );
    }
  }

  private async createScrapingLog(userId: number, sessionId: number, type: string): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO scraping_logs (user_id, whatsapp_session_id, status, started_at)
       VALUES (?, ?, 'in_progress', NOW())`,
      [userId, sessionId]
    );
    return result.insertId;
  }

  private async updateScrapingLog(
    logId: number,
    status: 'completed' | 'failed',
    totalScraped: number,
    errorMessage?: string
  ): Promise<void> {
    await this.db.execute(
      `UPDATE scraping_logs
       SET status = ?, total_scraped = ?, completed_at = NOW(), error_message = ?
       WHERE id = ?`,
      [status, totalScraped, errorMessage || null, logId]
    );
  }

  private async saveGroupsInBatches(groups: CreateGroupData[]): Promise<number> {
    if (groups.length === 0) {
      return 0;
    }

    const batchSize = scrapingConfig.batch.contactsPerBatch;
    let totalSaved = 0;

    console.log(`💾 Saving ${groups.length} groups in batches of ${batchSize}...`);

    for (let i = 0; i < groups.length; i += batchSize) {
      const batch = groups.slice(i, i + batchSize);
      const saved = await this.groupRepository.createBulk(batch);
      totalSaved += saved;

      console.log(`💾 Saved batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(groups.length / batchSize)} (${saved} groups)`);

      // Add delay between batches
      if (i + batchSize < groups.length) {
        await this.sleep(scrapingConfig.delays.batchSaveDelay);
      }
    }

    console.log(`✅ Total saved: ${totalSaved} groups`);
    return totalSaved;
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
