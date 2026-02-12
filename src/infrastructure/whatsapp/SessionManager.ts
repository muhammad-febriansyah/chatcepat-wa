import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
  proto,
  Browsers
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs-extra';
import QRCode from 'qrcode';
import { whatsappConfig } from '@shared/config/whatsapp';
import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { SocketServer } from '@infrastructure/websocket/SocketServer';
import { MessageHandler } from '@infrastructure/whatsapp/MessageHandler';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import type { ConnectionEventCallbacks } from '@application/interfaces/services/IWhatsAppClient';

@injectable()
export class SessionManager {
  private activeSessions: Map<string, WASocket> = new Map();
  private sessionCallbacks: Map<string, ConnectionEventCallbacks> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private manualDisconnect: Set<string> = new Set(); // Track manual disconnects to prevent auto-reconnect

  constructor(
    @inject(TYPES.SocketServer) private socketServer: SocketServer,
    @inject(TYPES.MessageHandler) private messageHandler: MessageHandler,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository
  ) {}

  async createSession(
    sessionId: string,
    userId: number,
    callbacks: ConnectionEventCallbacks
  ): Promise<void> {
    // Check if session already exists
    if (this.activeSessions.has(sessionId)) {
      console.warn(`Session ${sessionId} already exists`);
      return;
    }

    // Store callbacks
    this.sessionCallbacks.set(sessionId, callbacks);

    // Load or create auth state
    const authPath = path.join(whatsappConfig.sessionStoragePath, sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    console.log(`Creating WhatsApp session: ${sessionId}`);

    // Create socket connection with improved options
    // Use Browsers utility for proper browser identification
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      // Use Baileys' built-in browser identifier - more reliable
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: whatsappConfig.baileys.syncFullHistory,
      markOnlineOnConnect: whatsappConfig.baileys.markOnlineOnConnect,
      generateHighQualityLinkPreview: whatsappConfig.baileys.generateHighQualityLinkPreview,
      // Additional options for better connection stability
      connectTimeoutMs: whatsappConfig.baileys.connectTimeoutMs,
      defaultQueryTimeoutMs: whatsappConfig.baileys.defaultQueryTimeoutMs,
      keepAliveIntervalMs: whatsappConfig.baileys.keepAliveIntervalMs,
      qrTimeout: 40000, // 40 seconds QR timeout
      getMessage: async (key) => {
        // This is needed for message history
        return undefined as any;
      },
    });

    // Save credentials on update
    socket.ev.on('creds.update', saveCreds);

    // Set up event handlers
    this.setupConnectionHandlers(socket, sessionId, userId);

    // Register message handlers for auto-reply
    console.log(`✅ Registering MessageHandler for session ${sessionId}`);
    this.messageHandler.registerHandlers(sessionId, socket);
    console.log(`✅ MessageHandler registered successfully for session ${sessionId}`);

