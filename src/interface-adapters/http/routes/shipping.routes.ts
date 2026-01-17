import { Router } from 'express';
import { ShippingController } from '@adapters/http/controllers/ShippingController';

const router = Router();
const shippingController = new ShippingController();

/**
 * @route   POST /api/shipping/check
 * @desc    Check shipping cost between two cities
 * @access  Public
 *
 * @example
 * POST /api/shipping/check
 * {
 *   "origin": "jakarta",
 *   "destination": "bandung",
 *   "weight": 1000,
 *   "courier": "jne"
 * }
 */
router.post('/check', shippingController.checkShippingCost.bind(shippingController));

/**
 * @route   POST /api/shipping/check-formatted
 * @desc    Check shipping cost and get formatted WhatsApp message
 * @access  Public
 *
 * @example
 * POST /api/shipping/check-formatted
 * {
 *   "origin": "jakarta",
 *   "destination": "bandung",
 *   "weight": 1000,
 *   "courier": "jne"
 * }
 */
router.post('/check-formatted', shippingController.checkShippingCostFormatted.bind(shippingController));

/**
 * @route   GET /api/shipping/search-city?query=jakarta
 * @desc    Search for a city/destination
 * @access  Public
 */
router.get('/search-city', shippingController.searchCity.bind(shippingController));

export default router;
