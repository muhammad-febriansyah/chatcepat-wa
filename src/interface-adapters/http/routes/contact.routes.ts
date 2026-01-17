import { Router } from 'express';
import { ContactController } from '../controllers/ContactController';

const router = Router();
const contactController = new ContactController();

/**
 * @route   POST /api/contacts/:sessionId/scrape
 * @desc    Scrape contacts from WhatsApp session (with rate limiting)
 * @access  Private
 */
router.post('/:sessionId/scrape', (req, res) => contactController.scrapeContacts(req, res));

/**
 * @route   GET /api/contacts/:sessionId
 * @desc    Get scraped contacts for a session
 * @access  Private
 */
router.get('/:sessionId', (req, res) => contactController.getSessionContacts(req, res));

/**
 * @route   GET /api/contacts/:sessionId/status
 * @desc    Get scraping status (can scrape?, cooldown, etc)
 * @access  Private
 */
router.get('/:sessionId/status', (req, res) => contactController.getScrapingStatus(req, res));

/**
 * @route   GET /api/contacts/history/all
 * @desc    Get scraping history for current user
 * @access  Private
 */
router.get('/history/all', (req, res) => contactController.getScrapingHistory(req, res));

/**
 * @route   POST /api/contacts/:sessionId/reset-cooldown
 * @desc    Reset scraping cooldown for testing purposes
 * @access  Private (Development only)
 */
router.post('/:sessionId/reset-cooldown', (req, res) => contactController.resetScrapingCooldown(req, res));

export default router;
