import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { BroadcastCampaign } from '@domain/entities/BroadcastCampaign';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { SessionManager } from '@infrastructure/whatsapp/SessionManager';
import { RateLimiter } from '@infrastructure/rate-limiter/RateLimiter';
import { SocketServer } from '@infrastructure/websocket/SocketServer';

@injectable()
export class ExecuteBroadcastUseCase {
  constructor(
    @inject(TYPES.BroadcastRepository) private broadcastRepository: IBroadcastRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.SessionManager) private sessionManager: SessionManager,
    @inject(TYPES.RateLimiter) private rateLimiter: RateLimiter,
    @inject(TYPES.SocketServer) private socketServer: SocketServer
  ) {}

  async execute(campaignId: number): Promise<void> {
    // Get campaign
    const campaign = await this.broadcastRepository.findById(campaignId);

    if (!campaign) {
      throw new Error('Broadcast campaign not found');
    }

    if (!campaign.canStart()) {
      throw new Error(`Campaign cannot be started. Current status: ${campaign.status}`);
    }

    // ✅ Verify session is connected before starting broadcast
    const session = await this.sessionRepository.findById(campaign.whatsappSessionId);
    if (!session) {
      throw new Error('WhatsApp session not found for this broadcast campaign');
    }

    if (!session.isConnected() || !session.isActive) {
      throw new Error(
        `WhatsApp session is not connected (status: ${session.status}). ` +
        `Please reconnect the session before starting the broadcast.`
      );
    }

    console.log(`🚀 Starting broadcast campaign: ${campaign.id} - ${campaign.name}`);

    // Mark campaign as processing
    campaign.start();
    await this.broadcastRepository.updateStatus(campaign.id, 'processing');

    // Emit WebSocket event - broadcast started
    this.socketServer.emitBroadcastStarted(campaign.userId, campaign.id);

    try {
      await this.processBroadcast(campaign);
    } catch (error: any) {
      console.error(`❌ Broadcast campaign ${campaign.id} failed:`, error);
      campaign.fail();
      await this.broadcastRepository.updateStatus(campaign.id, 'failed');

      // Emit WebSocket event - broadcast failed
      this.socketServer.emitBroadcastFailed(campaign.userId, campaign.id, error.message);

      throw error;
    }
  }

  private async processBroadcast(campaign: BroadcastCampaign): Promise<void> {
    // ✅ Get session info for sessionId (needed for socket lookup)
    const session = await this.sessionRepository.findById(campaign.whatsappSessionId);
    if (!session) {
      throw new Error('WhatsApp session not found');
    }

    const pendingRecipients = await this.broadcastRepository.getPendingRecipients(campaign.id);

    let sentCount = campaign.sentCount;
    let failedCount = campaign.failedCount;
    let batchCount = 0;

    console.log(`📊 Processing ${pendingRecipients.length} pending recipients`);

    for (let i = 0; i < pendingRecipients.length; i++) {
      const recipient = pendingRecipients[i];

      try {
        // Check rate limit
        const rateLimitCheck = await this.rateLimiter.checkRateLimit(campaign.whatsappSessionId);

        if (!rateLimitCheck.canSend) {
          console.warn(`⚠️ Rate limit reached. Pausing... Reason: ${rateLimitCheck.reason}`);
          await this.rateLimiter.waitForDelay(rateLimitCheck.delayMs);
          continue; // Skip this iteration and try again
        }

        // Wait for calculated delay
        if (rateLimitCheck.delayMs > 0) {
          await this.rateLimiter.waitForDelay(rateLimitCheck.delayMs);
        }

        // Send message
        await this.sendToRecipient(campaign, recipient, session.sessionId);

        // Record success
        await this.broadcastRepository.updateRecipientStatus(
          campaign.id,
          recipient.phoneNumber,
          'sent'
        );

        await this.rateLimiter.recordMessageSent(campaign.whatsappSessionId);
        sentCount++;

        console.log(`✅ Sent to ${recipient.phoneNumber} (${sentCount}/${campaign.totalRecipients})`);
      } catch (error: any) {
        console.error(`❌ Failed to send to ${recipient.phoneNumber}:`, error.message);

        await this.broadcastRepository.updateRecipientStatus(
          campaign.id,
          recipient.phoneNumber,
          'failed',
          error.message
        );

        failedCount++;
      }

      // Update progress
      await this.broadcastRepository.updateProgress(campaign.id, sentCount, failedCount);

      // Emit WebSocket progress update every 5 messages
      if ((sentCount + failedCount) % 5 === 0 || i === pendingRecipients.length - 1) {
        this.socketServer.emitBroadcastProgress(
          campaign.userId,
          campaign.id,
          sentCount,
          failedCount,
          campaign.totalRecipients
        );
      }

      // Batch delay
      batchCount++;
      if (batchCount >= campaign.batchSize && i < pendingRecipients.length - 1) {
        console.log(`⏸️  Batch completed. Waiting ${campaign.batchDelayMs / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, campaign.batchDelayMs));
        batchCount = 0;
      }
    }

    // Mark campaign as completed
    campaign.updateProgress(sentCount, failedCount);
    campaign.complete();
    await this.broadcastRepository.updateStatus(campaign.id, 'completed');

    // Emit WebSocket event - broadcast completed
    this.socketServer.emitBroadcastCompleted(
      campaign.userId,
      campaign.id,
      sentCount,
      failedCount,
      campaign.totalRecipients
    );

    console.log(`✅ Broadcast campaign completed: ${campaign.id}`);
    console.log(`📊 Results: ${sentCount} sent, ${failedCount} failed out of ${campaign.totalRecipients} total`);
  }

  private async sendToRecipient(
    campaign: BroadcastCampaign,
    recipient: { phoneNumber: string; name?: string },
    sessionId: string
  ): Promise<void> {
    // ✅ Get session socket using actual sessionId
    const socket = this.sessionManager.getSession(sessionId);

    if (!socket || !socket.user) {
      throw new Error(
        `WhatsApp session not active. Please ensure the session is connected before broadcasting.`
      );
    }

    // Format JID
    const jid = `${recipient.phoneNumber}@s.whatsapp.net`;

    // Personalize message
    let content = campaign.template.content;
    if (campaign.template.variables) {
      // Replace variables like {{name}}, {{phone}}, etc.
      content = content.replace(/\{\{name\}\}/g, recipient.name || recipient.phoneNumber);
      content = content.replace(/\{\{phone\}\}/g, recipient.phoneNumber);

      // Replace custom variables
      Object.keys(campaign.template.variables).forEach(key => {
        const value = campaign.template.variables![key];
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      });
    }

    // Send based on template type
    switch (campaign.template.type) {
      case 'text':
        await socket.sendMessage(jid, { text: content });
        break;

      case 'image':
        await socket.sendMessage(jid, {
          image: { url: campaign.template.mediaUrl! },
          caption: content,
        });
        break;

      case 'document':
        await socket.sendMessage(jid, {
          document: { url: campaign.template.mediaUrl! },
          mimetype: 'application/pdf',
          caption: content,
          fileName: 'document.pdf',
        });
        break;

      default:
        throw new Error(`Unsupported message type: ${campaign.template.type}`);
    }
  }
}
