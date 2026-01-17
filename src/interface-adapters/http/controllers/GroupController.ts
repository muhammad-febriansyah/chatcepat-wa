import { Request, Response } from 'express';
import { container } from '@di/container';
import { TYPES } from '@di/types';
import { ScrapeGroupsUseCase } from '@application/use-cases/groups/ScrapeGroupsUseCase';
import { GetSessionGroupsUseCase } from '@application/use-cases/groups/GetSessionGroupsUseCase';
import { ScrapeGroupMembersUseCase } from '@application/use-cases/groups/ScrapeGroupMembersUseCase';

export class GroupController {
  async scrapeGroups(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      // Get userId from request body (passed by Laravel), auth middleware, or default to 1
      const userId = req.body?.user_id || (req as any).user?.id || 1;

      const useCase = container.get<ScrapeGroupsUseCase>(TYPES.ScrapeGroupsUseCase);
      const result = await useCase.execute(userId, sessionId);

      res.json({
        success: true,
        message: result.message || 'Groups scraped successfully',
        data: {
          totalScraped: result.totalScraped,
          totalSaved: result.totalSaved,
          groups: result.groups.map(g => g.toJSON()),
        },
      });
    } catch (error: any) {
      console.error('Error scraping groups:', error);

      // Return 429 for rate limiting errors
      const statusCode = error.message.includes('wait') || error.message.includes('limit') ? 429 : 500;

      res.status(statusCode).json({
        success: false,
        error: error.message,
      });
    }
  }

  async getSessionGroups(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id || 1; // TODO: Get from auth middleware

      const useCase = container.get<GetSessionGroupsUseCase>(TYPES.GetSessionGroupsUseCase);
      const groups = await useCase.execute(userId, sessionId);

      res.json({
        success: true,
        data: groups.map(g => g.toJSON()),
      });
    } catch (error: any) {
      console.error('Error getting session groups:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async scrapeGroupMembers(req: Request, res: Response): Promise<void> {
    try {
      const { groupId } = req.params;
      const userId = req.body?.user_id || (req as any).user?.id || 1;

      const useCase = container.get<ScrapeGroupMembersUseCase>(TYPES.ScrapeGroupMembersUseCase);
      const result = await useCase.execute(userId, parseInt(groupId));

      res.json({
        success: true,
        message: `Berhasil mengambil ${result.totalMembers} anggota, ${result.totalWithPhone} dengan nomor telepon`,
        data: {
          groupId: result.groupId,
          groupName: result.groupName,
          totalMembers: result.totalMembers,
          totalSaved: result.totalSaved,
          totalWithPhone: result.totalWithPhone,
          members: result.members,
        },
      });
    } catch (error: any) {
      console.error('Error scraping group members:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
