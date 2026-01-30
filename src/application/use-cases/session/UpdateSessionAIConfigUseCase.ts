import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { WhatsAppSession } from '@domain/entities/WhatsAppSession';

export interface UpdateSessionAIConfigDTO {
  sessionId: string;
  userId: number;
  aiConfig: {
    creation_method?: 'ai' | 'manual';
    agent_category?: 'customer-service' | 'sales' | 'support' | 'general';
    primary_language?: 'id' | 'en' | 'both';
    communication_tone?: 'professional' | 'friendly' | 'casual' | 'formal';
    ai_description?: string; // Deskripsi dan aturan AI agent
    products?: Array<{
      name: string;
      price: number;
      description?: string;
      purchase_link?: string;
    }>;
  };
}

@injectable()
export class UpdateSessionAIConfigUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(dto: UpdateSessionAIConfigDTO): Promise<WhatsAppSession> {
    // Verify session exists and belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(
      dto.userId,
      dto.sessionId
    );

    if (!session) {
      throw new Error('Session not found or access denied');
    }

    // Merge new AI config with existing config (if any)
    const currentAiConfig = session.aiConfig || {};
    const updatedAiConfig = {
      ...currentAiConfig,
      ...dto.aiConfig,
    };

    // Update session with new AI config
    const updatedSession = await this.sessionRepository.update(dto.sessionId, {
      aiConfig: updatedAiConfig,
    });

    console.log(`✅ AI config updated for session ${dto.sessionId}`);

    return updatedSession;
  }
}
