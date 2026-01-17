import { injectable, inject } from 'inversify';
import { TYPES } from '../../../di/types';
import { IWhatsAppClient } from '../../interfaces/services/IWhatsAppClient';
import { ISessionRepository } from '../../interfaces/repositories/ISessionRepository';

interface BroadcastToGroupRequest {
    userId: number;
    sessionId: string;
    groupJids: string[]; // Array of group JIDs
    message: {
        type: 'text' | 'image' | 'video' | 'document' | 'audio';
        text?: string;
        mediaPath?: string;
        fileName?: string;
        caption?: string;
    };
}

interface BroadcastResult {
    success: boolean;
    totalGroups: number;
    successCount: number;
    failedCount: number;
    errors: Array<{ groupJid: string; error: string }>;
}

@injectable()
export class BroadcastToGroupUseCase {
    constructor(
        @inject(TYPES.WhatsAppClient) private whatsappClient: IWhatsAppClient,
        @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
    ) {}

    async execute(request: BroadcastToGroupRequest): Promise<BroadcastResult> {
        const { userId, sessionId, groupJids, message } = request;

        // Verify session exists and belongs to user
        const session = await this.sessionRepository.findBySessionId(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.userId !== userId) {
            throw new Error('Unauthorized access to session');
        }

        // ✅ Check database status first
        if (!session.isConnected() || !session.isActive) {
            throw new Error(
                `Session is not connected. Current status: ${session.status}. ` +
                `Please ensure the WhatsApp session is connected before broadcasting to groups.`
            );
        }

        // Get WhatsApp socket
        const sock = this.whatsappClient.getSession(sessionId);
        if (!sock || !sock.user) {
            // ✅ More descriptive error message
            const isInMemory = this.whatsappClient.isSessionActive(sessionId);
            throw new Error(
                `WhatsApp connection not available for this session. ` +
                `Database status: ${session.status}, In memory: ${isInMemory}. ` +
                `Please try reconnecting the session.`
            );
        }

        const result: BroadcastResult = {
            success: true,
            totalGroups: groupJids.length,
            successCount: 0,
            failedCount: 0,
            errors: [],
        };

        // Send message to each group with delay to prevent blocking
        for (let i = 0; i < groupJids.length; i++) {
            const groupJid = groupJids[i];

            try {
                await this.sendMessageToGroup(sock, groupJid, message);
                result.successCount++;

                // Add random delay between 2-5 seconds to prevent spam detection
                if (i < groupJids.length - 1) {
                    const delay = this.getRandomDelay(2000, 5000);
                    await this.sleep(delay);
                }
            } catch (error: any) {
                result.failedCount++;
                result.errors.push({
                    groupJid,
                    error: error.message || 'Unknown error',
                });
            }
        }

        if (result.failedCount > 0) {
            result.success = false;
        }

        return result;
    }

    private async sendMessageToGroup(
        sock: any,
        groupJid: string,
        message: BroadcastToGroupRequest['message']
    ): Promise<void> {
        switch (message.type) {
            case 'text':
                if (!message.text) {
                    throw new Error('Text message requires text content');
                }
                await sock.sendMessage(groupJid, { text: message.text });
                break;

            case 'image':
                if (!message.mediaPath) {
                    throw new Error('Image message requires media path');
                }
                await sock.sendMessage(groupJid, {
                    image: { url: message.mediaPath },
                    caption: message.caption || '',
                });
                break;

            case 'video':
                if (!message.mediaPath) {
                    throw new Error('Video message requires media path');
                }
                await sock.sendMessage(groupJid, {
                    video: { url: message.mediaPath },
                    caption: message.caption || '',
                });
                break;

            case 'document':
                if (!message.mediaPath) {
                    throw new Error('Document message requires media path');
                }
                await sock.sendMessage(groupJid, {
                    document: { url: message.mediaPath },
                    fileName: message.fileName || 'document.pdf',
                    caption: message.caption || '',
                });
                break;

            case 'audio':
                if (!message.mediaPath) {
                    throw new Error('Audio message requires media path');
                }
                await sock.sendMessage(groupJid, {
                    audio: { url: message.mediaPath },
                    mimetype: 'audio/mp4',
                });
                break;

            default:
                throw new Error(`Unsupported message type: ${message.type}`);
        }
    }

    private getRandomDelay(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
