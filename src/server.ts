import express, { Express } from 'express';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '@shared/config/env';
import { container } from '@di/container';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { SocketServer } from '@infrastructure/websocket/SocketServer';
import { TYPES } from '@di/types';

// Routes
import sessionRoutes from '@adapters/http/routes/session.routes';
import broadcastRoutes from '@adapters/http/routes/broadcast.routes';
import shippingRoutes from '@adapters/http/routes/shipping.routes';
import contactRoutes from '@adapters/http/routes/contact.routes';
import groupRoutes from '@adapters/http/routes/group.routes';
import groupBroadcastRoutes from '@adapters/http/routes/group-broadcast.routes';

export class ExpressServer {
  private app: Express;
  private httpServer: HttpServer;
  private socketServer: SocketServer;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.socketServer = container.get<SocketServer>(TYPES.SocketServer);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: env.corsOrigins,
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Hello Express Active',
        name: 'ChatCepat WA Gateway',
        version: '1.0.0',
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // API routes
    this.app.use('/api/sessions', sessionRoutes);
    this.app.use('/api/broadcasts', broadcastRoutes);
    this.app.use('/api/shipping', shippingRoutes);
    this.app.use('/api/contacts', contactRoutes);
    this.app.use('/api/groups', groupRoutes);
    this.app.use('/api/group-broadcast', groupBroadcastRoutes);

    // Message sending routes (for Laravel compatibility)
    this.app.post('/api/send-message', async (req, res) => {
      try {
        const { sessionId, to, message } = req.body;

        if (!sessionId || !to || !message) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: sessionId, to, message',
          });
        }

        const { container } = await import('@di/container');
        const { TYPES } = await import('@di/types');
        const whatsAppClient = container.get<any>(TYPES.WhatsAppClient);

        const result = await whatsAppClient.sendMessage(sessionId, {
          to,
          content: message,
          type: 'text',
        });

        res.json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        console.error('Error sending message:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Chatbot test endpoint
    this.app.post('/api/chatbot/test', async (req, res) => {
      try {
        const { sessionId, message, aiAssistantType, settings } = req.body;

        if (!sessionId || !message) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: sessionId, message',
          });
        }

        const { container } = await import('@di/container');
        const { TYPES } = await import('@di/types');
        const openAIService = container.get<any>(TYPES.OpenAIService);

        // Build config from settings
        const config = {
          temperature: settings?.temperature || 0.7,
          maxTokens: settings?.maxTokens || 500,
          systemPrompt: settings?.customSystemPrompt || undefined,
        };

        // Generate response using OpenAI service
        // Use 'test-user' as the fromNumber for testing
        const response = await openAIService.generateResponse(
          sessionId,
          'test-user',
          message,
          config,
          aiAssistantType || 'general'
        );

        res.json({
          success: true,
          response,
        });
      } catch (error: any) {
        console.error('Error testing chatbot:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    this.app.post('/api/send-media', async (req, res) => {
      try {
        const { sessionId, to, mediaUrl, caption, mimetype, filename } = req.body;

        if (!sessionId || !to || !mediaUrl) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: sessionId, to, mediaUrl',
          });
        }

        const { container } = await import('@di/container');
        const { TYPES } = await import('@di/types');
        const whatsAppClient = container.get<any>(TYPES.WhatsAppClient);

        // Determine media type based on URL extension or mimetype
        let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
        const url = mediaUrl.toLowerCase();

