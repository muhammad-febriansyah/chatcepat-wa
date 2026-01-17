import { WhatsAppSession, SessionStatus } from '@domain/entities/WhatsAppSession';

export interface ISessionRepository {
  findById(id: number): Promise<WhatsAppSession | null>;
  findBySessionId(sessionId: string): Promise<WhatsAppSession | null>;
  findByUserId(userId: number): Promise<WhatsAppSession[]>;
  findActiveByUserId(userId: number): Promise<WhatsAppSession[]>;
  findAll(): Promise<WhatsAppSession[]>;
  findByUserIdAndSessionId(userId: number, sessionId: string): Promise<WhatsAppSession | null>;
  create(session: {
    userId: number;
    sessionId: string;
    phoneNumber: string | null;
    name: string;
    status: SessionStatus;
    qrCode: string | null;
    qrExpiresAt: Date | null;
    webhookUrl: string | null;
    settings: any;
    lastConnectedAt: Date | null;
    lastDisconnectedAt: Date | null;
    isActive: boolean;
  }): Promise<WhatsAppSession>;
  update(sessionId: string, data: Partial<WhatsAppSession>): Promise<WhatsAppSession>;
  updateStatus(sessionId: string, status: SessionStatus): Promise<void>;
  updateQRCode(sessionId: string, qrCode: string, expiresAt: Date): Promise<void>;
  delete(sessionId: string): Promise<void>;
  softDelete(sessionId: string): Promise<void>;
}
