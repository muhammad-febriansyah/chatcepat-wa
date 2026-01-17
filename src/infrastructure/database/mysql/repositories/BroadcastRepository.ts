import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { MysqlConnection } from '../MysqlConnection';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';
import { BroadcastCampaign, BroadcastRecipient, BroadcastStatus } from '@domain/entities/BroadcastCampaign';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

@injectable()
export class BroadcastRepository implements IBroadcastRepository {
  constructor(
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async create(campaign: BroadcastCampaign): Promise<BroadcastCampaign> {
    return await this.db.transaction(async (connection) => {
      // Insert campaign
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO broadcast_campaigns (
          whatsapp_session_id, user_id, name, template, status,
          scheduled_at, total_recipients, sent_count, failed_count, pending_count,
          batch_size, batch_delay_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          campaign.whatsappSessionId,
          campaign.userId,
          campaign.name,
          JSON.stringify(campaign.template),
          campaign.status,
          campaign.scheduledAt,
          campaign.totalRecipients,
          campaign.sentCount,
          campaign.failedCount,
          campaign.pendingCount,
          campaign.batchSize,
          campaign.batchDelayMs,
        ]
      );

      const campaignId = result.insertId;

      // Insert recipients
      if (campaign.recipients.length > 0) {
        const recipientValues = campaign.recipients.map(r => [
          campaignId,
          r.phoneNumber,
          r.name || null,
          r.status,
          null,
          null,
        ]);

        await connection.query(
          `INSERT INTO broadcast_recipients (
            campaign_id, phone_number, name, status, sent_at, error_message
          ) VALUES ?`,
          [recipientValues]
        );
      }

      campaign.id = campaignId;
      return campaign;
    });
  }

  async findById(id: number): Promise<BroadcastCampaign | null> {
    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT * FROM broadcast_campaigns WHERE id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapToCampaign(rows[0]);
  }

  async findByUserId(
    userId: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
    }
  ): Promise<BroadcastCampaign[]> {
    let query = 'SELECT * FROM broadcast_campaigns WHERE user_id = ?';
    const params: any[] = [userId];

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);

      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const [rows] = await this.db.query<RowDataPacket[]>(query, params);

    return Promise.all(rows.map(row => this.mapToCampaign(row)));
  }

  async findBySessionId(sessionId: number): Promise<BroadcastCampaign[]> {
    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT * FROM broadcast_campaigns WHERE whatsapp_session_id = ? ORDER BY created_at DESC`,
      [sessionId]
    );

    return Promise.all(rows.map(row => this.mapToCampaign(row)));
  }

  async findScheduledCampaigns(): Promise<BroadcastCampaign[]> {
    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT * FROM broadcast_campaigns
       WHERE status = 'scheduled' AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC`
    );

    return Promise.all(rows.map(row => this.mapToCampaign(row)));
  }

  async updateStatus(id: number, status: string): Promise<void> {
    const updates: any = { status };

    if (status === 'processing') {
      updates.started_at = new Date();
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completed_at = new Date();
    }

    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');

    await this.db.query(
      `UPDATE broadcast_campaigns SET ${setClause}, updated_at = NOW() WHERE id = ?`,
      [...Object.values(updates), id]
    );
  }

  async updateProgress(
    id: number,
    sentCount: number,
    failedCount: number
  ): Promise<void> {
    await this.db.query(
      `UPDATE broadcast_campaigns
       SET sent_count = ?, failed_count = ?, pending_count = total_recipients - ? - ?, updated_at = NOW()
       WHERE id = ?`,
      [sentCount, failedCount, sentCount, failedCount, id]
    );
  }

  async updateRecipientStatus(
    campaignId: number,
    phoneNumber: string,
    status: 'sent' | 'failed' | 'skipped',
    errorMessage?: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE broadcast_recipients
       SET status = ?, sent_at = IF(? = 'sent', NOW(), sent_at), error_message = ?
       WHERE campaign_id = ? AND phone_number = ?`,
      [status, status, errorMessage || null, campaignId, phoneNumber]
    );
  }

  async getPendingRecipients(
    campaignId: number,
    limit?: number
  ): Promise<BroadcastRecipient[]> {
    let query = `SELECT * FROM broadcast_recipients WHERE campaign_id = ? AND status = 'pending'`;
    const params: any[] = [campaignId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const [rows] = await this.db.query<RowDataPacket[]>(query, params);

    return rows.map(row => ({
      phoneNumber: row.phone_number,
      name: row.name,
      status: row.status,
      sentAt: row.sent_at,
      errorMessage: row.error_message,
    }));
  }

  async delete(id: number): Promise<void> {
    await this.db.transaction(async (connection) => {
      await connection.execute('DELETE FROM broadcast_recipients WHERE campaign_id = ?', [id]);
      await connection.execute('DELETE FROM broadcast_campaigns WHERE id = ?', [id]);
    });
  }

  async getStatistics(userId: number): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalMessagesSent: number;
  }> {
    const [rows] = await this.db.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) as total_campaigns,
        SUM(CASE WHEN status IN ('draft', 'scheduled', 'processing') THEN 1 ELSE 0 END) as active_campaigns,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_campaigns,
        SUM(sent_count) as total_messages_sent
       FROM broadcast_campaigns
       WHERE user_id = ?`,
      [userId]
    );

    const stats = rows[0];

    return {
      totalCampaigns: stats.total_campaigns || 0,
      activeCampaigns: stats.active_campaigns || 0,
      completedCampaigns: stats.completed_campaigns || 0,
      totalMessagesSent: stats.total_messages_sent || 0,
    };
  }

  private async mapToCampaign(row: RowDataPacket): Promise<BroadcastCampaign> {
    // Get recipients
    const [recipients] = await this.db.query<RowDataPacket[]>(
      `SELECT * FROM broadcast_recipients WHERE campaign_id = ?`,
      [row.id]
    );

    const recipientsList: BroadcastRecipient[] = recipients.map(r => ({
      phoneNumber: r.phone_number,
      name: r.name,
      status: r.status,
      sentAt: r.sent_at,
      errorMessage: r.error_message,
    }));

    return new BroadcastCampaign(
      row.id,
      row.whatsapp_session_id,
      row.user_id,
      row.name,
      JSON.parse(row.template),
      recipientsList,
      row.status as BroadcastStatus,
      row.scheduled_at,
      row.started_at,
      row.completed_at,
      row.total_recipients,
      row.sent_count,
      row.failed_count,
      row.pending_count,
      row.batch_size,
      row.batch_delay_ms,
      row.created_at,
      row.updated_at
    );
  }
}
