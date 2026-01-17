import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { RowDataPacket } from 'mysql2';

export interface ScrapingHistory {
  id: number;
  userId: number;
  whatsappSessionId: number;
  totalScraped: number;
  status: 'in_progress' | 'completed' | 'failed';
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface ScrapingStatus {
  canScrape: boolean;
  reason?: string;
  remainingScrapesToday: number;
  nextAvailableAt?: Date;
}

interface ScrapingHistoryRow extends RowDataPacket {
  id: number;
  user_id: number;
  whatsapp_session_id: number;
  total_scraped: number;
  status: 'in_progress' | 'completed' | 'failed';
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
}

@injectable()
export class GetScrapingHistoryUseCase {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async execute(userId: number): Promise<ScrapingHistory[]> {
    const rows = await this.db.query<ScrapingHistoryRow>(
      `SELECT * FROM scraping_logs
       WHERE user_id = ?
       ORDER BY started_at DESC
       LIMIT 50`,
      [userId]
    );

    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      whatsappSessionId: row.whatsapp_session_id,
      totalScraped: row.total_scraped,
      status: row.status,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  }

  async getStatus(userId: number, sessionId: number): Promise<ScrapingStatus> {
    const { scrapingConfig } = await import('@shared/config/scraping');

    // Check cooldown
    const lastScrape = await this.db.queryOne<ScrapingHistoryRow>(
      `SELECT started_at FROM scraping_logs
       WHERE user_id = ? AND whatsapp_session_id = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT 1`,
      [userId, sessionId]
    );

    if (lastScrape) {
      const timeSinceLastScrape = Date.now() - new Date(lastScrape.started_at).getTime();
      const cooldownMs = scrapingConfig.rateLimit.cooldownBetweenScrapes;

      if (timeSinceLastScrape < cooldownMs) {
        const nextAvailableAt = new Date(new Date(lastScrape.started_at).getTime() + cooldownMs);
        return {
          canScrape: false,
          reason: 'Cooldown period active',
          remainingScrapesToday: 0,
          nextAvailableAt,
        };
      }
    }

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM scraping_logs
       WHERE user_id = ? AND status = 'completed' AND started_at >= ?`,
      [userId, today]
    );

    const scrapesUsed = count?.count || 0;
    const remainingScrapesToday = scrapingConfig.rateLimit.maxScrapesPerDay - scrapesUsed;

    if (remainingScrapesToday <= 0) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return {
        canScrape: false,
        reason: 'Daily limit reached',
        remainingScrapesToday: 0,
        nextAvailableAt: tomorrow,
      };
    }

    return {
      canScrape: true,
      remainingScrapesToday,
    };
  }
}
