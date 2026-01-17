import { RateLimitState } from '@domain/entities/RateLimitState';

export interface IRateLimitRepository {
  findBySessionId(sessionId: number): Promise<RateLimitState | null>;
  getOrCreate(sessionId: number): Promise<RateLimitState>;
  incrementMessageCount(sessionId: number): Promise<void>;
  resetHourCount(sessionId: number): Promise<void>;
  resetDailyCount(sessionId: number): Promise<void>;
  setCooldown(sessionId: number, cooldownUntil: Date): Promise<void>;
  clearCooldown(sessionId: number): Promise<void>;
}
