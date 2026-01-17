import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import { WhatsAppSession } from '@domain/entities/WhatsAppSession';
import { randomBytes } from 'crypto';

export interface CreateSessionDTO {
  userId: number;
  name: string;
  webhookUrl?: string;
  settings?: any;
}

@injectable()
export class CreateSessionUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.WhatsAppClient) private whatsAppClient: IWhatsAppClient
  ) {}

  async execute(dto: CreateSessionDTO): Promise<WhatsAppSession> {
    // Generate unique session ID
    const sessionId = this.generateSessionId(dto.userId);

    // Create session in database
    const session = await this.sessionRepository.create({
      userId: dto.userId,
      sessionId,
      phoneNumber: null,
      name: dto.name,
      status: 'qr_pending',
      qrCode: null,
      qrExpiresAt: null,
      webhookUrl: dto.webhookUrl || null,
      settings: dto.settings || null,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      isActive: true,
    });

    // Start WhatsApp session (will generate QR code)
    await this.whatsAppClient.createSession(sessionId, dto.userId, {
      onQRCode: async (sid, qr) => {
        console.log(`QR code generated for session ${sid}`);
        // Update QR code in database
        const expiresAt = new Date(Date.now() + 60000); // 60 seconds
        await this.sessionRepository.updateQRCode(sid, qr, expiresAt);
      },

      onConnected: async (sid, phoneNumber) => {
        console.log(`Session ${sid} connected with number ${phoneNumber}`);
        // Update session status
        await this.sessionRepository.update(sid, {
          status: 'connected',
          phoneNumber,
          lastConnectedAt: new Date(),
          qrCode: null,
          qrExpiresAt: null,
          isActive: true,
        });
      },

      onDisconnected: async (sid, reason) => {
        console.log(`Session ${sid} disconnected: ${reason}`);
        // Update session status
        await this.sessionRepository.update(sid, {
          status: 'disconnected',
          lastDisconnectedAt: new Date(),
          isActive: false,
          qrCode: null,
          qrExpiresAt: null,
        });
      },
    });

    return session;
  }

  private generateSessionId(userId: number): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    return `user_${userId}_${timestamp}_${random}`;
  }
}
