import { Request, Response } from 'express';
import { container } from '@di/container';
import { TYPES } from '@di/types';
import { IRajaOngkirService } from '@application/interfaces/services/IRajaOngkirService';

export class ShippingController {
  /**
   * Check shipping cost between two cities
   * POST /api/shipping/check
   *
   * Request body:
   * {
   *   "origin": "jakarta",
   *   "destination": "bandung",
   *   "weight": 1000,  // in grams, optional (default: 1000)
   *   "courier": "jne" // optional (default: "jne"), options: jne, pos, tiki, jnt, sicepat
   * }
   */
  async checkShippingCost(req: Request, res: Response): Promise<void> {
    try {
      const { origin, destination, weight, courier } = req.body;

      // Validation
      if (!origin || !destination) {
        res.status(400).json({
          success: false,
          error: 'Parameter origin dan destination wajib diisi',
        });
        return;
      }

      // Get RajaOngkir service from container
      const rajaOngkirService = container.get<IRajaOngkirService>(TYPES.RajaOngkirService);

      // Check shipping cost
      const costs = await rajaOngkirService.checkShippingCost(
        origin,
        destination,
        weight || 1000,
        courier || 'jne'
      );

      // Format response
      res.json({
        success: true,
        data: {
          origin,
          destination,
          weight: weight || 1000,
          courier: courier || 'jne',
          costs,
        },
      });
    } catch (error: any) {
      console.error('Error checking shipping cost:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Gagal mengecek ongkir',
      });
    }
  }

  /**
   * Search for a city/destination
   * GET /api/shipping/search-city?query=jakarta
   */
  async searchCity(req: Request, res: Response): Promise<void> {
    try {
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Parameter query wajib diisi',
        });
        return;
      }

      // Get RajaOngkir service from container
      const rajaOngkirService = container.get<IRajaOngkirService>(TYPES.RajaOngkirService);

      // Search city
      const city = await rajaOngkirService.searchCity(query);

      if (!city) {
        res.status(404).json({
          success: false,
          error: `Kota "${query}" tidak ditemukan`,
        });
        return;
      }

      res.json({
        success: true,
        data: city,
      });
    } catch (error: any) {
      console.error('Error searching city:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Gagal mencari kota',
      });
    }
  }

  /**
   * Get formatted shipping cost message (for WhatsApp)
   * POST /api/shipping/check-formatted
   *
   * Returns a formatted text message ready to send via WhatsApp
   */
  async checkShippingCostFormatted(req: Request, res: Response): Promise<void> {
    try {
      const { origin, destination, weight, courier } = req.body;

      // Validation
      if (!origin || !destination) {
        res.status(400).json({
          success: false,
          error: 'Parameter origin dan destination wajib diisi',
        });
        return;
      }

      // Get RajaOngkir service from container
      const rajaOngkirService = container.get<IRajaOngkirService>(TYPES.RajaOngkirService);

      // Check shipping cost
      const costs = await rajaOngkirService.checkShippingCost(
        origin,
        destination,
        weight || 1000,
        courier || 'jne'
      );

      // Format as WhatsApp message
      const formattedMessage = rajaOngkirService.formatShippingCostReply(costs);

      res.json({
        success: true,
        data: {
          origin,
          destination,
          weight: weight || 1000,
          courier: courier || 'jne',
          message: formattedMessage,
          costs,
        },
      });
    } catch (error: any) {
      console.error('Error checking shipping cost:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Gagal mengecek ongkir',
      });
    }
  }
}
