export interface OpenAIConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface IOpenAIService {
  generateResponse(
    sessionId: string,
    fromNumber: string,
    message: string,
    config?: OpenAIConfig,
    aiAssistantType?: string,
    businessName?: string,
    aiConfig?: any
  ): Promise<string>;
  clearConversationHistory(sessionId: string, fromNumber: string): void;
  getConversationHistory(sessionId: string, fromNumber: string): any[];
}
