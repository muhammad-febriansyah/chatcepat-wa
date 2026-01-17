import { Router } from 'express';
import { BroadcastController } from '../controllers/BroadcastController';

const router = Router();
const controller = new BroadcastController();

/**
 * @route POST /api/broadcasts
 * @desc Create new broadcast campaign
 * @body {
 *   whatsappSessionId: number,
 *   name: string,
 *   template: {
 *     type: 'text' | 'image' | 'document',
 *     content: string,
 *     mediaUrl?: string,
 *     variables?: Record<string, string>
 *   },
 *   recipients: Array<{ phoneNumber: string, name?: string }>,
 *   scheduledAt?: string (ISO date)
 * }
 */
router.post('/', (req, res) => controller.createCampaign(req, res));

/**
 * @route GET /api/broadcasts
 * @desc Get all broadcast campaigns for authenticated user
 * @query limit, offset, status
 */
router.get('/', (req, res) => controller.getCampaigns(req, res));

/**
 * @route GET /api/broadcasts/statistics
 * @desc Get broadcast statistics for authenticated user
 */
router.get('/statistics', (req, res) => controller.getStatistics(req, res));

/**
 * @route GET /api/broadcasts/:campaignId
 * @desc Get specific broadcast campaign
 */
router.get('/:campaignId', (req, res) => controller.getCampaign(req, res));

/**
 * @route POST /api/broadcasts/:campaignId/execute
 * @desc Execute/start broadcast campaign
 */
router.post('/:campaignId/execute', (req, res) => controller.executeCampaign(req, res));

/**
 * @route POST /api/broadcasts/:campaignId/cancel
 * @desc Cancel broadcast campaign
 */
router.post('/:campaignId/cancel', (req, res) => controller.cancelCampaign(req, res));

export default router;
