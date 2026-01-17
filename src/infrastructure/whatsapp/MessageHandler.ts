import { injectable, inject } from 'inversify';
import { WASocket, proto } from '@whiskeysockets/baileys';
import { TYPES } from '@di/types';
import { ProcessIncomingMessageUseCase } from '@application/use-cases/messaging/ProcessIncomingMessageUseCase';
import { CaptureGroupMemberUseCase } from '@application/use-cases/groups/CaptureGroupMemberUseCase';

@injectable()
export class MessageHandler {
  constructor(
    @inject(TYPES.ProcessIncomingMessageUseCase)
    private processIncomingMessageUseCase: ProcessIncomingMessageUseCase,
    @inject(TYPES.CaptureGroupMemberUseCase)
    private captureGroupMemberUseCase: CaptureGroupMemberUseCase
  ) {}

  /**
   * Register message handlers for a Baileys socket
   */
  registerHandlers(sessionId: string, socket: WASocket): void {
    console.log(`📱 MessageHandler registered for session: ${sessionId}`);

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`📨 messages.upsert event received - Type: ${type}, Count: ${messages.length}`);

      // Process both 'notify' (new messages) and 'append' (messages that may be new)
      // We'll filter old messages based on timestamp
      if (type !== 'notify' && type !== 'append') {
        console.log(`⏭️ Skipping messages with type: ${type}`);
        return;
      }

