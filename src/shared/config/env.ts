import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export const env = {
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  appName: process.env.APP_NAME || 'ChatCepat-WA-Gateway',

  // Laravel Integration
  laravelApiUrl: process.env.LARAVEL_API_URL || 'http://localhost:8000',
  laravelAppUrl: process.env.LARAVEL_APP_URL || 'http://localhost:8000',
  laravelSystemToken: process.env.LARAVEL_SYSTEM_TOKEN || '',

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'chatcepat',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // API Keys
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  rajaongkirApiKeyShipping: process.env.RAJAONGKIR_API_KEY_SHIPPING || '',
  rajaongkirApiKeyDelivery: process.env.RAJAONGKIR_API_KEY_DELIVERY || '',
  bitshipApiKey: process.env.BITSHIP_API_KEY || '',

  // WhatsApp Configuration
  whatsapp: {
    sessionStoragePath: path.resolve(process.env.WA_SESSION_STORAGE_PATH || './storage/sessions'),
    mediaStoragePath: path.resolve(process.env.WA_MEDIA_STORAGE_PATH || './storage/media'),
  },

  // Rate Limiting
  rateLimit: {
    messagesPerMinute: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_MINUTE || '10', 10),
    messagesPerHour: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_HOUR || '100', 10),
    messagesPerDay: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_DAY || '1000', 10),
    minDelayMs: parseInt(process.env.RATE_LIMIT_MIN_DELAY_MS || '2000', 10),
    maxDelayMs: parseInt(process.env.RATE_LIMIT_MAX_DELAY_MS || '5000', 10),
    cooldownAfterMessages: parseInt(process.env.RATE_LIMIT_COOLDOWN_AFTER_MESSAGES || '50', 10),
    cooldownDurationMs: parseInt(process.env.RATE_LIMIT_COOLDOWN_DURATION_MS || '300000', 10),
  },

  // Broadcast Configuration
  broadcast: {
    batchSize: parseInt(process.env.BROADCAST_BATCH_SIZE || '20', 10),
    batchDelayMs: parseInt(process.env.BROADCAST_BATCH_DELAY_MS || '60000', 10),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './storage/logs/app.log',
  },

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8000').split(','),

  // Security
  apiSecretKey: process.env.API_SECRET_KEY || '',
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  // Computed values
  isDevelopment: () => env.nodeEnv === 'development',
  isProduction: () => env.nodeEnv === 'production',
};

// Validation
export function validateEnv(): void {
  const required = [
    'OPENAI_API_KEY',
    'RAJAONGKIR_API_KEY_SHIPPING',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing required environment variables: ${missing.join(', ')}`);
    console.warn('Application may not function correctly. Please check your .env file.');
  }
}
