import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { SessionManager } from './SessionManager';
import type {
  IWhatsAppClient,
  SendMessageOptions,
  ConnectionEventCallbacks
} from '@application/interfaces/services/IWhatsAppClient';
import { generateWAMessageFromContent, proto } from '@whiskeysockets/baileys';

@injectable()
export class BaileysClient implements IWhatsAppClient {
  constructor(
    @inject(TYPES.SessionManager) private sessionManager: SessionManager
  ) {}

  async createSession(
    sessionId: string,
    userId: number,
    callbacks: ConnectionEventCallbacks
  ): Promise<void> {
    await this.sessionManager.createSession(sessionId, userId, callbacks);
  }

  getSession(sessionId: string): any | null {
    return this.sessionManager.getSession(sessionId);
  }

  isSessionActive(sessionId: string): boolean {
    return this.sessionManager.isSessionActive(sessionId);
  }

  isSessionConnected(sessionId: string): boolean {
    return this.sessionManager.isSessionConnected(sessionId);
  }

  getSessionState(sessionId: string): 'active' | 'inactive' | 'connecting' {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return 'inactive';

    // Check if socket is connected
    if (session.user) return 'active';

    return 'connecting';
  }

  async sendMessage(sessionId: string, options: SendMessageOptions): Promise<any> {
    const socket = this.sessionManager.getSession(sessionId);
    if (!socket) {
      throw new Error(`Session ${sessionId} not found or not connected`);
    }

    const jid = this.formatPhoneNumber(options.to);

    try {
      let result;

      // Helper to get media source (Buffer for data URL, or url object)
      const getMediaSource = (mediaUrl: string) => {
        if (mediaUrl.startsWith('data:')) {
          // Extract base64 data from data URL
          const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            return Buffer.from(matches[2], 'base64');
          }
        }
        return { url: mediaUrl };
      };

      switch (options.type) {
        case 'image':
          if (!options.mediaUrl) {
            throw new Error('Media URL is required for image messages');
          }
          result = await socket.sendMessage(jid, {
            image: getMediaSource(options.mediaUrl),
            caption: options.caption || options.content,
          });
          break;

        case 'video':
          if (!options.mediaUrl) {
            throw new Error('Media URL is required for video messages');
          }
          result = await socket.sendMessage(jid, {
            video: getMediaSource(options.mediaUrl),
            caption: options.caption || options.content,
          });
          break;

        case 'audio':
          if (!options.mediaUrl) {
            throw new Error('Media URL is required for audio messages');
          }
          result = await socket.sendMessage(jid, {
            audio: getMediaSource(options.mediaUrl),
            mimetype: options.mimetype || 'audio/mp4',
            ptt: false, // Set to true for voice note
          });
          break;

        case 'document':
          if (!options.mediaUrl) {
            throw new Error('Media URL is required for document messages');
          }
          result = await socket.sendMessage(jid, {
            document: getMediaSource(options.mediaUrl),
            mimetype: options.mimetype || 'application/octet-stream',
            caption: options.caption,
            fileName: options.filename || 'document',
          });
          break;

        case 'text':
        default:
          result = await socket.sendMessage(jid, {
            text: options.content,
          });
          break;
      }

      return result;
    } catch (error) {
      console.error(`Error sending message to ${options.to}:`, error);
      throw error;
    }
  }

  async sendTextMessage(sessionId: string, to: string, content: string): Promise<any> {
    return this.sendMessage(sessionId, { to, content, type: 'text' });
  }

  async disconnectSession(sessionId: string): Promise<void> {
    await this.sessionManager.disconnectSession(sessionId);
  }

  async logoutSession(sessionId: string): Promise<void> {
    await this.sessionManager.logoutSession(sessionId);
  }

  async loadAllSessions(userId: number, callbacks: ConnectionEventCallbacks): Promise<void> {
    // This will be implemented later when we integrate with the database
    // to load all active sessions for a user on startup
    console.log(`Loading all sessions for user ${userId} - To be implemented`);
  }

  // Helper methods

  private formatPhoneNumber(phoneNumber: string): string {
    // Remove any non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // If starts with 0, replace with country code (62 for Indonesia)
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }

    // Add @s.whatsapp.net suffix if not present
    if (!cleaned.includes('@')) {
      cleaned = `${cleaned}@s.whatsapp.net`;
    }

    return cleaned;
  }

  private isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us');
  }

  private isWhatsAppJid(jid: string): boolean {
    return jid.endsWith('@s.whatsapp.net');
  }
}
