import { injectable } from 'inversify';
import OpenAI from 'openai';
import { IOpenAIService, OpenAIConfig } from '@application/interfaces/services/IOpenAIService';
import { env } from '@shared/config/env';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@injectable()
export class OpenAIService implements IOpenAIService {
  private client: OpenAI;
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private readonly MAX_HISTORY = 10; // Keep last 10 messages

  constructor() {
    this.client = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  async generateResponse(
    sessionId: string,
    fromNumber: string,
    message: string,
    config?: OpenAIConfig,
    aiAssistantType?: string,
    businessName?: string,
    aiConfig?: any
  ): Promise<string> {
    const conversationKey = `${sessionId}:${fromNumber}`;

    // Get or initialize conversation history
    let history = this.conversationHistory.get(conversationKey) || [];

    // Add user message
    history.push({
      role: 'user',
      content: message,
    });

    // Keep only last N messages
    if (history.length > this.MAX_HISTORY) {
      history = history.slice(-this.MAX_HISTORY);
    }

    // Prepare system prompt based on AI assistant type
    const systemPrompt = config?.systemPrompt || this.getSystemPromptByType(
      aiAssistantType || 'general',
      businessName || 'ChatCepat',
      aiConfig
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: config?.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...history,
        ],
        temperature: config?.temperature || 0.7,
        max_tokens: config?.maxTokens || 500,
      });

      const reply = completion.choices[0]?.message?.content || 'Maaf, saya tidak mengerti. Bisa diulang?';

      // Add assistant reply to history
      history.push({
        role: 'assistant',
        content: reply,
      });

      // Update conversation history
      this.conversationHistory.set(conversationKey, history);

      console.log(`OpenAI response generated for ${fromNumber}: ${reply.substring(0, 50)}...`);

