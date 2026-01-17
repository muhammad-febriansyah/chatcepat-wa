import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';

@injectable()
export class CancelBroadcastUseCase {
  constructor(
    @inject(TYPES.BroadcastRepository) private broadcastRepository: IBroadcastRepository
  ) {}

  async execute(campaignId: number, userId: number): Promise<void> {
    const campaign = await this.broadcastRepository.findById(campaignId);

    if (!campaign) {
      throw new Error('Broadcast campaign not found');
    }

    // Verify ownership
    if (campaign.userId !== userId) {
      throw new Error('Campaign does not belong to this user');
    }

    if (!campaign.canCancel()) {
      throw new Error(`Campaign cannot be cancelled. Current status: ${campaign.status}`);
    }

    campaign.cancel();
    await this.broadcastRepository.updateStatus(campaign.id, 'cancelled');

    console.log(`🛑 Broadcast campaign cancelled: ${campaign.id} - ${campaign.name}`);
  }
}
