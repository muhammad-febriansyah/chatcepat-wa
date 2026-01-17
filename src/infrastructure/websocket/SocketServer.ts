import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { inject, injectable } from 'inversify';
import { env } from '@shared/config/env';
import { TYPES } from '@di/types';
import type { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';

export interface SocketUser {
  userId: number;
  socketId: string;
}

@injectable()
export class SocketServer {
  private io: SocketIOServer | null = null;
  private userSockets: Map<number, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  initialize(httpServer: HttpServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: env.corsOrigins,
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    console.log('✅ Socket.IO server initialized');
  }

  private setupMiddleware(): void {
    if (!this.io) return;

    // Authentication middleware
    this.io.use((socket, next) => {
      // TODO: Implement proper JWT authentication
      // For now, accept userId from handshake query
      const userId = socket.handshake.query.userId as string;

      if (!userId) {
        return next(new Error('Authentication error: userId required'));
      }

      (socket as any).userId = parseInt(userId);
      next();
    });
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const userId = (socket as any).userId;

      console.log(`👤 User ${userId} connected (socket: ${socket.id})`);

      // Track user socket
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Join user's personal room
      socket.join(`user:${userId}`);

      // Handle client events
      this.handleClientEvents(socket);

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`👤 User ${userId} disconnected (socket: ${socket.id})`);

        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }
      });
    });
  }

  private handleClientEvents(socket: Socket): void {
    const userId = (socket as any).userId;

    // Client subscribes to specific session events
    socket.on('subscribe:session', async (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      console.log(`User ${userId} subscribed to session ${sessionId}`);

      // Check if there's an active QR code for this session and emit it
      // This handles the case where QR was generated before the client subscribed
      try {
        const session = await this.sessionRepository.findBySessionId(sessionId);
        if (session && session.qrCode && session.qrExpiresAt) {
          const now = new Date();
          // Only emit if QR code hasn't expired
          if (session.qrExpiresAt > now) {
            console.log(`📤 Emitting existing QR code to newly subscribed user ${userId} for session ${sessionId}`);
            this.emitSessionQRCode(userId, sessionId, session.qrCode);
          } else {
            console.log(`⏰ QR code for session ${sessionId} has expired`);
            console.log(`🔄 QR code expired - Baileys will generate a new one automatically`);
            // Don't need to do anything - Baileys will generate a new QR code
            // and it will be emitted via the normal flow
          }
        } else {
          console.log(`ℹ️ No QR code found for session ${sessionId} - waiting for Baileys to generate one`);
        }
      } catch (error) {
        console.error(`❌ Error checking for existing QR code:`, error);
      }
    });

    // Client unsubscribes from session events
    socket.on('unsubscribe:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      console.log(`User ${userId} unsubscribed from session ${sessionId}`);
    });

    // Client subscribes to broadcast campaign events
    socket.on('subscribe:broadcast', (campaignId: string) => {
      socket.join(`broadcast:${campaignId}`);
      console.log(`User ${userId} subscribed to broadcast ${campaignId}`);
    });

    // Client unsubscribes from broadcast events
    socket.on('unsubscribe:broadcast', (campaignId: string) => {
      socket.leave(`broadcast:${campaignId}`);
      console.log(`User ${userId} unsubscribed from broadcast ${campaignId}`);
    });

    // Ping-pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  }

  // ============================================
  // Session Events
  // ============================================

  /**
   * Emit session QR code generated
   */
  emitSessionQRCode(userId: number, sessionId: string, qrCode: string): void {
    console.log(`🔔 Emitting QR code event for session ${sessionId} to user ${userId}`);

    const payload = {
      sessionId,
      qrCodeDataURL: qrCode,
      timestamp: new Date().toISOString(),
    };

    console.log(`📡 Event payload:`, JSON.stringify(payload).substring(0, 200));

    this.emitToUser(userId, 'session:qr', payload);
    this.emitToRoom(`session:${sessionId}`, 'session:qr', payload);

    console.log(`✅ QR code event emitted to user:${userId} and session:${sessionId}`);
  }

  /**
   * Emit session connected
   */
  emitSessionConnected(userId: number, sessionId: string, phoneNumber: string): void {
    const event = {
      sessionId,
      phoneNumber,
      status: 'connected',
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'session:connected', event);
    this.emitToRoom(`session:${sessionId}`, 'session:status', event);
  }

  /**
   * Emit session disconnected
   */
  emitSessionDisconnected(userId: number, sessionId: string, reason: string): void {
    const event = {
      sessionId,
      status: 'disconnected',
      reason,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'session:disconnected', event);
    this.emitToRoom(`session:${sessionId}`, 'session:status', event);
  }

  /**
   * Emit session connection failed (e.g., QR scan failed, auth error)
   */
  emitSessionConnectionFailed(userId: number, sessionId: string, reason: string, errorCode?: number): void {
    console.log(`❌ Emitting connection failed for session ${sessionId}: ${reason}`);

    const event = {
      sessionId,
      status: 'failed',
      reason,
      errorCode,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'session:connection_failed', event);
    this.emitToRoom(`session:${sessionId}`, 'session:connection_failed', event);
  }

  /**
   * Emit session status update
   */
  emitSessionStatus(userId: number, sessionId: string, status: string, data?: any): void {
    const event = {
      sessionId,
      status,
      data,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'session:status', event);
    this.emitToRoom(`session:${sessionId}`, 'session:status', event);
  }

  // ============================================
  // Message Events
  // ============================================

  /**
   * Emit incoming message
   */
  emitIncomingMessage(userId: number, sessionId: string, message: any): void {
    const event = {
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'message:incoming', event);
    this.emitToRoom(`session:${sessionId}`, 'message:incoming', event);
  }

  /**
   * Emit message sent
   */
  emitMessageSent(userId: number, sessionId: string, message: any): void {
    const event = {
      sessionId,
      message,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'message:sent', event);
    this.emitToRoom(`session:${sessionId}`, 'message:sent', event);
  }

  /**
   * Emit message status update (delivered, read)
   */
  emitMessageStatus(userId: number, sessionId: string, messageId: string, status: string): void {
    const event = {
      sessionId,
      messageId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'message:status', event);
    this.emitToRoom(`session:${sessionId}`, 'message:status', event);
  }

  // ============================================
  // Broadcast Events
  // ============================================

  /**
   * Emit broadcast started
   */
  emitBroadcastStarted(userId: number, campaignId: number): void {
    const event = {
      campaignId,
      status: 'processing',
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'broadcast:started', event);
    this.emitToRoom(`broadcast:${campaignId}`, 'broadcast:status', event);
  }

  /**
   * Emit broadcast progress
   */
  emitBroadcastProgress(
    userId: number,
    campaignId: number,
    sentCount: number,
    failedCount: number,
    totalRecipients: number
  ): void {
    const progress = Math.round((sentCount / totalRecipients) * 100);

    const event = {
      campaignId,
      sentCount,
      failedCount,
      totalRecipients,
      progress,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'broadcast:progress', event);
    this.emitToRoom(`broadcast:${campaignId}`, 'broadcast:progress', event);
  }

  /**
   * Emit broadcast completed
   */
  emitBroadcastCompleted(
    userId: number,
    campaignId: number,
    sentCount: number,
    failedCount: number,
    totalRecipients: number
  ): void {
    const event = {
      campaignId,
      status: 'completed',
      sentCount,
      failedCount,
      totalRecipients,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'broadcast:completed', event);
    this.emitToRoom(`broadcast:${campaignId}`, 'broadcast:status', event);
  }

  /**
   * Emit broadcast failed
   */
  emitBroadcastFailed(userId: number, campaignId: number, error: string): void {
    const event = {
      campaignId,
      status: 'failed',
      error,
      timestamp: new Date().toISOString(),
    };

    this.emitToUser(userId, 'broadcast:failed', event);
    this.emitToRoom(`broadcast:${campaignId}`, 'broadcast:status', event);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private emitToUser(userId: number, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(`user:${userId}`).emit(event, data);
  }

  private emitToRoom(room: string, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(room).emit(event, data);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId: number): boolean {
    const sockets = this.userSockets.get(userId);
    return sockets ? sockets.size > 0 : false;
  }

  /**
   * Get Socket.IO server instance
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }
}
