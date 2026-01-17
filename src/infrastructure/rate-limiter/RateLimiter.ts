import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IRateLimitRepository } from '@application/interfaces/repositories/IRateLimitRepository';
import { env } from '@shared/config/env';

export interface RateLimitConfig {
  messagesPerMinute: number;
  messagesPerHour: number;
  messagesPerDay: number;
  minDelayMs: number;
  maxDelayMs: number;
  cooldownAfterMessages: number;
  cooldownDurationMs: number;
}

export interface RateLimitCheckResult {
  canSend: boolean;
  delayMs: number;
  reason?: string;
}

@injectable()
export class RateLimiter {
  private readonly config: RateLimitConfig;

  constructor(
    @inject(TYPES.RateLimitRepository) private rateLimitRepository: IRateLimitRepository
  ) {
    this.config = {
      messagesPerMinute: env.rateLimit.messagesPerMinute,
      messagesPerHour: env.rateLimit.messagesPerHour,
      messagesPerDay: env.rateLimit.messagesPerDay,
      minDelayMs: env.rateLimit.minDelayMs,
      maxDelayMs: env.rateLimit.maxDelayMs,
      cooldownAfterMessages: env.rateLimit.cooldownAfterMessages,
      cooldownDurationMs: env.rateLimit.cooldownDurationMs,
    };
  }

  /**
   * Check if a message can be sent and calculate delay
   */
  async checkRateLimit(sessionId: number): Promise<RateLimitCheckResult> {
    const state = await this.rateLimitRepository.getOrCreate(sessionId);

    // Reset counters if needed
    await this.resetCountersIfNeeded(sessionId, state);

    // Check if in cooldown
    if (state.cooldownUntil && new Date() < state.cooldownUntil) {
      const remainingMs = state.cooldownUntil.getTime() - Date.now();
      return {
        canSend: false,
        delayMs: remainingMs,
        reason: `In cooldown for ${Math.ceil(remainingMs / 1000)}s`,
      };
    }

    // Check per-hour limit
    if (state.messagesSentLastHour >= this.config.messagesPerHour) {
      return {
        canSend: false,
        delayMs: 3600000, // Wait 1 hour
        reason: 'Per-hour limit reached',
      };
    }

    // Check per-day limit
    if (state.messagesSentToday >= this.config.messagesPerDay) {
      return {
        canSend: false,
        delayMs: 86400000, // Wait 24 hours
        reason: 'Daily limit reached',
      };
    }

    // Calculate adaptive delay based on current usage
    const delayMs = this.calculateAdaptiveDelay(state);

    return {
      canSend: true,
      delayMs,
    };
  }

  /**
   * Record that a message was sent
   */
  async recordMessageSent(sessionId: number): Promise<void> {
    await this.rateLimitRepository.incrementMessageCount(sessionId);

    // Check if cooldown should be triggered
    const state = await this.rateLimitRepository.getOrCreate(sessionId);

    if (state.messagesSentLastHour >= this.config.cooldownAfterMessages) {
      const cooldownUntil = new Date(Date.now() + this.config.cooldownDurationMs);
      await this.rateLimitRepository.setCooldown(sessionId, cooldownUntil);
      console.log(`Cooldown triggered for session ${sessionId} until ${cooldownUntil.toISOString()}`);
    }
  }

  /**
   * Calculate adaptive delay based on usage
   * More messages sent = longer delay
   */
  private calculateAdaptiveDelay(state: any): number {
    const { minDelayMs, maxDelayMs, messagesPerHour } = this.config;

    // Calculate usage ratio (0 to 1) based on hourly limit
    const hourlyUsageRatio = state.messagesSentLastHour / messagesPerHour;

    // Adaptive delay: increase as we approach limit
    // At 0% usage: minDelay
    // At 50% usage: midpoint
    // At 90%+ usage: maxDelay
    let baseDelay = minDelayMs + (maxDelayMs - minDelayMs) * hourlyUsageRatio;

    // Add random jitter (±20%) for human-like behavior
    const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
    const finalDelay = baseDelay + jitter;

    // Ensure within bounds
    return Math.max(minDelayMs, Math.min(maxDelayMs, finalDelay));
  }

  /**
   * Reset counters if time windows have passed
   */
  private async resetCountersIfNeeded(sessionId: number, state: any): Promise<void> {
    const now = new Date();
    const lastMessageSentAt = state.lastMessageSentAt ? new Date(state.lastMessageSentAt) : null;

    if (!lastMessageSentAt) {
      return; // No messages sent yet
    }

    // Reset hour counter if more than 1 hour has passed
    const hoursSince = (now.getTime() - lastMessageSentAt.getTime()) / 3600000;
    if (hoursSince >= 1) {
      await this.rateLimitRepository.resetHourCount(sessionId);
    }

    // Reset daily counter if more than 24 hours have passed
    const daysSince = (now.getTime() - lastMessageSentAt.getTime()) / 86400000;
    if (daysSince >= 1) {
      await this.rateLimitRepository.resetDailyCount(sessionId);
    }

    // Clear cooldown if expired
    if (state.cooldownUntil && now >= new Date(state.cooldownUntil)) {
      await this.rateLimitRepository.clearCooldown(sessionId);
    }
  }

  /**
   * Wait for the calculated delay
   */
  async waitForDelay(delayMs: number): Promise<void> {
    if (delayMs <= 0) return;

    console.log(`⏳ Waiting ${Math.round(delayMs / 1000)}s before sending message...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Get current rate limit state for a session
   */
  async getRateLimitState(sessionId: number) {
    return await this.rateLimitRepository.getOrCreate(sessionId);
  }
}
