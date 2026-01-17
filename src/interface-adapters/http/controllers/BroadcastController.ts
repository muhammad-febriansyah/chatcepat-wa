import { Request, Response } from 'express';
import { container } from '@di/container';
import { TYPES } from '@di/types';
import { CreateBroadcastUseCase } from '@application/use-cases/broadcast/CreateBroadcastUseCase';
import { ExecuteBroadcastUseCase } from '@application/use-cases/broadcast/ExecuteBroadcastUseCase';
import { GetBroadcastCampaignsUseCase } from '@application/use-cases/broadcast/GetBroadcastCampaignsUseCase';
import { CancelBroadcastUseCase } from '@application/use-cases/broadcast/CancelBroadcastUseCase';

export class BroadcastController {
  /**
   * Create a new broadcast campaign
   */
  async createCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { whatsappSessionId, name, template, recipients, scheduledAt } = req.body;

      // Validation
      if (!whatsappSessionId || !name || !template || !recipients) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: whatsappSessionId, name, template, recipients',
        });
        return;
      }

      const useCase = container.get<CreateBroadcastUseCase>(TYPES.CreateBroadcastUseCase);
      const campaign = await useCase.execute({
        userId,
        whatsappSessionId,
        name,
        template,
        recipients,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });

      res.status(201).json({
        success: true,
        data: campaign.toJSON(),
      });
    } catch (error: any) {
      console.error('Error creating broadcast campaign:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Execute/start a broadcast campaign
   */
  async executeCampaign(req: Request, res: Response): Promise<void> {
    try {
      const { campaignId } = req.params;

      const useCase = container.get<ExecuteBroadcastUseCase>(TYPES.ExecuteBroadcastUseCase);

      // Execute in background (don't wait for completion)
      useCase.execute(parseInt(campaignId)).catch(error => {
        console.error(`Background broadcast execution failed for campaign ${campaignId}:`, error);
      });

      res.json({
        success: true,
        message: 'Broadcast campaign started',
      });
    } catch (error: any) {
      console.error('Error starting broadcast campaign:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get all broadcast campaigns for the authenticated user
   */
  async getCampaigns(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { limit, offset, status } = req.query;

      const useCase = container.get<GetBroadcastCampaignsUseCase>(TYPES.GetBroadcastCampaignsUseCase);
      const campaigns = await useCase.execute(userId, {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        status: status as string,
      });

      res.json({
        success: true,
        data: campaigns.map(c => c.toJSON()),
      });
    } catch (error: any) {
      console.error('Error getting broadcast campaigns:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get a specific broadcast campaign
   */
  async getCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { campaignId } = req.params;

      const useCase = container.get<GetBroadcastCampaignsUseCase>(TYPES.GetBroadcastCampaignsUseCase);
      const campaign = await useCase.getById(parseInt(campaignId), userId);

      if (!campaign) {
        res.status(404).json({
          success: false,
          error: 'Campaign not found',
        });
        return;
      }

      res.json({
        success: true,
        data: campaign.toJSON(),
      });
    } catch (error: any) {
      console.error('Error getting broadcast campaign:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Cancel a broadcast campaign
   */
  async cancelCampaign(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { campaignId } = req.params;

      const useCase = container.get<CancelBroadcastUseCase>(TYPES.CancelBroadcastUseCase);
      await useCase.execute(parseInt(campaignId), userId);

      res.json({
        success: true,
        message: 'Campaign cancelled successfully',
      });
    } catch (error: any) {
      console.error('Error cancelling broadcast campaign:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Get broadcast statistics
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetBroadcastCampaignsUseCase>(TYPES.GetBroadcastCampaignsUseCase);
      const statistics = await useCase.getStatistics(userId);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error: any) {
      console.error('Error getting broadcast statistics:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
