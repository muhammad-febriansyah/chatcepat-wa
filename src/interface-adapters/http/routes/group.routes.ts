import { Router } from 'express';
import { GroupController } from '../controllers/GroupController';

const router = Router();
const groupController = new GroupController();

/**
 * @route   POST /api/groups/:sessionId/scrape
 * @desc    Scrape groups from WhatsApp session (with rate limiting)
 * @access  Private
 */
router.post('/:sessionId/scrape', (req, res) => groupController.scrapeGroups(req, res));

/**
 * @route   GET /api/groups/:sessionId
 * @desc    Get scraped groups for a session
 * @access  Private
 */
router.get('/:sessionId', (req, res) => groupController.getSessionGroups(req, res));

/**
 * @route   POST /api/groups/members/:groupId/scrape
 * @desc    Scrape members from a specific group
 * @access  Private
 */
router.post('/members/:groupId/scrape', (req, res) => groupController.scrapeGroupMembers(req, res));

export default router;