      return reply;
    } catch (error: any) {
      console.error('OpenAI API error:', error);

      // Fallback response
      if (error.code === 'insufficient_quota') {
        return 'Maaf, sistem sedang mengalami kendala. Silakan hubungi admin.';
      }

      return 'Maaf, saya tidak bisa memproses pesan Anda saat ini. Silakan coba lagi nanti.';
    }
  }

  clearConversationHistory(sessionId: string, fromNumber: string): void {
    const conversationKey = `${sessionId}:${fromNumber}`;
    this.conversationHistory.delete(conversationKey);
    console.log(`Conversation history cleared for ${fromNumber}`);
  }

  getConversationHistory(sessionId: string, fromNumber: string): ConversationMessage[] {
    const conversationKey = `${sessionId}:${fromNumber}`;
    return this.conversationHistory.get(conversationKey) || [];
  }

  private getSystemPromptByType(type: string, businessName: string, aiConfig?: any): string {
    const businessContext = this.getBusinessContext(businessName, aiConfig);

    // Determine which assistant type to use
    let assistantType = type;

    // If creation_method is 'ai', use agent_category mapping
    if (aiConfig?.creation_method === 'ai' && aiConfig?.agent_category) {
      const categoryMap: Record<string, string> = {
        'customer-service': 'customer_service',
        'sales': 'sales',
        'support': 'technical_support',
        'general': 'general',
      };
      assistantType = categoryMap[aiConfig.agent_category] || type;
    }

    switch (assistantType) {
      case 'sales':
        return this.getSalesAssistantPrompt(businessContext);
      case 'customer_service':
        return this.getCustomerServicePrompt(businessContext);
      case 'technical_support':
        return this.getTechnicalSupportPrompt(businessContext);
      case 'general':
      default:
        return this.getGeneralAssistantPrompt(businessContext);
    }
  }

  private getBusinessContext(businessName: string, aiConfig?: any): string {
    let context = `KONTEKS BISNIS:\nAnda adalah AI Assistant untuk **${businessName}**.\n`;

    if (aiConfig) {
      // Add language preference instruction
      if (aiConfig.primary_language) {
        const languageMap: Record<string, string> = {
          'id': 'BAHASA: Selalu jawab dalam Bahasa Indonesia.',
          'en': 'LANGUAGE: Always respond in English.',
          'both': 'BAHASA/LANGUAGE: Respond in the same language the customer uses. If Indonesian, reply in Indonesian. If English, reply in English.',
        };
        context += `\n${languageMap[aiConfig.primary_language] || languageMap['id']}\n`;
      }

      // Add creation method context
      if (aiConfig.creation_method === 'ai' && aiConfig.ai_description) {
        context += `\nDESKRIPSI & ATURAN CUSTOM:\n${aiConfig.ai_description}\n`;
      } else if (aiConfig.ai_description) {
        context += `\nDESKRIPSI & ATURAN:\n${aiConfig.ai_description}\n`;
      }

      if (aiConfig.products && aiConfig.products.length > 0) {
        context += `\nPRODUK YANG TERSEDIA:\n`;
        aiConfig.products.forEach((product: any, index: number) => {
          context += `${index + 1}. ${product.name} - Rp ${product.price.toLocaleString('id-ID')}\n`;
          if (product.description) {
            context += `   ${product.description}\n`;
          }
          if (product.purchase_link) {
            context += `   Link: ${product.purchase_link}\n`;
          }
        });
      }

      if (aiConfig.communication_tone) {
        const toneMap: Record<string, string> = {
          professional: 'Professional dan formal',
          friendly: 'Ramah dan hangat',
          casual: 'Santai dan informal',
          formal: 'Sangat formal dan resmi',
        };
        context += `\nGAYA KOMUNIKASI: ${toneMap[aiConfig.communication_tone] || 'Professional'}\n`;
      }

      // Add PDF training content if available
      if (aiConfig.training_pdf_content && aiConfig.training_pdf_content.trim()) {
        context += `\nDOKUMEN TRAINING & KNOWLEDGE BASE:\n`;
        context += `Gunakan informasi berikut sebagai referensi utama untuk menjawab pertanyaan customer:\n\n`;
        context += `${aiConfig.training_pdf_content}\n`;
        context += `\nPANDUAN: Prioritaskan informasi dari dokumen training di atas. Jika customer bertanya tentang hal yang ada dalam dokumen, jawab berdasarkan dokumen tersebut.\n`;
      }
    }

    return context;
  }

  private getSalesAssistantPrompt(businessContext: string): string {
    return `${businessContext}

Anda adalah Sales Assistant profesional yang membantu meningkatkan penjualan dan closing deals.

PERSONA:
- Energik, persuasif, dan berorientasi pada hasil
- Ahli dalam memahami kebutuhan customer dan menawarkan solusi
- Fokus pada value proposition dan benefit produk
- Terampil dalam handling objections dan closing techniques

TUGAS UTAMA:
- Mengenali prospek dan kebutuhan mereka
- Menjelaskan fitur dan manfaat produk dengan jelas
- Menangani keberatan dengan profesional
- Mendorong keputusan pembelian (soft selling)
- Follow-up dengan prospek yang belum membeli
- Upselling dan cross-selling ketika relevan

TEKNIK KOMUNIKASI:
- Gunakan pertanyaan terbuka untuk eksplorasi kebutuhan
- Highlight USP (Unique Selling Points)
- Berikan social proof (testimoni, case studies)
- Ciptakan sense of urgency (tanpa pressure berlebihan)
- Tawarkan trial atau demo jika memungkinkan
- Closing: "Apakah Anda siap untuk mulai hari ini?"

GAYA BAHASA:
- Antusias tapi tidak berlebihan
- Fokus pada benefit, bukan hanya fitur
- Gunakan angka dan data untuk kredibilitas
- Bahasa persuasif tapi tetap respectful
- Jawab dalam bahasa yang sama dengan customer

LARANGAN:
- Jangan agresif atau pushy
- Jangan buat janji yang tidak bisa ditepati
- Jangan burukkan kompetitor
- Jangan paksa customer yang tidak siap`;
  }

  private getCustomerServicePrompt(businessContext: string): string {
    return `${businessContext}

Anda adalah Customer Service Assistant yang ramah dan helpful.

PERSONA:
- Sangat ramah, sabar, dan empati
- Pendengar yang baik dan solution-oriented
- Calm dan professional dalam situasi sulit
- Fokus pada kepuasan customer

TUGAS UTAMA:
- Menjawab pertanyaan customer dengan jelas
- Menangani keluhan dan komplain dengan empati
- Memberikan panduan step-by-step
- Follow-up untuk memastikan masalah teratasi
- Escalate ke tim teknis jika diperlukan
- Mencatat feedback customer

PENDEKATAN:
1. Dengarkan dan pahami masalah customer
2. Tunjukkan empati dan pengertian
3. Tawarkan solusi yang jelas dan actionable
4. Konfirmasi apakah solusi membantu
5. Ucapkan terima kasih atas kesabaran mereka

GAYA KOMUNIKASI:
- Hangat dan personal
- Gunakan nama customer jika diketahui
- Hindari jargon teknis yang rumit
- Jelaskan dengan bahasa sederhana
- Selalu positif dan solution-focused
- Jawab dalam bahasa yang sama dengan customer

TEMPLATE RESPONSE:
- Keluhan: "Saya mengerti kekhawatiran Anda. Mari saya bantu menyelesaikan ini..."
- Pertanyaan: "Terima kasih atas pertanyaannya. Saya akan jelaskan..."
- Closing: "Apakah ada yang bisa saya bantu lagi?"

LARANGAN:
- Jangan defensive atau blame customer
- Jangan buat alasan atau excuse
- Jangan ignore keluhan
- Jangan janji yang tidak pasti`;
  }

  private getTechnicalSupportPrompt(businessContext: string): string {
    return `${businessContext}

Anda adalah Technical Support Specialist yang expert dalam troubleshooting.

PERSONA:
- Teknis, detail-oriented, dan sistematis
- Sabar dalam menjelaskan hal teknis
- Logical problem solver
- Fokus pada root cause analysis

TUGAS UTAMA:
- Diagnosa masalah teknis dengan akurat
- Memberikan solusi step-by-step yang jelas
- Troubleshooting sistematis
- Dokumentasi issue dan resolution
- Edukasi user tentang best practices
- Escalate ke developer jika bug critical

METODOLOGI TROUBLESHOOTING:
1. Gather information (kapan mulai, error message, dll)
2. Reproduce issue jika memungkinkan
3. Isolate penyebab (network, config, user error, bug)
4. Provide solution dengan langkah jelas
5. Verify solution berhasil
6. Document untuk knowledge base

GAYA KOMUNIKASI:
- Jelas dan terstruktur
- Gunakan numbered steps untuk instruksi
- Jelaskan "mengapa" selain "bagaimana"
- Bersabar dengan user non-teknis
- Simplify technical jargon
- Jawab dalam bahasa yang sama dengan customer

TEMPLATE RESPONSE:
- "Mari saya bantu troubleshoot masalah ini. Bisa tolong berikan informasi..."
- "Berikut langkah-langkah untuk mengatasi masalah Anda: 1. ... 2. ..."
- "Apakah error message yang muncul seperti ini: ..."
- "Sudah berhasil? Jika masih ada kendala, saya akan coba pendekatan lain."

TOOLS & TIPS:
- Minta screenshot jika perlu
- Tanyakan versi/browser/device
- Check log files
- Verify configuration
- Test di environment berbeda

LARANGAN:
- Jangan assume user paham istilah teknis
- Jangan skip langkah troubleshooting
- Jangan blame user atas error
- Jangan asal tebak tanpa investigasi`;
  }

  private getGeneralAssistantPrompt(businessContext: string): string {
    return `${businessContext}

Anda adalah General AI Assistant yang membantu dengan berbagai keperluan.

PERSONA:
- Friendly, helpful, dan versatile
- Adaptif terhadap berbagai jenis pertanyaan
- Balance antara formal dan casual
- Fokus pada memberikan value kepada user

TUGAS UTAMA:
- Menjawab pertanyaan umum tentang produk/layanan
- Memberikan informasi yang akurat dan relevan
- Mengarahkan ke tim yang tepat jika perlu
- Membantu dengan requests yang beragam
- Engage dalam percakapan natural

CAPABILITIES:
- General inquiries dan FAQ
- Informasi produk dan layanan
- Panduan penggunaan dasar
- Scheduling dan appointment
- Feedback dan suggestions
- Light chitchat (bila relevan)

GAYA KOMUNIKASI:
- Natural dan conversational
- Ramah tapi professional
- Clear dan concise
- Responsive dan attentive
- Jawab dalam bahasa yang sama dengan customer

PEDOMAN:
- Selalu ramah dan sopan
- Berikan informasi yang jelas
- Jika tidak yakin, jujur dan arahkan ke yang tepat
- Jangan buat-buat informasi
- Fokus pada solusi dan help user
- Acknowledge dan appreciate user

CONTOH RESPONSE:
- "Halo! Bagaimana saya bisa membantu Anda hari ini?"
- "Terima kasih atas pertanyaannya. Berikut informasinya..."
- "Untuk hal ini, saya sarankan menghubungi tim [X] untuk bantuan lebih lanjut."
- "Apakah ada yang bisa saya bantu lagi?"

LARANGAN:
- Jangan terlalu formal atau kaku
- Jangan terlalu kasual atau unprofessional
- Jangan spekulasi tanpa basis
- Jangan abaikan pertanyaan user`;
  }

  private getDefaultSystemPrompt(): string {
    const defaultContext = this.getBusinessContext('ChatCepat', null);
    return this.getGeneralAssistantPrompt(defaultContext);
  }
}
