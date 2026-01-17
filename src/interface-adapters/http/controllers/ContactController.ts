import { Request, Response } from 'express';
import { container } from '@di/container';
import { TYPES } from '@di/types';
import { ScrapeContactsUseCase } from '@application/use-cases/contacts/ScrapeContactsUseCase';
import { GetSessionContactsUseCase } from '@application/use-cases/contacts/GetSessionContactsUseCase';
import { GetScrapingHistoryUseCase } from '@application/use-cases/contacts/GetScrapingHistoryUseCase';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';

export class ContactController {
  async scrapeContacts(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      // Get userId from request body (passed by Laravel), auth middleware, or default to 1
      const userId = req.body?.user_id || (req as any).user?.id || 1;

      console.log(`📋 Scrape contacts request: sessionId=${sessionId}, userId=${userId}, body=`, req.body);

      const useCase = container.get<ScrapeContactsUseCase>(TYPES.ScrapeContactsUseCase);
      const result = await useCase.execute(userId, sessionId);

      res.json({
        success: true,
        message: result.message || 'Contacts scraped successfully',
        data: {
          totalScraped: result.totalScraped,
          totalSaved: result.totalSaved,
          contacts: result.contacts.map(c => c.toJSON()),
        },
      });
    } catch (error: any) {
      console.error('Error scraping contacts:', error);

      // Return 429 for rate limiting errors
      const statusCode = error.message.includes('wait') || error.message.includes('limit') ? 429 : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getSessionContacts(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetSessionContactsUseCase>(TYPES.GetSessionContactsUseCase);
      const contacts = await useCase.execute(userId, sessionId);

      res.json({
        success: true,
        data: contacts.map(c => c.toJSON()),
      });
    } catch (error: any) {
      console.error('Error getting session contacts:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getScrapingHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetScrapingHistoryUseCase>(TYPES.GetScrapingHistoryUseCase);
      const history = await useCase.execute(userId);

      res.json({
        success: true,
        data: history,
      });
    } catch (error: any) {
      console.error('Error getting scraping history:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getScrapingStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetScrapingHistoryUseCase>(TYPES.GetScrapingHistoryUseCase);

      // Get session from repository to get session ID
      const { container: diContainer } = await import('@di/container');
      const { TYPES: diTypes } = await import('@di/types');
      const sessionRepository = diContainer.get<any>(diTypes.SessionRepository);
      const session = await sessionRepository.findByUserIdAndSessionId(userId, sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      const status = await useCase.getStatus(userId, session.id);

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error('Error getting scraping status:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Reset scraping cooldown for testing purposes
   * WARNING: Only use for development/testing!
   */
  async resetScrapingCooldown(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = req.body?.user_id || (req as any).user?.id || 1;

      console.log(`🔄 Reset scraping cooldown request: sessionId=${sessionId}, userId=${userId}`);

      // Get session from repository
      const sessionRepository = container.get<any>(TYPES.SessionRepository);
      const session = await sessionRepository.findByUserIdAndSessionId(userId, sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Session not found',
        });
        return;
      }

      // Delete scraping logs for this session
      const db = container.get<MysqlConnection>(TYPES.DatabaseConnection);
      await db.execute(
        'DELETE FROM scraping_logs WHERE user_id = ? AND whatsapp_session_id = ?',
        [userId, session.id]
      );

      console.log(`✅ Scraping cooldown reset for session ${sessionId}`);

      res.json({
        success: true,
        message: 'Scraping cooldown has been reset. You can now scrape contacts again.',
      });
    } catch (error: any) {
      console.error('Error resetting scraping cooldown:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