        if (mimetype) {
          if (mimetype.startsWith('image/')) mediaType = 'image';
          else if (mimetype.startsWith('video/')) mediaType = 'video';
          else if (mimetype.startsWith('audio/')) mediaType = 'audio';
          else mediaType = 'document';
        } else {
          // Detect from URL extension
          if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) mediaType = 'image';
          else if (/\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(url)) mediaType = 'video';
          else if (/\.(mp3|wav|ogg|m4a|aac)(\?|$)/i.test(url)) mediaType = 'audio';
          else mediaType = 'document';
        }

        // Handle file:// protocol - read from local filesystem
        let finalMediaUrl = mediaUrl;
        if (mediaUrl.startsWith('file://')) {
          const fs = await import('fs');
          const filePath = mediaUrl.replace('file://', '');

          if (!fs.existsSync(filePath)) {
            return res.status(400).json({
              success: false,
              error: `File not found: ${filePath}`,
            });
          }

          // Read file and convert to base64 data URL
          const fileBuffer = fs.readFileSync(filePath);
          const base64 = fileBuffer.toString('base64');
          const mimeTypeForData = mimetype || 'application/octet-stream';
          finalMediaUrl = `data:${mimeTypeForData};base64,${base64}`;
        }

        const result = await whatsAppClient.sendMessage(sessionId, {
          to,
          content: caption || '',
          caption,
          mediaUrl: finalMediaUrl,
          type: mediaType,
          mimetype,
          filename,
        });

        res.json({
          success: true,
          data: result,
          messageId: result?.key?.id,
        });
      } catch (error: any) {
        console.error('Error sending media:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });

    // Error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Error:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
      });
    });
  }

  async start(): Promise<void> {
    // Test database connection
    const db = container.get<MysqlConnection>(TYPES.DatabaseConnection);
    const dbConnected = await db.testConnection();

    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Initialize WebSocket server
    this.socketServer.initialize(this.httpServer);

    // Start HTTP server
    this.httpServer.listen(env.port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 ChatCepat WA Gateway Server Started             ║
║                                                       ║
║   📡 HTTP Port: ${env.port}                                ║
║   🔌 WebSocket: Enabled                               ║
║   🌍 Environment: ${env.nodeEnv}                       ║
║   📊 Database: Connected                              ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);

      // Auto-restore connected sessions after server starts
      this.restoreSessions().catch((error) => {
        console.error('❌ Error restoring sessions:', error);
      });
    });
  }

  private async restoreSessions(): Promise<void> {
    try {
      console.log('\n🔄 Restoring connected sessions...');

      const sessionRepository = container.get<any>(TYPES.SessionRepository);
      const whatsAppClient = container.get<any>(TYPES.WhatsAppClient);

      // Get all connected sessions from database
      const sessions = await sessionRepository.findAll();
      const connectedSessions = sessions.filter((s: any) => s.status === 'connected' && s.isActive);

      if (connectedSessions.length === 0) {
        console.log('ℹ️  No connected sessions to restore.');
        return;
      }

      console.log(`📱 Found ${connectedSessions.length} connected session(s) to restore...`);

      for (const session of connectedSessions) {
        try {
          console.log(`🔌 Restoring session: ${session.sessionId} (${session.phoneNumber})`);

          await whatsAppClient.createSession(session.sessionId, session.userId, {
            onQRCode: async (sid: string, qr: string) => {
              console.log(`📱 QR code generated for session ${sid}`);
              const expiresAt = new Date(Date.now() + 60000);
              await sessionRepository.updateQRCode(sid, qr, expiresAt);
            },
            onConnected: async (sid: string, phoneNumber: string) => {
              console.log(`✅ Session ${sid} restored successfully (${phoneNumber})`);
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
              console.log(`⚠️  Session ${sid} disconnected: ${reason}`);
              await sessionRepository.update(sid, {
                status: 'disconnected',
                lastDisconnectedAt: new Date(),
                isActive: false,
                qrCode: null,
                qrExpiresAt: null,
              });
            },
          });
        } catch (error: any) {
          console.error(`❌ Error restoring session ${session.sessionId}:`, error.message);
        }
      }

      console.log('✅ Session restoration complete.\n');

      // Verify and sync session status after restoration
      setTimeout(async () => {
        try {
          console.log('🔄 Syncing session status with database...');
          const allSessions = await sessionRepository.findAll();

          for (const session of allSessions) {
            const isActive = whatsAppClient.isSessionActive(session.sessionId);

            if (isActive && session.status !== 'connected') {
              console.log(`🔄 Updating ${session.sessionId} to connected in database`);
              await sessionRepository.update(session.sessionId, {
                status: 'connected',
                isActive: true,
              });
            } else if (!isActive && session.status === 'connected') {
              console.log(`🔄 Updating ${session.sessionId} to disconnected in database`);
              await sessionRepository.update(session.sessionId, {
                status: 'disconnected',
                isActive: false,
              });
            }
          }
          console.log('✅ Session status sync complete.\n');
        } catch (error) {
          console.error('❌ Error syncing session status:', error);
        }
      }, 5000); // Wait 5 seconds after restore for connections to stabilize
    } catch (error) {
      console.error('❌ Error in restoreSessions:', error);
    }
  }

  getApp(): Express {
    return this.app;
  }
}
