import { BroadcastCampaign, BroadcastRecipient } from '@domain/entities/BroadcastCampaign';

export interface IBroadcastRepository {
  /**
   * Create a new broadcast campaign
   */
  create(campaign: BroadcastCampaign): Promise<BroadcastCampaign>;

  /**
   * Find broadcast campaign by ID
   */
  findById(id: number): Promise<BroadcastCampaign | null>;

  /**
   * Find all campaigns for a user
   */
  findByUserId(userId: number, options?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<BroadcastCampaign[]>;

  /**
   * Find all campaigns for a WhatsApp session
   */
  findBySessionId(sessionId: number): Promise<BroadcastCampaign[]>;

  /**
   * Find campaigns that are scheduled and ready to start
   */
  findScheduledCampaigns(): Promise<BroadcastCampaign[]>;

  /**
   * Update campaign status
   */
  updateStatus(id: number, status: string): Promise<void>;

  /**
   * Update campaign progress
   */
  updateProgress(
    id: number,
    sentCount: number,
    failedCount: number
  ): Promise<void>;

  /**
   * Update recipient status
   */
  updateRecipientStatus(
    campaignId: number,
    phoneNumber: string,
    status: 'sent' | 'failed' | 'skipped',
    errorMessage?: string
  ): Promise<void>;

  /**
   * Get pending recipients for a campaign
   */
  getPendingRecipients(
    campaignId: number,
    limit?: number
  ): Promise<BroadcastRecipient[]>;

  /**
   * Delete a campaign
   */
  delete(id: number): Promise<void>;

  /**
   * Get campaign statistics
   */
  getStatistics(userId: number): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalMessagesSent: number;
  }>;
}
