import { env } from '../config/env';

export const RATE_LIMITS = {
  // Message limits per session
  MESSAGES_PER_MINUTE: env.rateLimit.messagesPerMinute,
  MESSAGES_PER_HOUR: env.rateLimit.messagesPerHour,
  MESSAGES_PER_DAY: env.rateLimit.messagesPerDay,

  // Delays (in milliseconds)
  MIN_DELAY_MS: env.rateLimit.minDelayMs,
  MAX_DELAY_MS: env.rateLimit.maxDelayMs,
  RANDOM_JITTER_MS: 1000, // 0-1 second random jitter

  // Cooldowns
  COOLDOWN_AFTER_MESSAGES: env.rateLimit.cooldownAfterMessages,
  COOLDOWN_DURATION_MS: env.rateLimit.cooldownDurationMs,

  // Broadcast specific
  BROADCAST_BATCH_SIZE: env.broadcast.batchSize,
  BROADCAST_BATCH_DELAY_MS: env.broadcast.batchDelayMs,

  // Warning thresholds (80% of limit)
  WARNING_THRESHOLD_HOUR: Math.floor(env.rateLimit.messagesPerHour * 0.8),
  WARNING_THRESHOLD_DAY: Math.floor(env.rateLimit.messagesPerDay * 0.8),
} as const;
