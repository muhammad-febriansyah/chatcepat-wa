import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { WhatsAppSession } from '@domain/entities/WhatsAppSession';

export interface GetUserSessionsOptions {
  activeOnly?: boolean;
}

@injectable()
export class GetUserSessionsUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(userId: number, options?: GetUserSessionsOptions): Promise<WhatsAppSession[]> {
    if (options?.activeOnly) {
      return await this.sessionRepository.findActiveByUserId(userId);
    }

    return await this.sessionRepository.findByUserId(userId);
  }
}
