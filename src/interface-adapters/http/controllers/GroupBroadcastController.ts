import { Request, Response } from 'express';
import { container } from '../../../di/container';
import { BroadcastToGroupUseCase } from '../../../application/use-cases/groups/BroadcastToGroupUseCase';
import { TYPES } from '../../../di/types';

export class GroupBroadcastController {
    /**
     * Broadcast message to multiple groups
     * POST /api/group-broadcast/:sessionId/send
     */
    async broadcastToGroups(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId } = req.params;
            const { userId, groupJids, message } = req.body;

            // Validate request
            if (!userId || !groupJids || !Array.isArray(groupJids) || groupJids.length === 0) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid request. userId and groupJids (array) are required',
                });
                return;
            }

            if (!message || !message.type) {
                res.status(400).json({
                    success: false,
                    error: 'Invalid request. message with type is required',
                });
                return;
            }

            // Validate message based on type
            if (message.type === 'text' && !message.text) {
                res.status(400).json({
                    success: false,
                    error: 'Text message requires text content',
                });
                return;
            }

            if (['image', 'video', 'document', 'audio'].includes(message.type) && !message.mediaPath) {
                res.status(400).json({
                    success: false,
                    error: `${message.type} message requires mediaPath`,
                });
                return;
            }

            // Get use case from DI container
            const broadcastUseCase = container.get<BroadcastToGroupUseCase>(
                TYPES.BroadcastToGroupUseCase
            );

            // Execute broadcast
            const result = await broadcastUseCase.execute({
                userId,
                sessionId,
                groupJids,
                message,
            });

            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: `Broadcast sent to ${result.successCount} out of ${result.totalGroups} groups`,
                    data: result,
                });
            } else {
                res.status(207).json({
                    success: false,
                    message: `Broadcast partially sent. ${result.successCount} succeeded, ${result.failedCount} failed`,
                    data: result,
                });
            }
        } catch (error: any) {
            console.error('Error broadcasting to groups:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to broadcast to groups',
            });
        }
    }

    /**
     * Get user's groups for broadcast
     * GET /api/group-broadcast/:sessionId/groups
     */
    async getGroupsForBroadcast(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId } = req.params;
            const { userId } = req.query;

            if (!userId) {
                res.status(400).json({
                    success: false,
                    error: 'userId is required',
                });
                return;
            }

            // Get WhatsApp client from container
            const whatsappClient = container.get<any>(TYPES.WhatsAppClient);
            const sock = whatsappClient.getSession(sessionId);

            if (!sock || !sock.user) {
                res.status(404).json({
                    success: false,
                    error: 'WhatsApp session tidak terhubung',
                });
                return;
            }

            // Get all groups
            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups).map((group: any) => ({
                id: group.id,
                name: group.subject,
                participantCount: group.participants?.length || 0,
                isAdmin: group.participants?.some(
                    (p: any) => p.id === sock.user?.id && (p.admin === 'admin' || p.admin === 'superadmin')
                ) || false,
            }));

            res.status(200).json({
                success: true,
                data: {
                    groups: groupList,
                    totalGroups: groupList.length,
                },
            });
        } catch (error: any) {
            console.error('Error getting groups:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get groups',
            });
        }
    }
}
