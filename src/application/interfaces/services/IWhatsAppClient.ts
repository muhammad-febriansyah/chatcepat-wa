export interface SendMessageOptions {
  to: string;
  content: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  caption?: string;
  mimetype?: string;
  filename?: string;
}

export interface ConnectionEventCallbacks {
  onQRCode?: (sessionId: string, qr: string) => void;
  onConnected?: (sessionId: string, phoneNumber: string) => void;
  onDisconnected?: (sessionId: string, reason?: string) => void;
  onMessage?: (sessionId: string, message: any) => void;
  onMessageUpdate?: (sessionId: string, update: any) => void;
}

export interface IWhatsAppClient {
  createSession(sessionId: string, userId: number, callbacks: ConnectionEventCallbacks): Promise<void>;
  getSession(sessionId: string): any | null;
  isSessionActive(sessionId: string): boolean;
  isSessionConnected(sessionId: string): boolean;
  sendMessage(sessionId: string, options: SendMessageOptions): Promise<any>;
  sendTextMessage(sessionId: string, to: string, content: string): Promise<any>;
  disconnectSession(sessionId: string): Promise<void>;
  logoutSession(sessionId: string): Promise<void>;
  getSessionState(sessionId: string): 'active' | 'inactive' | 'connecting';
  loadAllSessions(userId: number, callbacks: ConnectionEventCallbacks): Promise<void>;
}
