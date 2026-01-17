import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IMessageRepository } from '@application/interfaces/repositories/IMessageRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IContactRepository } from '@application/interfaces/repositories/IContactRepository';
import { ProcessAutoReplyUseCase } from '@application/use-cases/auto-reply/ProcessAutoReplyUseCase';
import { SocketServer } from '@infrastructure/websocket/SocketServer';
import { WhatsAppMessage } from '@domain/entities/WhatsAppMessage';

interface IncomingMessageData {
  whatsappSessionId: string;
  messageId: string;
  fromNumber: string;
  toNumber: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'other';
  content: string | null;
  mediaMetadata?: any;
  pushName?: string | null; // Sender's WhatsApp display name
  socket?: any; // WASocket passed from MessageHandler to avoid circular dependency
  replyJid?: string; // The correct JID to use when replying (handles LID vs phone number)
}

@injectable()
export class ProcessIncomingMessageUseCase {
  constructor(
    @inject(TYPES.MessageRepository) private messageRepository: IMessageRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.ContactRepository) private contactRepository: IContactRepository,
    @inject(TYPES.ProcessAutoReplyUseCase) private processAutoReplyUseCase: ProcessAutoReplyUseCase,
    @inject(TYPES.SocketServer) private socketServer: SocketServer
  ) {}

  async execute(data: IncomingMessageData): Promise<void> {
    const { whatsappSessionId } = data;

    // Get session from database
    const session = await this.sessionRepository.findBySessionId(whatsappSessionId);

    if (!session) {
      console.error(`Session not found: ${whatsappSessionId}`);
      throw new Error('Session not found');
    }

    // Check if session is connected (check socket first, then database status)
    const hasActiveSocket = !!data.socket;
    const isSessionConnected = session.isConnected();

    if (!hasActiveSocket && !isSessionConnected) {
      console.warn(`Session not connected: ${whatsappSessionId} (socket: ${hasActiveSocket}, db: ${isSessionConnected})`);
      return;
    }

    if (hasActiveSocket && !isSessionConnected) {
      console.log(`✅ Socket connected but DB not updated yet for session ${whatsappSessionId}, proceeding...`);
    }

    // Store incoming message in database
    const incomingMessage = await this.messageRepository.create({
      whatsappSessionId: session.id,
      messageId: data.messageId,
      fromNumber: data.fromNumber,
      pushName: data.pushName || null,
      toNumber: data.toNumber,
      direction: 'incoming',
      type: data.type,
      content: data.content,
      mediaMetadata: data.mediaMetadata || null,
      status: 'delivered', // Incoming messages are already delivered
      isAutoReply: false,
      autoReplySource: null,
      context: null,
      sentAt: new Date(),
      deliveredAt: new Date(),
      readAt: null,
    });

    console.log(`Incoming message stored: ${data.messageId} from ${data.fromNumber}`);

    // Update or create contact with push_name (sender's WhatsApp display name)
    if (data.pushName) {
      try {
        await this.contactRepository.create({
          userId: session.userId,
          whatsappSessionId: session.id,
          phoneNumber: data.fromNumber,
          displayName: null, // Don't overwrite display_name (user-set name)
          pushName: data.pushName,
          isBusiness: false,
          isGroup: false,
          metadata: null,
          lastMessageAt: new Date(),
        });
        console.log(`📇 Contact updated with push_name: ${data.fromNumber} -> ${data.pushName}`);
      } catch (error) {
        console.error(`❌ Failed to update contact push_name:`, error);
      }
    }

    // Emit WebSocket event
    this.socketServer.emitIncomingMessage(session.userId, session.sessionId, incomingMessage.toJSON());

    // Check if auto-reply is enabled for this session
    const autoReplyEnabled = session.settings?.autoReplyEnabled ?? true;

    console.log(`🔍 Auto-reply check for session ${whatsappSessionId}:`);
    console.log(`  - Session settings:`, session.settings);
    console.log(`  - Auto-reply enabled:`, autoReplyEnabled);
    console.log(`  - Message type:`, data.type);
    console.log(`  - Socket available:`, !!data.socket);

    if (!autoReplyEnabled) {
      console.log(`⚠️ Auto-reply disabled for session ${whatsappSessionId}`);
      return;
    }

    // Only auto-reply to text messages
    if (data.type !== 'text') {
      console.log(`⚠️ Auto-reply skipped for non-text message type: ${data.type}`);
      return;
    }

    // Process auto-reply in background (don't wait for completion)
    if (data.socket) {
      console.log(`✅ Processing auto-reply for message from ${data.fromNumber} (replyJid: ${data.replyJid})`);
      this.processAutoReplyUseCase
        .execute({
          sessionId: session.id,
          whatsappSessionId: session.sessionId,
          incomingMessage,
          socket: data.socket,
          aiAssistantType: session.aiAssistantType || 'general', // Pass AI assistant type from session
          replyJid: data.replyJid, // Pass the correct JID for replying
        })
        .catch((error) => {
          console.error('❌ Auto-reply failed:', error);
        });
    } else {
      console.warn(`⚠️ Socket not available for auto-reply, skipping for session ${whatsappSessionId}`);
    }
  }
}
