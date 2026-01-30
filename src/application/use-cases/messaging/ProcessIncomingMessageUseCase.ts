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

    // ===== DEDUPLICATION CHECK =====
    // Check if message already exists (prevent duplicate processing)
    const existingMessage = await this.messageRepository.findByMessageId(data.messageId);
    if (existingMessage) {
      console.log(`⏭️ Message already processed: ${data.messageId} from ${data.fromNumber} - skipping to avoid duplicate`);
      return;
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

    // Auto-save contact from incoming chat
    // Check if auto-save contacts is enabled (default: true)
    const autoSaveContacts = session.settings?.autoSaveContacts ?? true;

    if (autoSaveContacts) {
      try {
        await this.contactRepository.create({
          userId: session.userId,
          whatsappSessionId: session.id,
          phoneNumber: data.fromNumber,
          displayName: null, // Don't overwrite display_name (user-set name)
          pushName: data.pushName || null,
          isBusiness: false,
          isGroup: data.fromNumber.endsWith('@g.us'),
          metadata: null,
          lastMessageAt: new Date(),
        });
        console.log(`📇 Contact auto-saved: ${data.fromNumber}${data.pushName ? ` (${data.pushName})` : ''}`);
      } catch (error) {
        console.error(`❌ Failed to auto-save contact:`, error);
      }
    } else {
      console.log(`⏭️ Auto-save contacts disabled for session ${whatsappSessionId}`);
    }

    // Emit WebSocket event
    this.socketServer.emitIncomingMessage(session.userId, session.sessionId, incomingMessage.toJSON());

    // ** HUMAN AGENT ROUTING **
    // Check if this conversation is assigned to a human agent
    const conversation = await this.checkAndCreateConversation(session, data);

    if (conversation && conversation.human_agent_id) {
      console.log(`🧑‍💼 Message routed to human agent ID ${conversation.human_agent_id}`);
      // Skip auto-reply if assigned to human agent
      return;
    }

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
          sessionName: session.name || 'ChatCepat', // Pass business name from session
          aiConfig: session.aiConfig || null, // Pass AI configuration
        })
        .catch((error) => {
          console.error('❌ Auto-reply failed:', error);
        });
    } else {
      console.warn(`⚠️ Socket not available for auto-reply, skipping for session ${whatsappSessionId}`);
    }
  }

  /**
   * Check if conversation exists and create/update it
   * Returns conversation with human_agent_id if assigned
   */
  private async checkAndCreateConversation(session: any, data: IncomingMessageData): Promise<any> {
    try {
      const mysql = await import('mysql2/promise');
      const { env } = await import('@shared/config/env');

      // Create direct connection to database
      const conn = await mysql.createConnection({
        host: env.db.host,
        user: env.db.user,
        password: env.db.password,
        database: env.db.name,
      });

      // Check if conversation exists
      const [conversations]: any = await conn.execute(
        `SELECT id, human_agent_id, status FROM conversations
         WHERE whatsapp_session_id = ? AND customer_phone = ? AND deleted_at IS NULL
         LIMIT 1`,
        [session.id, data.fromNumber]
      );

      let conversation = conversations[0];

      if (!conversation) {
        // Create new conversation
        const [result]: any = await conn.execute(
          `INSERT INTO conversations
           (user_id, whatsapp_session_id, customer_phone, customer_name, status,
            last_message_at, last_message_text, last_message_from, unread_by_agent, unread_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'open', NOW(), ?, 'customer', 1, 1, NOW(), NOW())`,
          [session.userId, session.id, data.fromNumber, data.pushName, data.content]
        );

        conversation = {
          id: result.insertId,
          human_agent_id: null,
          status: 'open',
        };

        console.log(`📝 New conversation created: ID ${conversation.id}`);
      } else {
        // Update existing conversation
        const newUnreadCount = conversation.human_agent_id ? (conversation.unread_count || 0) + 1 : 0;

        await conn.execute(
          `UPDATE conversations
           SET last_message_at = NOW(),
               last_message_text = ?,
               last_message_from = 'customer',
               unread_by_agent = ?,
               unread_count = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [data.content, conversation.human_agent_id ? 1 : 0, newUnreadCount, conversation.id]
        );

        console.log(`📝 Conversation updated: ID ${conversation.id}`);
      }

      // Store conversation message
      await conn.execute(
        `INSERT INTO conversation_messages
         (conversation_id, message_id, direction, message_text, message_type, is_read, created_at, updated_at)
         VALUES (?, ?, 'inbound', ?, ?, 0, NOW(), NOW())`,
        [conversation.id, data.messageId, data.content, data.type]
      );

      await conn.end();
      return conversation;
    } catch (error) {
      console.error('Error checking/creating conversation:', error);
      return null;
    }
  }
}
