import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { IRateLimitRepository } from '@application/interfaces/repositories/IRateLimitRepository';
import { RateLimitState } from '@domain/entities/RateLimitState';
import type { RowDataPacket } from 'mysql2';

interface RateLimitRow extends RowDataPacket {
  id: number;
  whatsapp_session_id: number;
  messages_sent_last_hour: number;
  messages_sent_today: number;
  last_message_sent_at: Date | null;
  cooldown_until: Date | null;
  hourly_buckets: string | null;
  created_at: Date;
  updated_at: Date;
}

@injectable()
export class RateLimitRepository implements IRateLimitRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async findBySessionId(sessionId: number): Promise<RateLimitState | null> {
    const row = await this.db.queryOne<RateLimitRow>(
      'SELECT * FROM whatsapp_rate_limits WHERE whatsapp_session_id = ?',
      [sessionId]
    );

    return row ? this.mapToEntity(row) : null;
  }

  async getOrCreate(sessionId: number): Promise<RateLimitState> {
    let state = await this.findBySessionId(sessionId);

    if (!state) {
      // Create new rate limit state
      await this.db.execute(
        `INSERT INTO whatsapp_rate_limits (
          whatsapp_session_id, messages_sent_last_hour,
          messages_sent_today, last_message_sent_at, cooldown_until, hourly_buckets
        ) VALUES (?, 0, 0, NULL, NULL, NULL)`,
        [sessionId]
      );

      state = await this.findBySessionId(sessionId);
      if (!state) {
        throw new Error('Failed to create rate limit state');
      }
    }

    return state;
  }

  async incrementMessageCount(sessionId: number): Promise<void> {
    await this.db.execute(
      `UPDATE whatsapp_rate_limits
       SET messages_sent_last_hour = messages_sent_last_hour + 1,
           messages_sent_today = messages_sent_today + 1,
           last_message_sent_at = NOW(),
           updated_at = NOW()
       WHERE whatsapp_session_id = ?`,
      [sessionId]
    );
  }

  async resetHourCount(sessionId: number): Promise<void> {
    await this.db.execute(
      `UPDATE whatsapp_rate_limits
       SET messages_sent_last_hour = 0,
           updated_at = NOW()
       WHERE whatsapp_session_id = ?`,
      [sessionId]
    );
  }

  async resetDailyCount(sessionId: number): Promise<void> {
    await this.db.execute(
      `UPDATE whatsapp_rate_limits
       SET messages_sent_today = 0,
           updated_at = NOW()
       WHERE whatsapp_session_id = ?`,
      [sessionId]
    );
  }

  async setCooldown(sessionId: number, cooldownUntil: Date): Promise<void> {
    await this.db.execute(
      `UPDATE whatsapp_rate_limits
       SET cooldown_until = ?,
           updated_at = NOW()
       WHERE whatsapp_session_id = ?`,
      [cooldownUntil, sessionId]
    );
  }

  async clearCooldown(sessionId: number): Promise<void> {
    await this.db.execute(
      `UPDATE whatsapp_rate_limits
       SET cooldown_until = NULL,
           updated_at = NOW()
       WHERE whatsapp_session_id = ?`,
      [sessionId]
    );
  }

  private mapToEntity(row: RateLimitRow): RateLimitState {
    let hourlyBuckets = null;
    if (row.hourly_buckets) {
      try {
        hourlyBuckets = typeof row.hourly_buckets === 'string'
          ? JSON.parse(row.hourly_buckets)
          : row.hourly_buckets;
      } catch (e) {
        console.error('Error parsing hourly_buckets:', e);
        hourlyBuckets = null;
      }
    }

    return new RateLimitState(
      row.id,
      row.whatsapp_session_id,
      row.messages_sent_last_hour,
      row.messages_sent_today,
      row.last_message_sent_at,
      row.cooldown_until,
      hourlyBuckets,
      row.created_at,
      row.updated_at
    );
  }
}
