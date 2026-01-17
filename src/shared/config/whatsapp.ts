import { env } from './env';

export const whatsappConfig = {
  sessionStoragePath: env.whatsapp.sessionStoragePath,
  mediaStoragePath: env.whatsapp.mediaStoragePath,

  // Baileys configuration
  baileys: {
    // Use WhatsApp Web browser identifier for better compatibility
    browser: ['WhatsApp Web', 'Chrome', '127.0.0.1'] as [string, string, string],
    printQRInTerminal: false,
    syncFullHistory: true,  // Enable to get contacts with phone numbers
    markOnlineOnConnect: true, // Changed to true for better connection stability

    // Connection options
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000, // Slightly faster keepalive

    // Media settings
    generateHighQualityLinkPreview: false,

    // Additional options for better connection
    emitOwnEvents: true,
    fireInitQueries: true,
  },

  // Session management
  session: {
    qrTimeoutSeconds: 60,
    reconnectMaxAttempts: 5,
    reconnectDelayMs: 5000,
  },
};
