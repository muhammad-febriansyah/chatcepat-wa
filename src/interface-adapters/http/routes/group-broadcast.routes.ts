import { Router } from 'express';
import { GroupBroadcastController } from '../controllers/GroupBroadcastController';

const router = Router();
const controller = new GroupBroadcastController();

/**
 * @route GET /api/group-broadcast/:sessionId/groups
 * @desc Get all groups for a session
 * @query userId
 */
router.get('/:sessionId/groups', (req, res) => controller.getGroupsForBroadcast(req, res));

/**
 * @route POST /api/group-broadcast/:sessionId/send
 * @desc Broadcast message to multiple groups
 * @body {
 *   userId: number,
 *   groupJids: string[],
 *   message: {
 *     type: 'text' | 'image' | 'video' | 'document' | 'audio',
 *     text?: string,
 *     mediaPath?: string,
 *     fileName?: string,
 *     caption?: string
 *   }
 * }
 */
router.post('/:sessionId/send', (req, res) => controller.broadcastToGroups(req, res));

export default router;
