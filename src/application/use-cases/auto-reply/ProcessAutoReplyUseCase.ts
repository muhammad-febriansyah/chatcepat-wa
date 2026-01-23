import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IMessageRepository } from '@application/interfaces/repositories/IMessageRepository';
import { IOpenAIService } from '@application/interfaces/services/IOpenAIService';
import { IRajaOngkirService } from '@application/interfaces/services/IRajaOngkirService';
import { BitShipService } from '@infrastructure/external-services/BitShipService';
import { RateLimiter } from '@infrastructure/rate-limiter/RateLimiter';
import { WhatsAppMessage } from '@domain/entities/WhatsAppMessage';
import type { WASocket } from '@whiskeysockets/baileys';

interface ProcessAutoReplyInput {
  sessionId: number;
  whatsappSessionId: string;
  incomingMessage: WhatsAppMessage;
  socket: WASocket; // Pass socket as parameter to avoid circular dependency
  aiAssistantType?: string; // AI assistant type from session
  replyJid?: string; // The correct JID to use when replying (handles LID vs phone number)
  sessionName?: string; // Business name from session
  aiConfig?: any; // AI configuration from session
}

@injectable()
export class ProcessAutoReplyUseCase {
  // Enhanced regex pattern for "cek ongkir [origin] ke [destination] [weight] [courier]"
  // Supports:
  // - "cek ongkir Jakarta ke Bandung"
  // - "cek ongkir dari Jakarta ke Bandung"
  // - "cek ongkir Jakarta ke Bandung 2kg"
  // - "cek ongkir Jakarta ke Bandung jnt"
  // - "cek ongkir Jakarta ke Bandung 2kg jnt"
  private readonly ONGKIR_REGEX = /cek\s+ongkir\s+(?:dari\s+)?(.+?)\s+ke\s+(.+?)(?:\s+(\d+(?:\.\d+)?)\s*kg)?(?:\s+(jne|pos|tiki|jnt|sicepat|anteraja))?$/i;

  constructor(
    @inject(TYPES.MessageRepository) private messageRepository: IMessageRepository,
    @inject(TYPES.OpenAIService) private openAIService: IOpenAIService,
    @inject(TYPES.RajaOngkirService) private rajaOngkirService: IRajaOngkirService,
    @inject(TYPES.BitShipService) private bitShipService: BitShipService,
    @inject(TYPES.RateLimiter) private rateLimiter: RateLimiter
  ) {}

