export type BroadcastStatus =
  | 'draft'
  | 'scheduled'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BroadcastMessageType = 'text' | 'image' | 'document';

export interface BroadcastRecipient {
  phoneNumber: string;
  name?: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt?: Date;
  errorMessage?: string;
}

export interface BroadcastTemplate {
  type: BroadcastMessageType;
  content: string;
  mediaUrl?: string;
  caption?: string;
  variables?: Record<string, string>; // For personalization
}

export class BroadcastCampaign {
  constructor(
    public id: number,
    public whatsappSessionId: number,
    public userId: number,
    public name: string,
    public template: BroadcastTemplate,
    public recipients: BroadcastRecipient[],
    public status: BroadcastStatus,
    public scheduledAt: Date | null,
    public startedAt: Date | null,
    public completedAt: Date | null,
    public totalRecipients: number,
    public sentCount: number,
    public failedCount: number,
    public pendingCount: number,
    public batchSize: number,
    public batchDelayMs: number,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  static create(data: {
    whatsappSessionId: number;
    userId: number;
    name: string;
    template: BroadcastTemplate;
    recipients: BroadcastRecipient[];
    scheduledAt?: Date | null;
    batchSize?: number;
    batchDelayMs?: number;
  }): BroadcastCampaign {
    const totalRecipients = data.recipients.length;
    const batchSize = data.batchSize || 20; // From env config
    const batchDelayMs = data.batchDelayMs || 60000; // From env config

    return new BroadcastCampaign(
      0, // Will be set by database
      data.whatsappSessionId,
      data.userId,
      data.name,
      data.template,
      data.recipients,
      data.scheduledAt ? 'scheduled' : 'draft',
      data.scheduledAt || null,
      null,
      null,
      totalRecipients,
      0,
      0,
      totalRecipients,
      batchSize,
      batchDelayMs,
      new Date(),
      new Date()
    );
  }

  updateProgress(sentCount: number, failedCount: number): void {
    this.sentCount = sentCount;
    this.failedCount = failedCount;
    this.pendingCount = this.totalRecipients - sentCount - failedCount;
    this.updatedAt = new Date();
  }

  start(): void {
    this.status = 'processing';
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  complete(): void {
    this.status = 'completed';
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  fail(): void {
    this.status = 'failed';
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  cancel(): void {
    this.status = 'cancelled';
    this.updatedAt = new Date();
  }

  getProgress(): number {
    if (this.totalRecipients === 0) return 0;
    return Math.round((this.sentCount / this.totalRecipients) * 100);
  }

  canStart(): boolean {
    return this.status === 'draft' || this.status === 'scheduled';
  }

  canCancel(): boolean {
    return this.status === 'draft' || this.status === 'scheduled' || this.status === 'processing';
  }

  toJSON() {
    return {
      id: this.id,
      whatsappSessionId: this.whatsappSessionId,
      userId: this.userId,
      name: this.name,
      template: this.template,
      recipients: this.recipients,
      status: this.status,
      scheduledAt: this.scheduledAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      totalRecipients: this.totalRecipients,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
      pendingCount: this.pendingCount,
      progress: this.getProgress(),
      batchSize: this.batchSize,
      batchDelayMs: this.batchDelayMs,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