    // Store active session
    this.activeSessions.set(sessionId, socket);
    this.reconnectAttempts.set(sessionId, 0);
    console.log(`✅ Session ${sessionId} stored in activeSessions map`);
  }

  private setupConnectionHandlers(socket: WASocket, sessionId: string, userId: number): void {
    const callbacks = this.sessionCallbacks.get(sessionId);
    if (!callbacks) return;

    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code
      if (qr) {
        console.log(`📱 QR code generated for session: ${sessionId}`);
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);

          // ✅ Call callback with error handling
          try {
            callbacks.onQRCode?.(sessionId, qrCodeDataURL);
            console.log(`✅ QR code callback executed for session ${sessionId}`);
          } catch (callbackError) {
            console.error(`❌ Error in onQRCode callback for session ${sessionId}:`, callbackError);
          }

          // Emit WebSocket event
          this.socketServer.emitSessionQRCode(userId, sessionId, qrCodeDataURL);
        } catch (error) {
          console.error(`❌ Error generating QR code for ${sessionId}:`, error);
        }
      }

      // Handle connection close
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as Boom)?.message || 'Unknown error';

        // Check if this was a manual disconnect - if so, don't reconnect
        const wasManualDisconnect = this.manualDisconnect.has(sessionId);
        if (wasManualDisconnect) {
          this.manualDisconnect.delete(sessionId);
        }

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !wasManualDisconnect;

        console.log(`Session ${sessionId} closed. Status code: ${statusCode}, Error: ${errorMessage}, Should reconnect: ${shouldReconnect}`);

        // Determine user-friendly error message
        let userFriendlyReason = 'Koneksi terputus';
        let isFatalError = false;

        switch (statusCode) {
          case DisconnectReason.loggedOut:
            userFriendlyReason = 'Sesi telah logout dari WhatsApp';
            isFatalError = true;
            break;
          case DisconnectReason.badSession:
            userFriendlyReason = 'Sesi tidak valid. Silakan scan QR code baru';
            isFatalError = true;
            break;
          case DisconnectReason.connectionClosed:
            userFriendlyReason = 'Koneksi ditutup oleh WhatsApp';
            break;
          case DisconnectReason.connectionLost:
            userFriendlyReason = 'Koneksi terputus. Mencoba menghubungkan ulang...';
            break;
          case DisconnectReason.connectionReplaced:
            userFriendlyReason = 'Koneksi digantikan oleh perangkat lain';
            isFatalError = true;
            break;
          case DisconnectReason.timedOut:
            userFriendlyReason = 'Koneksi timeout. Mencoba menghubungkan ulang...';
            // Bukan fatal - cukup reconnect, jangan hapus session files
            break;
          case DisconnectReason.restartRequired:
            userFriendlyReason = 'Perlu restart. Silakan coba lagi';
            break;
          case 401:
            userFriendlyReason = 'Gagal menautkan - Autentikasi gagal';
            isFatalError = true;
            break;
          case 403:
            userFriendlyReason = 'Akses ditolak oleh WhatsApp';
            isFatalError = true;
            break;
          case 500:
            userFriendlyReason = 'Gagal menautkan - Terjadi kesalahan server';
            isFatalError = true;
            break;
          default:
            if (statusCode && statusCode >= 400) {
              userFriendlyReason = `Gagal menautkan (Error ${statusCode})`;
              isFatalError = true;
            }
        }

        // Emit connection failed event for fatal errors
        if (isFatalError) {
          console.log(`❌ Fatal connection error for session ${sessionId}: ${userFriendlyReason}`);
          this.socketServer.emitSessionConnectionFailed(userId, sessionId, userFriendlyReason, statusCode);

          // Update database to failed status
          try {
            await this.sessionRepository.update(sessionId, {
              status: 'failed',
              lastDisconnectedAt: new Date(),
              isActive: false,
              qrCode: null,
              qrExpiresAt: null,
            });
          } catch (error) {
            console.error(`❌ Error updating database for session ${sessionId}:`, error);
          }

          // Cleanup
          this.activeSessions.delete(sessionId);
          this.sessionCallbacks.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);
          await this.deleteSessionFiles(sessionId);

          callbacks.onDisconnected?.(sessionId, userFriendlyReason);
          return;
        }

        if (shouldReconnect) {
          const attempts = this.reconnectAttempts.get(sessionId) || 0;

          if (attempts < whatsappConfig.session.reconnectMaxAttempts) {
            this.reconnectAttempts.set(sessionId, attempts + 1);

            // Exponential backoff: 3s, 6s, 12s, 24s, ... max 60s
            const baseDelay = whatsappConfig.session.reconnectDelayMs;
            const maxDelay = (whatsappConfig.session as any).reconnectMaxDelayMs || 60000;
            const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);

            console.log(`Reconnecting session ${sessionId}, attempt ${attempts + 1}/${whatsappConfig.session.reconnectMaxAttempts}, wait ${delay}ms`);

            // Remove failed session from active sessions before reconnecting
            this.activeSessions.delete(sessionId);

            // Wait before reconnecting (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, delay));

            // Reconnect
            await this.createSession(sessionId, userId, callbacks);
          } else {
            // Reset counter dan coba lagi setelah jeda panjang (persistent reconnect)
            // Jangan mati selamanya - WA disconnect itu normal
            console.warn(`⚠️ Max quick reconnect attempts reached for session ${sessionId}, waiting 2 minutes before retrying...`);
            this.activeSessions.delete(sessionId);
            this.reconnectAttempts.set(sessionId, 0); // Reset counter

            // Update database ke disconnected sementara
            try {
              await this.sessionRepository.update(sessionId, {
                status: 'disconnected',
                lastDisconnectedAt: new Date(),
                isActive: false,
              });
            } catch (error) {
              console.error(`❌ Error updating database for session ${sessionId}:`, error);
            }

            this.socketServer.emitSessionDisconnected(userId, sessionId, 'Reconnecting in 2 minutes...');

            // Tunggu 2 menit lalu coba lagi
            await new Promise(resolve => setTimeout(resolve, 120000));

            // Cek apakah session masih perlu direconnect (belum manual disconnect / logout)
            if (!this.manualDisconnect.has(sessionId)) {
              console.log(`🔄 Retrying session ${sessionId} after long wait...`);
              await this.createSession(sessionId, userId, callbacks);
            }
          }
        } else {
          // Logged out or manual disconnect - remove session and clean up
          const disconnectReason = wasManualDisconnect ? 'Manual disconnect' : 'Logged out';
          console.log(`🔌 Session ${sessionId} disconnected: ${disconnectReason}`);

          this.activeSessions.delete(sessionId);
          this.sessionCallbacks.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);

          // Delete session files so QR code can be generated again (only for logout)
          if (!wasManualDisconnect) {
            await this.deleteSessionFiles(sessionId);
          }

          // Update database DIRECTLY to ensure status is synced
          // This is critical because callbacks might not be available after restart
          try {
            await this.sessionRepository.update(sessionId, {
              status: 'disconnected',
              lastDisconnectedAt: new Date(),
              isActive: false,
              qrCode: null,
              qrExpiresAt: null,
            });
            console.log(`✅ Database updated for disconnected session ${sessionId} (${disconnectReason})`);
          } catch (error) {
            console.error(`❌ Error updating database for session ${sessionId}:`, error);
          }

          callbacks.onDisconnected?.(sessionId, disconnectReason);

          // Emit WebSocket event
          this.socketServer.emitSessionDisconnected(userId, sessionId, disconnectReason);
        }
      }

      // Handle connection open
      if (connection === 'open') {
        console.log(`Session ${sessionId} connected successfully`);
        this.reconnectAttempts.set(sessionId, 0); // Reset reconnect attempts

        // Get phone number
        const phoneNumber = socket.user?.id.split(':')[0] || socket.user?.id || 'unknown';

        // ✅ UPDATE DATABASE DIRECTLY FIRST to ensure status is synced immediately
        // This prevents race condition where socket is active but DB shows disconnected
        try {
          await this.sessionRepository.update(sessionId, {
            status: 'connected',
            phoneNumber,
            lastConnectedAt: new Date(),
            qrCode: null,
            qrExpiresAt: null,
            isActive: true,
          });
          console.log(`✅ Database updated for connected session ${sessionId}`);
        } catch (error) {
          console.error(`❌ Error updating database for session ${sessionId}:`, error);
        }

        // Call callback (this is for additional processing, DB is already updated)
        try {
          callbacks.onConnected?.(sessionId, phoneNumber);
        } catch (error) {
          console.error(`❌ Error in onConnected callback for session ${sessionId}:`, error);
        }

        // Emit WebSocket event
        this.socketServer.emitSessionConnected(userId, sessionId, phoneNumber);
      }
    });
  }

  private async deleteSessionFiles(sessionId: string): Promise<void> {
    try {
      const sessionPath = path.join(whatsappConfig.sessionStoragePath, sessionId);
      const exists = await fs.pathExists(sessionPath);

      if (exists) {
        await fs.remove(sessionPath);
        console.log(`Session files deleted for ${sessionId}`);
      }
    } catch (error) {
      console.error(`Error deleting session files for ${sessionId}:`, error);
    }
  }

  getSession(sessionId: string): WASocket | null {
    return this.activeSessions.get(sessionId) || null;
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Check if session is truly connected to WhatsApp (not just socket exists)
   * A session is connected when the socket has a user property set
   */
  isSessionConnected(sessionId: string): boolean {
    const socket = this.activeSessions.get(sessionId);
    // Socket exists AND has user info (meaning WhatsApp auth is complete)
    return socket !== undefined && socket.user !== undefined;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const socket = this.activeSessions.get(sessionId);
    if (socket) {
      // Mark as manual disconnect to prevent auto-reconnect
      this.manualDisconnect.add(sessionId);

      // Just close the connection, don't logout
      await socket.end(undefined);
      this.activeSessions.delete(sessionId);
      this.sessionCallbacks.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);
      console.log(`Session ${sessionId} manually disconnected (no auto-reconnect)`);
    }
  }

  async logoutSession(sessionId: string): Promise<void> {
    const socket = this.activeSessions.get(sessionId);
    if (socket) {
      // Mark as manual disconnect to prevent any reconnect attempts
      this.manualDisconnect.add(sessionId);

      // Logout (will remove auth credentials)
      await socket.logout();
      this.activeSessions.delete(sessionId);
      this.sessionCallbacks.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);

      // Delete session files so QR code can be generated again
      await this.deleteSessionFiles(sessionId);

      console.log(`Session ${sessionId} logged out and files cleaned`);
    }
  }

  getAllActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  getSessionCount(): number {
    return this.activeSessions.size;
  }
}
