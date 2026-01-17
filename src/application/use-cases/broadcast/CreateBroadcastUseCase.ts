import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { BroadcastCampaign, BroadcastTemplate, BroadcastRecipient } from '@domain/entities/BroadcastCampaign';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { env } from '@shared/config/env';

export interface CreateBroadcastInput {
  userId: number;
  whatsappSessionId: number;
  name: string;
  template: BroadcastTemplate;
  recipients: Array<{
    phoneNumber: string;
    name?: string;
  }>;
  scheduledAt?: Date;
}

@injectable()
export class CreateBroadcastUseCase {
  constructor(
    @inject(TYPES.BroadcastRepository) private broadcastRepository: IBroadcastRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(input: CreateBroadcastInput): Promise<BroadcastCampaign> {
    // Validate session exists and belongs to user
    const session = await this.sessionRepository.findById(input.whatsappSessionId);

    if (!session) {
      throw new Error('WhatsApp session not found');
    }

    if (session.userId !== input.userId) {
      throw new Error('Session does not belong to this user');
    }

    if (!session.isActive) {
      throw new Error('WhatsApp session is not active');
    }

    // Validate recipients
    if (!input.recipients || input.recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    if (input.recipients.length > 10000) {
      throw new Error('Maximum 10,000 recipients per broadcast');
    }

    // Validate template
    this.validateTemplate(input.template);

    // Create broadcast recipients
    const recipients: BroadcastRecipient[] = input.recipients.map(r => ({
      phoneNumber: this.normalizePhoneNumber(r.phoneNumber),
      name: r.name,
      status: 'pending',
    }));

    // Create campaign
    const campaign = BroadcastCampaign.create({
      whatsappSessionId: input.whatsappSessionId,
      userId: input.userId,
      name: input.name,
      template: input.template,
      recipients,
      scheduledAt: input.scheduledAt,
      batchSize: env.broadcast?.batchSize || 20,
      batchDelayMs: env.broadcast?.batchDelayMs || 60000,
    });

    // Save to database
    const savedCampaign = await this.broadcastRepository.create(campaign);

    console.log(`✅ Broadcast campaign created: ${savedCampaign.id} - ${savedCampaign.name} (${savedCampaign.totalRecipients} recipients)`);

    return savedCampaign;
  }

  private validateTemplate(template: BroadcastTemplate): void {
    if (!template.type) {
      throw new Error('Template type is required');
    }

    if (!template.content || template.content.trim().length === 0) {
      throw new Error('Template content is required');
    }

    if (template.type === 'image' && !template.mediaUrl) {
      throw new Error('Media URL is required for image messages');
    }

    if (template.type === 'document' && !template.mediaUrl) {
      throw new Error('Media URL is required for document messages');
    }
  }

  private normalizePhoneNumber(phone: string): string {
    // Remove non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // If starts with 0, replace with 62 (Indonesia)
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }

    return cleaned;
  }
}
