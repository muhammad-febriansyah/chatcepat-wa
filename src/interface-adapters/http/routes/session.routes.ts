import { Router } from 'express';
import { SessionController } from '../controllers/SessionController';

const router = Router();
const controller = new SessionController();

/**
 * @route POST /api/sessions
 * @desc Create new WhatsApp session
 * @body { name: string, webhookUrl?: string, settings?: any }
 */
router.post('/', (req, res) => controller.createSession(req, res));

/**
 * @route GET /api/sessions
 * @desc Get all sessions for authenticated user
 * @query active=true (optional) - Get only active sessions
 */
router.get('/', (req, res) => controller.getUserSessions(req, res));

/**
 * @route GET /api/sessions/:sessionId/status
 * @desc Get real-time status of a specific session (checks both DB and in-memory socket)
 */
router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { container } = await import('@di/container');
    const { TYPES } = await import('@di/types');

    const sessionRepository = container.get<any>(TYPES.SessionRepository);
    const whatsAppClient = container.get<any>(TYPES.WhatsAppClient);

    // Get session from database
    const session = await sessionRepository.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check if socket is actually CONNECTED to WhatsApp (not just exists in memory)
    // isSessionConnected checks if socket.user is set (meaning auth is complete)
    const isSocketConnected = whatsAppClient.isSessionConnected?.(sessionId) ?? false;
    const isSocketActive = whatsAppClient.isSessionActive(sessionId);

    // Only update to connected if socket is TRULY connected (has user info)
    if (isSocketConnected && session.status !== 'connected') {
      await sessionRepository.update(sessionId, {
        status: 'connected',
        isActive: true,
      });
      // Refresh session data after update
      const updatedSession = await sessionRepository.findBySessionId(sessionId);
      if (updatedSession) {
        return res.json({
          success: true,
          data: {
            sessionId,
            status: 'connected',
            isConnected: true,
            isActive: true,
            phoneNumber: updatedSession.phoneNumber,
            lastConnectedAt: updatedSession.lastConnectedAt,
            lastDisconnectedAt: updatedSession.lastDisconnectedAt,
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        sessionId,
        status: session.status,
        isConnected: isSocketConnected,
        isActive: isSocketActive,
        phoneNumber: session.phoneNumber,
        lastConnectedAt: session.lastConnectedAt,
        lastDisconnectedAt: session.lastDisconnectedAt,
      },
    });
  } catch (error: any) {
    console.error('Error getting session status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route GET /api/sessions/:sessionId/qr
 * @desc Get QR code for session
 */
router.get('/:sessionId/qr', (req, res) => controller.getQRCode(req, res));

/**
 * @route POST /api/sessions/:sessionId/connect
 * @desc Reconnect/restart a session (generates new QR code)
 */
router.post('/:sessionId/connect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.id || 1;

    const { container } = await import('@di/container');
    const { TYPES } = await import('@di/types');

    const sessionRepository = container.get<any>(TYPES.SessionRepository);
    const whatsAppClient = container.get<any>(TYPES.WhatsAppClient);

    // Check if session exists in database
    const session = await sessionRepository.findBySessionId(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check if session is already active in memory
    const isActive = whatsAppClient.isSessionActive(sessionId);

    if (!isActive) {
      console.log(`🔄 Starting/Reconnecting session ${sessionId}`);

      // Cleanup old session files first to ensure fresh QR code
      const path = await import('path');
      const fs = await import('fs-extra');
      const { whatsappConfig } = await import('@shared/config/whatsapp');

      const sessionPath = path.join(whatsappConfig.sessionStoragePath, sessionId);
      const exists = await fs.pathExists(sessionPath);

      if (exists) {
        await fs.remove(sessionPath);
        console.log(`✅ Cleaned up old session files for ${sessionId}`);
      }

      // Create session (will start Baileys connection and generate QR code)
      await whatsAppClient.createSession(sessionId, userId, {
        onQRCode: async (sid: string, qr: string) => {
          console.log(`QR code generated for session ${sid}`);
          const expiresAt = new Date(Date.now() + 60000);
          await sessionRepository.updateQRCode(sid, qr, expiresAt);
        },
        onConnected: async (sid: string, phoneNumber: string) => {
          console.log(`Session ${sid} connected with number ${phoneNumber}`);
          await sessionRepository.update(sid, {
            status: 'connected',
            phoneNumber,
            lastConnectedAt: new Date(),
            qrCode: null,
            qrExpiresAt: null,
            isActive: true,
          });
        },
        onDisconnected: async (sid: string, reason: string) => {
          console.log(`Session ${sid} disconnected: ${reason}`);
          await sessionRepository.update(sid, {
            status: 'disconnected',
            lastDisconnectedAt: new Date(),
            isActive: false,
            qrCode: null,
            qrExpiresAt: null,
          });
        },
      });
    } else {
      console.log(`ℹ️ Session ${sessionId} is already active`);
    }

    res.json({
      success: true,
      message: 'Session is connecting',
      data: {
        sessionId,
        isActive: true,
      },
    });
  } catch (error: any) {
    console.error('Error connecting session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @route POST /api/sessions/:sessionId/disconnect
 * @desc Disconnect session (POST alternative for easier integration)
 * @body { logout?: boolean } - If true, logout (remove auth), otherwise just disconnect
 */
router.post('/:sessionId/disconnect', (req, res) => controller.disconnectSession(req, res));

/**
 * @route DELETE /api/sessions/:sessionId
 * @desc Disconnect session
 * @body { logout?: boolean } - If true, logout (remove auth), otherwise just disconnect
 */
router.delete('/:sessionId', (req, res) => controller.disconnectSession(req, res));

/**
 * @route POST /api/sessions/:sessionId/cleanup
 * @desc Force cleanup session files (for manual cleanup after logout issues)
 */
router.post('/:sessionId/cleanup', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user?.id || 1;

    const { container } = await import('@di/container');
    const { TYPES } = await import('@di/types');
    const path = await import('path');
    const fs = await import('fs-extra');

    const sessionRepository = container.get<any>(TYPES.SessionRepository);
    const { whatsappConfig } = await import('@shared/config/whatsapp');

    // Verify session belongs to user
    const session = await sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied',
      });
    }

    // Delete session files
    const sessionPath = path.join(whatsappConfig.sessionStoragePath, sessionId);
    const exists = await fs.pathExists(sessionPath);

    if (exists) {
      await fs.remove(sessionPath);
      console.log(`✅ Session files forcefully deleted for ${sessionId}`);

      res.json({
        success: true,
        message: 'Session files deleted successfully',
        data: {
          sessionId,
          path: sessionPath,
          deleted: true,
        },
      });
    } else {
      res.json({
        success: true,
        message: 'Session files already deleted',
        data: {
          sessionId,
          path: sessionPath,
          deleted: false,
        },
      });
    }
  } catch (error: any) {
    console.error('Error cleaning up session files:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
