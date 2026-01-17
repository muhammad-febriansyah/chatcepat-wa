import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';

export interface QRCodeResponse {
  sessionId: string;
  qrCode: string | null;
  status: string;
  expiresAt: Date | null;
  isExpired: boolean;
}

@injectable()
export class GetSessionQRCodeUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async execute(sessionId: string, userId: number): Promise<QRCodeResponse> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);

    if (!session) {
      throw new Error('Session not found or access denied');
    }

    const isExpired = session.qrExpiresAt ? session.qrExpiresAt < new Date() : true;

    return {
      sessionId: session.sessionId,
      qrCode: session.qrCode,
      status: session.status,
      expiresAt: session.qrExpiresAt,
      isExpired,
    };
  }
}
