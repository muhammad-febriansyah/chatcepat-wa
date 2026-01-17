import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IContactRepository } from '@application/interfaces/repositories/IContactRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { WhatsAppContact } from '@domain/entities/WhatsAppContact';

@injectable()
export class GetSessionContactsUseCase {
  constructor(
    @inject(TYPES.ContactRepository) private contactRepository: IContactRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(userId: number, sessionId: string): Promise<WhatsAppContact[]> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    if (!session) {
      throw new Error('Session not found or does not belong to user');
    }

    // Get contacts from database
    return await this.contactRepository.findByUserIdAndSessionId(userId, session.id);
  }
}