      for (const message of messages) {
        try {
          // Skip messages from self to avoid bot replying to itself
          if (message.key?.fromMe) {
            console.log(`⏭️ Skipping message from self (fromMe: true) - ${message.key.remoteJid}`);
            continue;
          }

          // For 'append' type messages, use more lenient timestamp check (30 minutes)
          // For 'notify' type messages, use stricter check (5 minutes)
          const messageTimestamp = message.messageTimestamp as number;
          const messageDate = messageTimestamp ? new Date(messageTimestamp * 1000) : new Date();
          const timeLimit = type === 'append' ? 30 : 5; // 30 minutes for append, 5 for notify
          const cutoffTime = new Date(Date.now() - timeLimit * 60 * 1000);

          if (messageDate < cutoffTime) {
            console.log(`⏭️ Skipping old ${type} message from ${message.key.remoteJid} (${messageDate.toISOString()}, limit: ${timeLimit}m)`);
            continue;
          }

          console.log(`📩 Processing ${type} message from: ${message.key.remoteJid} (timestamp: ${messageDate.toISOString()})`);
          await this.handleIncomingMessage(sessionId, socket, message);
        } catch (error) {
          console.error('❌ Error handling message:', error);
        }
      }
    });

    // Handle message status updates (sent, delivered, read)
    socket.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        try {
          await this.handleMessageUpdate(sessionId, update);
        } catch (error) {
          console.error('Error handling message update:', error);
        }
      }
    });
  }

  /**
   * Process incoming message
   */
  private async handleIncomingMessage(
    sessionId: string,
    socket: WASocket,
    message: proto.IWebMessageInfo
  ): Promise<void> {
    console.log(`🔍 handleIncomingMessage called for session: ${sessionId}`);
    console.log(`   - remoteJid:`, message.key?.remoteJid);
    console.log(`   - fromMe:`, message.key?.fromMe);

    // Skip if no key (already checked fromMe in the caller)
    if (!message.key) {
      console.log(`⏭️ Skipping message (no key)`);
      return;
    }

    // Extract message data
    const messageId = message.key.id || `msg-${Date.now()}`;

    // Handle LID (Linked Identity) vs real phone number
    // In newer WhatsApp versions, remoteJid might be a LID (like 231447315095793)
    // We need to get the real phone number to reply correctly
    const messageKey = message.key as any;
    const remoteJid = messageKey.remoteJid || '';

    // Check if this is a LID (usually doesn't have country code pattern)
    // Real phone numbers start with country code (62, 1, 44, etc.)
    // LIDs are typically longer random numbers
    let fromNumber = this.extractPhoneNumber(remoteJid);
    let replyJid = remoteJid; // JID to use when replying

    // If participant exists (for groups or linked devices), use it
    if (messageKey.participant) {
      fromNumber = this.extractPhoneNumber(messageKey.participant);
      replyJid = messageKey.participant;
    }

    // Check if fromNumber looks like a LID (not a valid phone number)
    // Valid Indonesian numbers: 62xxx (10-15 digits total)
    // LIDs are usually 15+ digits without country code pattern
    const isLikelyLID = fromNumber.length > 14 && !fromNumber.startsWith('62') && !fromNumber.startsWith('1');

    if (isLikelyLID) {
      console.log(`⚠️ Detected possible LID: ${fromNumber}, using remoteJid for reply: ${remoteJid}`);
      // Still use the original remoteJid for replies - WhatsApp should handle the routing
      replyJid = remoteJid;
    }

    // Store replyJid in message for later use in auto-reply
    (message as any)._replyJid = replyJid;

    // Get session's phone number from socket.user.id (extract phone from JID format)
    const toNumber = socket.user?.id ? this.extractPhoneNumber(socket.user.id) : sessionId;

    // Determine message type and content
    const { type, content, mediaMetadata } = this.extractMessageContent(message);

    // Extract push_name (sender's WhatsApp display name)
    const pushName = message.pushName || null;

    console.log(`📥 Received ${type} message from ${fromNumber} (${pushName || 'no name'}) to ${toNumber}: ${content?.substring(0, 50) || '(no text)'}`);

    // Capture group member phone number if this is a group message
    if (remoteJid.endsWith('@g.us') && messageKey.participant) {
      try {
        await this.captureGroupMemberUseCase.execute({
          sessionId,
          groupJid: remoteJid,
          participantJid: messageKey.participant,
          pushName,
        });
      } catch (error) {
        console.error(`⚠️ Failed to capture group member:`, error);
        // Don't throw - this is a non-critical operation
      }
    }

    // Mark message as read with human-like delay
    // Humans don't instantly read messages - add realistic delay
    try {
      if (message.key.remoteJid) {
        // Calculate read delay based on message length (humans read ~200-250 WPM)
        const messageLength = content?.length || 0;
        const baseReadDelay = Math.min(messageLength * 50, 3000); // ~50ms per character, max 3 seconds
        const randomDelay = 500 + Math.floor(Math.random() * 1500); // 0.5-2 seconds base
        const totalReadDelay = baseReadDelay + randomDelay;

        console.log(`👀 Waiting ${totalReadDelay}ms before marking as read (simulating reading)`);
        await new Promise(resolve => setTimeout(resolve, totalReadDelay));

        await socket.readMessages([message.key]);
        console.log(`✅ Message marked as read`);
      }
    } catch (error) {
      console.error(`❌ Failed to mark message as read:`, error);
    }

    // Process the message through use case
    try {
      await this.processIncomingMessageUseCase.execute({
        whatsappSessionId: sessionId,
        messageId,
        fromNumber,
        toNumber,
        type,
        content,
        mediaMetadata,
        pushName, // Sender's WhatsApp display name
        socket, // Pass socket to avoid circular dependency
        replyJid, // Pass the correct JID for replying
      });
    } catch (error) {
      console.error(`❌ Error in processIncomingMessageUseCase:`, error);
      throw error;
    }
  }

  /**
   * Handle message status updates
   */
  private async handleMessageUpdate(
    sessionId: string,
    update: proto.IWebMessageInfo
  ): Promise<void> {
    // TODO: Implement message status update logic
    // This will update the message status in the database (sent, delivered, read)
    if (!update.key) return;
    console.log(`Message update for session ${sessionId}:`, update.key.id);
  }

  /**
   * Extract phone number from JID
   */
  private extractPhoneNumber(jid: string): string {
    // Remove @s.whatsapp.net or @g.us suffix
    return jid.split('@')[0];
  }

  /**
   * Extract message type and content
   */
  private extractMessageContent(message: proto.IWebMessageInfo): {
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'other';
    content: string | null;
    mediaMetadata: any;
  } {
    const msg = message.message;

    if (!msg) {
      return { type: 'other', content: null, mediaMetadata: null };
    }

    // Text message
    if (msg.conversation) {
      return {
        type: 'text',
        content: msg.conversation,
        mediaMetadata: null,
      };
    }

    // Extended text (with link preview, etc.)
    if (msg.extendedTextMessage) {
      return {
        type: 'text',
        content: msg.extendedTextMessage.text || null,
        mediaMetadata: {
          contextInfo: msg.extendedTextMessage.contextInfo,
        },
      };
    }

    // Image
    if (msg.imageMessage) {
      return {
        type: 'image',
        content: msg.imageMessage.caption || null,
        mediaMetadata: {
          mimetype: msg.imageMessage.mimetype,
          url: msg.imageMessage.url,
          fileLength: msg.imageMessage.fileLength,
        },
      };
    }

    // Video
    if (msg.videoMessage) {
      return {
        type: 'video',
        content: msg.videoMessage.caption || null,
        mediaMetadata: {
          mimetype: msg.videoMessage.mimetype,
          url: msg.videoMessage.url,
          fileLength: msg.videoMessage.fileLength,
          seconds: msg.videoMessage.seconds,
        },
      };
    }

    // Audio / Voice
    if (msg.audioMessage) {
      return {
        type: 'audio',
        content: null,
        mediaMetadata: {
          mimetype: msg.audioMessage.mimetype,
          url: msg.audioMessage.url,
          fileLength: msg.audioMessage.fileLength,
          seconds: msg.audioMessage.seconds,
          ptt: msg.audioMessage.ptt, // Push-to-talk (voice note)
        },
      };
    }

    // Document
    if (msg.documentMessage) {
      return {
        type: 'document',
        content: msg.documentMessage.caption || msg.documentMessage.fileName || null,
        mediaMetadata: {
          mimetype: msg.documentMessage.mimetype,
          url: msg.documentMessage.url,
          fileLength: msg.documentMessage.fileLength,
          fileName: msg.documentMessage.fileName,
        },
      };
    }

    // Sticker
    if (msg.stickerMessage) {
      return {
        type: 'sticker',
        content: null,
        mediaMetadata: {
          mimetype: msg.stickerMessage.mimetype,
          url: msg.stickerMessage.url,
        },
      };
    }

    // Location
    if (msg.locationMessage) {
      return {
        type: 'location',
        content: msg.locationMessage.name || msg.locationMessage.address || null,
        mediaMetadata: {
          latitude: msg.locationMessage.degreesLatitude,
          longitude: msg.locationMessage.degreesLongitude,
        },
      };
    }

    // Contact
    if (msg.contactMessage) {
      return {
        type: 'contact',
        content: msg.contactMessage.displayName || null,
        mediaMetadata: {
          vcard: msg.contactMessage.vcard,
        },
      };
    }

    // Unknown message type
    return {
      type: 'other',
      content: JSON.stringify(msg),
      mediaMetadata: null,
    };
  }
}
