export interface IRateLimiter {
  canSendMessage(sessionId: number): Promise<boolean>;
  calculateDelay(sessionId: number): Promise<number>;
  incrementCounter(sessionId: number): Promise<void>;
  getRemainingMessages(sessionId: number): Promise<{ perHour: number; perDay: number }>;
  isInCooldown(sessionId: number): Promise<boolean>;
  getCooldownRemaining(sessionId: number): Promise<number>;
  setCooldown(sessionId: number, durationMs: number): Promise<void>;
  resetHourlyCounter(sessionId: number): Promise<void>;
  resetDailyCounter(sessionId: number): Promise<void>;
}
