import { Request, Response } from 'express';
import { container } from '@di/container';
import { TYPES } from '@di/types';
import { CreateSessionUseCase } from '@application/use-cases/session/CreateSessionUseCase';
import { GetSessionQRCodeUseCase } from '@application/use-cases/session/GetSessionQRCodeUseCase';
import { GetUserSessionsUseCase } from '@application/use-cases/session/GetUserSessionsUseCase';
import { DisconnectSessionUseCase } from '@application/use-cases/session/DisconnectSessionUseCase';
import { UpdateSessionAIConfigUseCase } from '@application/use-cases/session/UpdateSessionAIConfigUseCase';

export class SessionController {
  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const { userId, name, webhookUrl, settings } = req.body;

      // Use userId from request body if provided, otherwise try auth middleware, fallback to 1
      const finalUserId = userId || (req as any).user?.id || 1;

      const useCase = container.get<CreateSessionUseCase>(TYPES.CreateSessionUseCase);
      const session = await useCase.execute({
        userId: finalUserId,
        name,
        webhookUrl,
        settings,
      });

      res.status(201).json({
        success: true,
        data: session.toJSON(),
      });
    } catch (error: any) {
      console.error('Error creating session:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const activeOnly = req.query.active === 'true';

      const useCase = container.get<GetUserSessionsUseCase>(TYPES.GetUserSessionsUseCase);
      const sessions = await useCase.execute(userId, { activeOnly });

      res.json({
        success: true,
        data: sessions.map(s => s.toJSON()),
      });
    } catch (error: any) {
      console.error('Error getting user sessions:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getQRCode(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetSessionQRCodeUseCase>(TYPES.GetSessionQRCodeUseCase);
      const result = await useCase.execute(sessionId, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error getting QR code:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async disconnectSession(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const logout = req.body.logout === true;

      const useCase = container.get<DisconnectSessionUseCase>(TYPES.DisconnectSessionUseCase);
      await useCase.execute(sessionId, userId, logout);

      res.json({
        success: true,
        message: `Session ${logout ? 'logged out' : 'disconnected'} successfully`,
      });
    } catch (error: any) {
      console.error('Error disconnecting session:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async updateAIConfig(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { aiConfig } = req.body;

      if (!aiConfig) {
        res.status(400).json({
          success: false,
          error: 'aiConfig is required',
        });
        return;
      }

      const useCase = container.get<UpdateSessionAIConfigUseCase>(TYPES.UpdateSessionAIConfigUseCase);
      const session = await useCase.execute({
        sessionId,
        userId,
        aiConfig,
      });

      res.json({
        success: true,
        message: 'AI configuration updated successfully',
        data: session.toJSON(),
      });
    } catch (error: any) {
      console.error('Error updating AI config:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware
      const { settings, customSystemPrompt, aiConfig } = req.body;

      // Support both old format (customSystemPrompt) and new format (aiConfig)
      let updateData: any = {};

      if (settings) {
        updateData.settings = settings;
      }

      // If customSystemPrompt is provided (old format), convert to aiConfig
      if (customSystemPrompt) {
        const useCase = container.get<UpdateSessionAIConfigUseCase>(TYPES.UpdateSessionAIConfigUseCase);
        const session = await useCase.execute({
          sessionId,
          userId,
          aiConfig: {
            ai_description: customSystemPrompt,
          },
        });

        return res.json({
          success: true,
          message: 'Settings updated successfully',
          data: session.toJSON(),
        });
      }

      // If aiConfig is provided (new format)
      if (aiConfig) {
        const useCase = container.get<UpdateSessionAIConfigUseCase>(TYPES.UpdateSessionAIConfigUseCase);
        const session = await useCase.execute({
          sessionId,
          userId,
          aiConfig,
        });

        return res.json({
          success: true,
          message: 'Settings updated successfully',
          data: session.toJSON(),
        });
      }

      // If only settings is provided
      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No settings to update',
        });
        return;
      }

      const sessionRepository = container.get<any>(TYPES.SessionRepository);
      const session = await sessionRepository.findByUserIdAndSessionId(userId, sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found or access denied',
        });
        return;
      }

      const updatedSession = await sessionRepository.update(sessionId, updateData);

      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: updatedSession.toJSON(),
      });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
