export interface ContactMetadata {
  profilePicUrl?: string;
  status?: string;
  about?: string;
  [key: string]: any;
}

export class WhatsAppContact {
  constructor(
    public readonly id: number,
    public readonly userId: number,
    public readonly whatsappSessionId: number,
    public readonly phoneNumber: string,
    public displayName: string | null,
    public pushName: string | null,
    public isBusiness: boolean,
    public isGroup: boolean,
    public metadata: ContactMetadata | null,
    public lastMessageAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  getDisplayName(): string {
    return this.displayName || this.pushName || this.phoneNumber;
  }

  updateLastMessageTime(): void {
    this.lastMessageAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      whatsappSessionId: this.whatsappSessionId,
      phoneNumber: this.phoneNumber,
      displayName: this.displayName,
      pushName: this.pushName,
      isBusiness: this.isBusiness,
      isGroup: this.isGroup,
      metadata: this.metadata,
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
