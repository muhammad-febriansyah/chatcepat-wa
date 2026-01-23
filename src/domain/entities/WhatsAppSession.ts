export type SessionStatus = 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface WhatsAppSessionSettings {
  autoReplyEnabled?: boolean;
  broadcastEnabled?: boolean;
  [key: string]: any;
}

export class WhatsAppSession {
  constructor(
    public readonly id: number,
    public readonly userId: number,
    public readonly sessionId: string,
    public phoneNumber: string | null,
    public name: string,
    public status: SessionStatus,
    public aiAssistantType: string = 'general',
    public aiConfig: any | null = null,
    public qrCode: string | null,
    public qrExpiresAt: Date | null,
    public webhookUrl: string | null,
    public settings: WhatsAppSessionSettings | null,
    public lastConnectedAt: Date | null,
    public lastDisconnectedAt: Date | null,
    public isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly deletedAt: Date | null = null
  ) {}

  isConnected(): boolean {
    return this.status === 'connected';
  }

  isQRPending(): boolean {
    return this.status === 'qr_pending' &&
           this.qrExpiresAt !== null &&
           this.qrExpiresAt > new Date();
  }

  isDisconnected(): boolean {
    return this.status === 'disconnected' || this.status === 'failed';
  }

  canSendMessages(): boolean {
    return this.isConnected() && this.isActive;
  }

  markAsConnected(phoneNumber: string): void {
    this.status = 'connected';
    this.phoneNumber = phoneNumber;
    this.lastConnectedAt = new Date();
    this.qrCode = null;
    this.qrExpiresAt = null;
  }

  markAsDisconnected(): void {
    this.status = 'disconnected';
    this.lastDisconnectedAt = new Date();
  }

  markAsFailed(): void {
    this.status = 'failed';
    this.lastDisconnectedAt = new Date();
  }

  updateQRCode(qrCode: string, expiresInSeconds: number = 60): void {
    this.qrCode = qrCode;
    this.qrExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    this.status = 'qr_pending';
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      phoneNumber: this.phoneNumber,
      name: this.name,
      status: this.status,
      aiAssistantType: this.aiAssistantType,
      aiConfig: this.aiConfig,
      qrCode: this.qrCode,
      qrExpiresAt: this.qrExpiresAt,
      webhookUrl: this.webhookUrl,
      settings: this.settings,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
