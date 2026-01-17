export interface HourlyBucket {
  hour: string; // ISO hour string
  count: number;
}

export class RateLimitState {
  constructor(
    public readonly id: number,
    public readonly whatsappSessionId: number,
    public messagesSentLastHour: number,
    public messagesSentToday: number,
    public lastMessageSentAt: Date | null,
    public cooldownUntil: Date | null,
    public hourlyBuckets: HourlyBucket[] | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  isInCooldown(): boolean {
    return this.cooldownUntil !== null && this.cooldownUntil > new Date();
  }

  canSendMessage(limits: { perHour: number; perDay: number }): boolean {
    if (this.isInCooldown()) {
      return false;
    }

    if (this.messagesSentLastHour >= limits.perHour) {
      return false;
    }

    if (this.messagesSentToday >= limits.perDay) {
      return false;
    }

    return true;
  }

  incrementCounters(): void {
    this.messagesSentLastHour++;
    this.messagesSentToday++;
    this.lastMessageSentAt = new Date();
  }

  setCooldown(durationMs: number): void {
    this.cooldownUntil = new Date(Date.now() + durationMs);
  }

  resetHourlyCounter(): void {
    this.messagesSentLastHour = 0;
  }

  resetDailyCounter(): void {
    this.messagesSentToday = 0;
  }

  getCooldownRemainingMs(): number {
    if (!this.isInCooldown()) {
      return 0;
    }
    return this.cooldownUntil!.getTime() - Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      whatsappSessionId: this.whatsappSessionId,
      messagesSentLastHour: this.messagesSentLastHour,
      messagesSentToday: this.messagesSentToday,
      lastMessageSentAt: this.lastMessageSentAt,
      cooldownUntil: this.cooldownUntil,
      hourlyBuckets: this.hourlyBuckets,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
