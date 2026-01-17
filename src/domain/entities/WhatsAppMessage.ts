export type MessageDirection = 'incoming' | 'outgoing';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'other';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MediaMetadata {
  url?: string;
  filename?: string;
  mimetype?: string;
  size?: number;
  caption?: string;
  [key: string]: any;
}

export interface MessageContext {
  quotedMessageId?: string;
  isForwarded?: boolean;
  forwardedFrom?: string;
  [key: string]: any;
}

export class WhatsAppMessage {
  constructor(
    public readonly id: number,
    public readonly whatsappSessionId: number,
    public readonly messageId: string,
    public readonly fromNumber: string,
    public readonly toNumber: string,
    public readonly direction: MessageDirection,
    public readonly type: MessageType,
    public content: string | null,
    public mediaMetadata: MediaMetadata | null,
    public status: MessageStatus,
    public isAutoReply: boolean,
    public autoReplySource: string | null,
    public context: MessageContext | null,
    public sentAt: Date | null,
    public deliveredAt: Date | null,
    public readAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  isIncoming(): boolean {
    return this.direction === 'incoming';
  }

  isOutgoing(): boolean {
    return this.direction === 'outgoing';
  }

  isTextMessage(): boolean {
    return this.type === 'text';
  }

  hasMedia(): boolean {
    return this.type !== 'text' && this.mediaMetadata !== null;
  }

  markAsSent(): void {
    this.status = 'sent';
    this.sentAt = new Date();
  }

  markAsDelivered(): void {
    this.status = 'delivered';
    this.deliveredAt = new Date();
  }

  markAsRead(): void {
    this.status = 'read';
    this.readAt = new Date();
  }

  markAsFailed(): void {
    this.status = 'failed';
  }

  toJSON() {
    return {
      id: this.id,
      whatsappSessionId: this.whatsappSessionId,
      messageId: this.messageId,
      fromNumber: this.fromNumber,
      toNumber: this.toNumber,
      direction: this.direction,
      type: this.type,
      content: this.content,
      mediaMetadata: this.mediaMetadata,
      status: this.status,
      isAutoReply: this.isAutoReply,
      autoReplySource: this.autoReplySource,
      context: this.context,
      sentAt: this.sentAt,
      deliveredAt: this.deliveredAt,
      readAt: this.readAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
