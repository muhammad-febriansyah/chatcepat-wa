import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { BroadcastCampaign } from '@domain/entities/BroadcastCampaign';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';

@injectable()
export class GetBroadcastCampaignsUseCase {
  constructor(
    @inject(TYPES.BroadcastRepository) private broadcastRepository: IBroadcastRepository
  ) {}

  async execute(
    userId: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
    }
  ): Promise<BroadcastCampaign[]> {
    return await this.broadcastRepository.findByUserId(userId, options);
  }

  async getById(campaignId: number, userId: number): Promise<BroadcastCampaign | null> {
    const campaign = await this.broadcastRepository.findById(campaignId);

    if (!campaign) {
      return null;
    }

    // Verify ownership
    if (campaign.userId !== userId) {
      throw new Error('Campaign does not belong to this user');
    }

    return campaign;
  }

  async getStatistics(userId: number) {
    return await this.broadcastRepository.getStatistics(userId);
  }
}
