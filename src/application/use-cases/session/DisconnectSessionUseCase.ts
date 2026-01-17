import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import path from 'path';
import fs from 'fs-extra';
import { whatsappConfig } from '@shared/config/whatsapp';

@injectable()
export class DisconnectSessionUseCase {
  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.WhatsAppClient) private whatsAppClient: IWhatsAppClient
  ) {}

  async execute(sessionId: string, userId: number, logout: boolean = true): Promise<void> {
    // Try to verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);

    if (!session) {
      // Session not found in database (might be already deleted)
      // But we should still cleanup from memory and files
      console.warn(`⚠️  Session ${sessionId} not found in database for user ${userId}, proceeding with cleanup anyway`);

      // Check if session exists in memory (active sessions)
      const isActive = this.whatsAppClient.isSessionActive(sessionId);

      if (isActive) {
        console.log(`🔌 Session ${sessionId} is active in memory, disconnecting...`);

        // Disconnect from WhatsApp
        if (logout) {
          await this.whatsAppClient.logoutSession(sessionId);
        } else {
          await this.whatsAppClient.disconnectSession(sessionId);
        }
      } else {
        console.log(`ℹ️  Session ${sessionId} is not active in memory`);
      }

      // Always cleanup session files
      await this.cleanupSessionFiles(sessionId);

      console.log(`✅ Session ${sessionId} cleanup completed (logout: ${logout}), files cleaned`);
      return;
    }

    // Session found in database, proceed normally
    console.log(`🔌 Disconnecting session ${sessionId} for user ${userId}`);

    // Disconnect from WhatsApp
    if (logout) {
      await this.whatsAppClient.logoutSession(sessionId);
    } else {
      await this.whatsAppClient.disconnectSession(sessionId);
    }

    // Update database
    try {
      await this.sessionRepository.update(sessionId, {
        status: 'disconnected',
        lastDisconnectedAt: new Date(),
        isActive: false,
      });
    } catch (error) {
      console.warn(`⚠️  Failed to update session in database (might be deleted):`, error);
    }

    // Always cleanup session files when disconnecting
    // This ensures QR code can be generated again on reconnect
    await this.cleanupSessionFiles(sessionId);

    console.log(`✅ Session ${sessionId} disconnected (logout: ${logout}), files cleaned`);
  }

  private async cleanupSessionFiles(sessionId: string): Promise<void> {
    try {
      const sessionPath = path.join(whatsappConfig.sessionStoragePath, sessionId);
      const exists = await fs.pathExists(sessionPath);

      if (exists) {
        await fs.remove(sessionPath);
        console.log(`✅ Session files cleaned up for ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Error cleaning up session files for ${sessionId}:`, error);
    }
  }
}
