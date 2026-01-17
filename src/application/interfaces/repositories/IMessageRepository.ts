import { WhatsAppMessage, MessageDirection, MessageStatus, MessageType, MediaMetadata, MessageContext } from '@domain/entities/WhatsAppMessage';

export interface MessageFilter {
  sessionId?: number;
  direction?: MessageDirection;
  status?: MessageStatus;
  isAutoReply?: boolean;
  fromNumber?: string;
  toNumber?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface CreateMessageData {
  whatsappSessionId: number;
  messageId: string;
  fromNumber: string;
  pushName?: string | null;
  toNumber: string;
  direction: MessageDirection;
  type: MessageType;
  content: string | null;
  mediaMetadata: MediaMetadata | null;
  status: MessageStatus;
  isAutoReply: boolean;
  autoReplySource: string | null;
  context: MessageContext | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
}

export interface IMessageRepository {
  findById(id: number): Promise<WhatsAppMessage | null>;
  findByMessageId(messageId: string): Promise<WhatsAppMessage | null>;
  findBySessionId(sessionId: number, options?: MessageFilter): Promise<WhatsAppMessage[]>;
  findConversation(sessionId: number, phoneNumber: string, limit?: number): Promise<WhatsAppMessage[]>;
  create(message: CreateMessageData): Promise<WhatsAppMessage>;
  updateStatus(messageId: string, status: MessageStatus): Promise<void>;
  countBySessionId(sessionId: number, filters?: MessageFilter): Promise<number>;
}
