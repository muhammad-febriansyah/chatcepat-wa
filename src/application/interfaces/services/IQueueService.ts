export interface QueueMessageData {
  sessionId: string;
  to: string;
  content: string;
  type?: 'text' | 'image' | 'document';
  mediaUrl?: string;
  isAutoReply?: boolean;
  autoReplySource?: string;
}

export interface QueueOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: number;
}

export interface IQueueService {
  addMessageToQueue(data: QueueMessageData, options?: QueueOptions): Promise<void>;
  addBroadcastToQueue(broadcastId: number): Promise<void>;
  getQueueStats(): Promise<{ waiting: number; active: number; completed: number; failed: number }>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  clearQueue(): Promise<void>;
}