  async execute(input: ProcessAutoReplyInput): Promise<WhatsAppMessage> {
    const { sessionId, whatsappSessionId, incomingMessage, socket, aiAssistantType, replyJid, sessionName, aiConfig } = input;

    // Only process incoming text messages
    if (incomingMessage.direction !== 'incoming' || incomingMessage.type !== 'text') {
      throw new Error('Auto-reply only processes incoming text messages');
    }

    const messageContent = incomingMessage.content || '';
    const fromNumber = incomingMessage.fromNumber;

    let replyText: string;
    let autoReplySource: 'openai' | 'rajaongkir' | 'manual';

    // 1. Check Manual Auto-Reply first (highest priority)
    const manualReply = await this.checkManualAutoReply(sessionId, messageContent);

    if (manualReply) {
      console.log(`📝 Using manual auto-reply: ${manualReply.substring(0, 50)}...`);
      replyText = manualReply;
      autoReplySource = 'manual';
    }
    // 2. Check if message is a RajaOngkir command
    else if (messageContent.match(this.ONGKIR_REGEX)) {
      const ongkirMatch = messageContent.match(this.ONGKIR_REGEX)!;
      // Process shipping cost check command
      console.log(`✅ Detected shipping cost command from ${fromNumber}: ${messageContent}`);

      const origin = ongkirMatch[1].trim();
      const destination = ongkirMatch[2].trim();
      const weightKg = ongkirMatch[3] ? parseFloat(ongkirMatch[3]) : 1; // Default 1kg
      const courier = ongkirMatch[4] ? ongkirMatch[4].toLowerCase() : 'jne'; // Default JNE
      const weightGrams = Math.round(weightKg * 1000); // Convert to grams

      try {
        // Check shipping cost using RajaOngkir API
        console.log(`📦 Checking shipping cost: ${origin} → ${destination} (${weightKg}kg, ${courier.toUpperCase()})`);

        const costs = await this.rajaOngkirService.checkShippingCost(
          origin,
          destination,
          weightGrams,
          courier
        );

        // Format reply with shipping costs
        let formattedReply = this.rajaOngkirService.formatShippingCostReply(costs);

        // Add weight info to the reply
        if (costs.length > 0 && costs[0].courier !== 'INFO') {
          formattedReply = `📦 *Informasi Ongkos Kirim*\n\n` +
            `*Asal:* ${origin}\n` +
            `*Tujuan:* ${destination}\n` +
            `*Berat:* ${weightKg} kg\n` +
            `*Kurir:* ${courier.toUpperCase()}\n\n` +
            formattedReply.split('\n\n').slice(1).join('\n\n');
        }

        replyText = formattedReply;
        autoReplySource = 'rajaongkir';

        console.log(`✅ Shipping cost check successful`);
      } catch (error: any) {
        console.error('❌ Shipping cost check error:', error);
        replyText = `Maaf, ${error.message || 'terjadi kesalahan saat mengecek ongkir. Silakan coba lagi.'}\n\n` +
          `*Format yang benar:*\n` +
          `• cek ongkir [asal] ke [tujuan]\n` +
          `• cek ongkir [asal] ke [tujuan] [berat]kg\n` +
          `• cek ongkir [asal] ke [tujuan] [berat]kg [kurir]\n\n` +
          `*Contoh:*\n` +
          `• cek ongkir jakarta ke bandung\n` +
          `• cek ongkir jakarta ke bandung 2kg\n` +
          `• cek ongkir jakarta ke bandung 2kg jnt\n\n` +
          `*Kurir tersedia:* jne, pos, tiki, jnt, sicepat, anteraja`;
        autoReplySource = 'rajaongkir';
      }
    } else {
      // Process with OpenAI
      console.log(`Processing with OpenAI for ${fromNumber} (AI Type: ${aiAssistantType || 'general'}, Business: ${sessionName || 'ChatCepat'}): ${messageContent}`);

      try {
        replyText = await this.openAIService.generateResponse(
          whatsappSessionId,
          fromNumber,
          messageContent,
          undefined, // config
          aiAssistantType || 'general', // AI assistant type
          sessionName || 'ChatCepat', // Business name
          aiConfig // AI configuration
        );
        autoReplySource = 'openai';
      } catch (error: any) {
        console.error('OpenAI error:', error);
        replyText = 'Maaf, saya tidak bisa memproses pesan Anda saat ini. Silakan coba lagi nanti.';
        autoReplySource = 'openai';
      }
    }

    // Create outgoing message record
    const outgoingMessage = await this.messageRepository.create({
      whatsappSessionId: sessionId,
      messageId: `auto-reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromNumber: incomingMessage.toNumber, // Session's number
      toNumber: fromNumber, // Customer's number
      direction: 'outgoing',
      type: 'text',
      content: replyText,
      mediaMetadata: null,
      status: 'pending',
      isAutoReply: true,
      autoReplySource,
      context: {
        replyTo: incomingMessage.messageId,
        conversationId: fromNumber,
      },
      sentAt: null,
      deliveredAt: null,
      readAt: null,
    });

    // Check rate limit before sending
    const rateLimitCheck = await this.rateLimiter.checkRateLimit(sessionId);

    if (!rateLimitCheck.canSend) {
      console.warn(`⚠️ Rate limit exceeded for session ${sessionId}: ${rateLimitCheck.reason}`);
      await this.messageRepository.updateStatus(outgoingMessage.messageId, 'failed');
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
    }

    // Wait for calculated delay (adaptive based on usage)
    if (rateLimitCheck.delayMs > 0) {
      await this.rateLimiter.waitForDelay(rateLimitCheck.delayMs);
    }

    // Send the message via WhatsApp
    try {
      // Socket is passed as parameter to avoid circular dependency
      if (!socket) {
        throw new Error(`Session ${whatsappSessionId} not active`);
      }

      // Check if socket is truly connected (has authenticated user)
      if (!socket.user) {
        throw new Error(`Session ${whatsappSessionId} is not connected to WhatsApp`);
      }

      // Use replyJid if provided, otherwise construct from fromNumber
      // replyJid handles LID (Linked Identity) vs phone number correctly
      let jid: string;
      if (replyJid) {
        jid = replyJid.includes('@') ? replyJid : `${replyJid}@s.whatsapp.net`;
        console.log(`📤 Using replyJid for sending: ${jid}`);
      } else {
        jid = fromNumber.includes('@') ? fromNumber : `${fromNumber}@s.whatsapp.net`;
        console.log(`📤 Using fromNumber for sending: ${jid}`);
      }

      // ============================================
      // HUMAN-LIKE BEHAVIOR TO AVOID SPAM DETECTION
      // ============================================

      // 1. Calculate typing duration based on message length (humans type ~40-60 WPM)
      const wordCount = replyText.split(/\s+/).length;
      const baseTypingMs = Math.min(wordCount * 200, 8000); // ~200ms per word, max 8 seconds
      const randomVariation = Math.floor(Math.random() * 2000) - 1000; // ±1 second variation
      const typingDuration = Math.max(1500, baseTypingMs + randomVariation); // Minimum 1.5 seconds

      // 2. Show "typing..." indicator (with error handling for connection issues)
      try {
        console.log(`⌨️ Simulating typing for ${typingDuration}ms before sending to ${jid}`);
        await socket.sendPresenceUpdate('composing', jid);
      } catch (presenceError: any) {
        // Log but don't fail - presence updates are optional
        console.warn(`⚠️ Failed to send typing indicator: ${presenceError.message}`);
        // Check if connection is closed
        if (presenceError.message?.includes('Connection Closed') ||
            presenceError.output?.payload?.message?.includes('Connection Closed')) {
          throw new Error('WhatsApp connection was closed while preparing to send message');
        }
      }

      // 3. Wait while "typing"
      await new Promise(resolve => setTimeout(resolve, typingDuration));

      // 4. Stop typing indicator (with error handling)
      try {
        await socket.sendPresenceUpdate('paused', jid);
      } catch (presenceError: any) {
        // Log but don't fail - presence updates are optional
        console.warn(`⚠️ Failed to clear typing indicator: ${presenceError.message}`);
      }

      // 5. Small pause before actually sending (like pressing enter)
      const sendDelay = 300 + Math.floor(Math.random() * 500); // 300-800ms
      await new Promise(resolve => setTimeout(resolve, sendDelay));

      // Send text message
      await socket.sendMessage(jid, { text: replyText });

      // Record message sent for rate limiting
      await this.rateLimiter.recordMessageSent(sessionId);

      // Update message status to sent
      await this.messageRepository.updateStatus(outgoingMessage.messageId, 'sent');
      console.log(`✅ Auto-reply sent to ${fromNumber} (${autoReplySource}): ${replyText.substring(0, 50)}...`);
    } catch (error: any) {
      // Enhanced error handling with more specific messages
      const errorMessage = error.message || 'Unknown error';
      const isConnectionError = errorMessage.includes('Connection Closed') ||
                                errorMessage.includes('not connected') ||
                                errorMessage.includes('not active');

      if (isConnectionError) {
        console.error(`❌ Auto-reply failed: ${errorMessage}`);
      } else {
        console.error('Failed to send auto-reply:', error);
      }

      await this.messageRepository.updateStatus(outgoingMessage.messageId, 'failed');
      throw error;
    }

    return outgoingMessage;
  }

  /**
   * Check if there's a manual auto-reply that matches the message content
   */
  private async checkManualAutoReply(sessionId: number, messageContent: string): Promise<string | null> {
    try {
      const mysql = await import('mysql2/promise');
      const { env } = await import('@shared/config/env');

      // Create connection
      const conn = await mysql.createConnection({
        host: env.db.host,
        user: env.db.user,
        password: env.db.password,
        database: env.db.name,
      });

      // Query manual auto-replies for this session (only custom type)
      const [rows]: any = await conn.execute(
        `SELECT trigger_value as keyword, custom_reply as reply_text, trigger_type as match_type
         FROM whatsapp_auto_replies
         WHERE whatsapp_session_id = ? AND is_active = 1 AND reply_type = 'custom'
         ORDER BY priority DESC, id ASC`,
        [sessionId]
      );

      await conn.end();

      if (!rows || rows.length === 0) {
        return null;
      }

      const messageLower = messageContent.toLowerCase().trim();

      // Check each auto-reply rule
      for (const row of rows) {
        const keyword = row.keyword.toLowerCase().trim();
        const matchType = row.match_type || 'contains';

        let isMatch = false;

        switch (matchType) {
          case 'exact':
            // Exact match (case-insensitive)
            isMatch = messageLower === keyword;
            break;

          case 'contains':
            // Contains keyword anywhere
            isMatch = messageLower.includes(keyword);
            break;

          case 'starts_with':
            // Starts with keyword
            isMatch = messageLower.startsWith(keyword);
            break;

          case 'ends_with':
            // Ends with keyword
            isMatch = messageLower.endsWith(keyword);
            break;

          case 'regex':
            // Regex pattern match
            try {
              const regex = new RegExp(keyword, 'i');
              isMatch = regex.test(messageContent);
            } catch (e) {
              console.error('Invalid regex pattern:', keyword);
              isMatch = false;
            }
            break;

          default:
            isMatch = messageLower === keyword;
        }

        if (isMatch) {
          console.log(`✅ Manual auto-reply matched (${matchType}): "${keyword}"`);
          return row.reply_text;
        }
      }

      return null;
    } catch (error) {
      console.error('Error checking manual auto-reply:', error);
      return null;
    }
  }
}
