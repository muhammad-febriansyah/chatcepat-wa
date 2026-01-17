import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IGroupRepository } from '@application/interfaces/repositories/IGroupRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { WhatsAppGroup } from '@domain/entities/WhatsAppGroup';

@injectable()
export class GetSessionGroupsUseCase {
  constructor(
    @inject(TYPES.GroupRepository) private groupRepository: IGroupRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(userId: number, sessionId: string): Promise<WhatsAppGroup[]> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    if (!session) {
      throw new Error('Session not found or does not belong to user');
    }

    // Get groups from database
    return await this.groupRepository.findByUserIdAndSessionId(userId, session.id);
  }
}
