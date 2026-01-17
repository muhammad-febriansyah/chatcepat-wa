import { inject, injectable } from 'inversify';
import { TYPES } from '@di/types';
import { IContactRepository, CreateContactData } from '@application/interfaces/repositories/IContactRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import { WhatsAppContact, ContactMetadata } from '@domain/entities/WhatsAppContact';
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { scrapingConfig } from '@shared/config/scraping';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface ScrapeContactsResult {
  totalScraped: number;
  totalSaved: number;
  contacts: WhatsAppContact[];
  message?: string;
}

interface ScrapingLog extends RowDataPacket {
  id: number;
  started_at: Date;
}

@injectable()
export class ScrapeContactsUseCase {
  constructor(
    @inject(TYPES.ContactRepository) private contactRepository: IContactRepository,
    @inject(TYPES.SessionRepository) private sessionRepository: ISessionRepository,
    @inject(TYPES.WhatsAppClient) private whatsappClient: IWhatsAppClient,
    @inject(TYPES.DatabaseConnection) private db: MysqlConnection
  ) {}

  async execute(userId: number, sessionId: string): Promise<ScrapeContactsResult> {
    // Verify session belongs to user
    const session = await this.sessionRepository.findByUserIdAndSessionId(userId, sessionId);
    if (!session) {
      throw new Error('Session not found or does not belong to user');
    }

    // ✅ Check database status first - more reliable than memory check
    if (!session.isConnected() || !session.isActive) {
      throw new Error(
        `Session is not connected. Current status: ${session.status}. ` +
        `Please ensure the WhatsApp session is connected before scraping contacts.`
      );
    }

    // Check rate limiting - cooldown between scrapes
    await this.checkCooldown(userId, session.id);

    // Check daily scraping limit
    await this.checkDailyLimit(userId);

    // Get the WhatsApp socket
    const socket = this.whatsappClient.getSession(sessionId);
    if (!socket || !socket.user) {
      // ✅ More descriptive error message
      const isInMemory = this.whatsappClient.isSessionActive(sessionId);
      throw new Error(
        `WhatsApp connection not available for this session. ` +
        `Database status: ${session.status}, In memory: ${isInMemory}. ` +
        `Please try reconnecting the session or contact support if the issue persists.`
      );
    }

    // Create scraping log
    const logId = await this.createScrapingLog(userId, session.id);

    const contactsToSave: CreateContactData[] = [];
    let totalScraped = 0;

    try {
      console.log(`🔍 Starting contact scraping for user ${userId}, session ${sessionId}`);

      // Track unique phone numbers to avoid duplicates
      const seenPhoneNumbers = new Set<string>();

      // ========== METHOD 1: Scrape from contact store ==========
      console.log(`\n📱 Method 1: Scraping from contact store...`);
      try {
        const contacts = socket.store?.contacts || {};
        const contactJids = Object.keys(contacts).filter(jid => jid.endsWith('@s.whatsapp.net'));
        console.log(`📊 Found ${contactJids.length} contacts in store`);

        for (const jid of contactJids) {
          if (totalScraped >= scrapingConfig.rateLimit.maxContactsPerScrape) break;

          const phoneNumber = this.cleanPhoneNumber(jid);
          if (phoneNumber && !seenPhoneNumbers.has(phoneNumber)) {
            seenPhoneNumbers.add(phoneNumber);
            const contact = contacts[jid];

            contactsToSave.push({
              userId,
              whatsappSessionId: session.id,
              phoneNumber,
              displayName: contact?.name || null,
              pushName: contact?.notify || null,
              isBusiness: false,
              isGroup: false,
              metadata: { source: 'contact_store' } as ContactMetadata,
              lastMessageAt: null,
            });
            totalScraped++;
          }
        }
        console.log(`✅ Got ${totalScraped} contacts from store`);
      } catch (e) {
        console.log(`⚠️ Could not access contact store: ${e}`);
      }

      // ========== METHOD 2: Scrape from chat list ==========
      console.log(`\n💬 Method 2: Scraping from chat list...`);
      try {
        const chatsStore = socket.store?.chats;
        if (chatsStore) {
          const chatJids = (Array.from(chatsStore.keys()) as string[]).filter(jid => jid.endsWith('@s.whatsapp.net'));
          console.log(`📊 Found ${chatJids.length} personal chats`);

          for (const jid of chatJids) {
            if (totalScraped >= scrapingConfig.rateLimit.maxContactsPerScrape) break;

            const phoneNumber = this.cleanPhoneNumber(jid as string);
            if (phoneNumber && !seenPhoneNumbers.has(phoneNumber)) {
              seenPhoneNumbers.add(phoneNumber);

              // Try to get name from contacts
              const contact = socket.store?.contacts?.[jid as string];

              contactsToSave.push({
                userId,
                whatsappSessionId: session.id,
                phoneNumber,
                displayName: contact?.name || null,
                pushName: contact?.notify || null,
                isBusiness: false,
                isGroup: false,
                metadata: { source: 'chat_list' } as ContactMetadata,
                lastMessageAt: null,
              });
              totalScraped++;
            }
          }
        }
        console.log(`✅ Total after chat list: ${totalScraped} contacts`);
      } catch (e) {
        console.log(`⚠️ Could not access chat list: ${e}`);
      }

      // ========== METHOD 3: Scrape from groups (fallback) ==========
      console.log(`\n👥 Method 3: Scraping from groups...`);
      const chats = await socket.groupFetchAllParticipating();
      const groupJids = Object.keys(chats).filter(jid => jid.endsWith('@g.us'));

      console.log(`📊 Found ${groupJids.length} groups to process`);

      // Collect all LIDs first, then batch resolve to phone numbers
      const lidToResolve: string[] = [];
      const lidToGroupMap: Map<string, { groupName: string; participant: any }[]> = new Map();

      // First pass: collect all LIDs
      for (const jid of groupJids) {
        const group = chats[jid];
        if (group && typeof group === 'object' && 'participants' in group) {
          const groupData = group as any;
          for (const participant of groupData.participants) {
            if (participant.id.includes('@lid')) {
              if (!lidToResolve.includes(participant.id)) {
                lidToResolve.push(participant.id);
              }
              if (!lidToGroupMap.has(participant.id)) {
                lidToGroupMap.set(participant.id, []);
              }
              lidToGroupMap.get(participant.id)!.push({
                groupName: groupData.subject,
                participant
              });
            }
          }
        }
      }

      console.log(`📋 Found ${lidToResolve.length} unique LIDs to resolve...`);

      // Try to resolve LIDs to phone numbers using usync query
      const lidToPhoneMap: Map<string, string> = new Map();

      if (lidToResolve.length > 0) {
        try {
          // Process in batches of 50 to avoid rate limiting
          const batchSize = 50;
          for (let i = 0; i < lidToResolve.length; i += batchSize) {
            const batch = lidToResolve.slice(i, i + batchSize);
            console.log(`🔄 Resolving LIDs batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(lidToResolve.length/batchSize)}...`);

            try {
              // Use usync to get phone numbers from LIDs
              const result = await (socket as any).query({
                tag: 'iq',
                attrs: {
                  to: '@s.whatsapp.net',
                  type: 'get',
                  xmlns: 'usync',
                },
                content: [{
                  tag: 'usync',
                  attrs: {
                    sid: `${Date.now()}`,
                    mode: 'query',
                    last: 'true',
                    index: '0',
                    context: 'interactive',
                  },
                  content: [{
                    tag: 'query',
                    attrs: {},
                    content: [{
                      tag: 'devices',
                      attrs: { version: '2' },
                    }],
                  }, {
                    tag: 'list',
                    attrs: {},
                    content: batch.map(lid => ({
                      tag: 'user',
                      attrs: {},
                      content: [{
                        tag: 'contact',
                        attrs: {},
                        content: lid.replace('@lid', ''),
                      }],
                    })),
                  }],
                }],
              });

              // Parse the result to extract phone numbers
              if (result?.content) {
                for (const item of result.content) {
                  if (item.tag === 'usync' && item.content) {
                    for (const listItem of item.content) {
                      if (listItem.tag === 'list' && listItem.content) {
                        for (const user of listItem.content) {
                          if (user.tag === 'user' && user.content) {
                            const lidNum = user.attrs?.jid?.replace('@lid', '') || '';
                            for (const contact of user.content) {
                              if (contact.tag === 'contact' && contact.attrs?.type === 'in') {
                                const phoneJid = contact.content?.toString() || '';
                                if (phoneJid && phoneJid.includes('@s.whatsapp.net')) {
                                  const lid = `${lidNum}@lid`;
                                  lidToPhoneMap.set(lid, phoneJid);
                                  console.log(`  ✅ Resolved: ${lid} -> ${phoneJid}`);
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            } catch (queryError) {
              console.log(`⚠️ Could not resolve LIDs via usync: ${queryError}`);
            }

            // Add delay between batches
            if (i + batchSize < lidToResolve.length) {
              await this.sleep(2000);
            }
          }
        } catch (e) {
          console.log(`⚠️ LID resolution failed: ${e}`);
        }
      }

      console.log(`✅ Resolved ${lidToPhoneMap.size} LIDs to phone numbers`);

      // Process groups with delay to avoid detection
      for (let i = 0; i < groupJids.length; i++) {
        const jid = groupJids[i];
        const group = chats[jid];

        if (group && typeof group === 'object' && 'participants' in group) {
          const groupData = group as any;
          console.log(`📁 Processing group: ${groupData.subject} (${groupData.participants.length} members)`);

          for (const participant of groupData.participants) {
            // Try to get phone number - either from direct JID or resolved LID
            let phoneNumber: string | null = null;
            let isLidFormat = false;

            if (participant.id.includes('@lid')) {
              // Check if we resolved this LID
              const resolvedJid = lidToPhoneMap.get(participant.id);
              if (resolvedJid) {
                phoneNumber = this.cleanPhoneNumber(resolvedJid);
              } else {
                // Save LID as identifier (without @lid suffix)
                const lidNumber = participant.id.replace('@lid', '');
                phoneNumber = `LID_${lidNumber}`;
                isLidFormat = true;
                console.log(`  📝 Saving LID as identifier: ${phoneNumber}`);
              }
            } else {
              phoneNumber = this.cleanPhoneNumber(participant.id);
            }

            if (phoneNumber && !seenPhoneNumbers.has(phoneNumber)) {
              seenPhoneNumbers.add(phoneNumber);

              // Check if we've reached the limit
              if (totalScraped >= scrapingConfig.rateLimit.maxContactsPerScrape) {
                console.log(`⚠️  Reached maximum contacts limit (${scrapingConfig.rateLimit.maxContactsPerScrape})`);
                break;
              }

              // Try to get contact info from multiple sources
              let displayName: string | null = null;
              let pushName: string | null = null;

              const contactJid = participant.id;

              // 1. Get name from participant object (Baileys group metadata)
              if (participant.name) {
                displayName = participant.name;
              }
              if (participant.notify) {
                pushName = participant.notify;
              }

              // 2. Try socket's contact store
              try {
                const contactInfo = socket.store?.contacts?.[contactJid];
                if (contactInfo) {
                  if (!displayName && contactInfo.name) {
                    displayName = contactInfo.name;
                  }
                  if (!pushName && contactInfo.notify) {
                    pushName = contactInfo.notify;
                  }
                  // Also check verifiedName for business accounts
                  if (!displayName && contactInfo.verifiedName) {
                    displayName = contactInfo.verifiedName;
                  }
                }
              } catch (e) {
                // Silently ignore - contact store may not be available
              }

              // 3. Try to get from socket's authState contacts (if available)
              try {
                if (socket.authState?.creds?.me?.name && contactJid === socket.user?.id) {
                  // This is our own number
                  pushName = socket.authState.creds.me.name;
                }
              } catch (e) {
                // Ignore
              }

              // 4. Check if there's a cached message with pushName for this contact
              try {
                const messages = socket.store?.messages?.[contactJid];
                if (messages) {
                  // Get most recent message to find pushName
                  const recentMessages = Array.from(messages.values()).slice(-5);
                  for (const msg of recentMessages) {
                    const msgData = msg as any;
                    if (msgData.pushName && !pushName) {
                      pushName = msgData.pushName;
                      break;
                    }
                  }
                }
              } catch (e) {
                // Ignore - messages store may not be available
              }

              contactsToSave.push({
                userId,
                whatsappSessionId: session.id,
                phoneNumber,
                displayName,
                pushName,
                isBusiness: false,
                isGroup: false,
                metadata: {
                  source: 'group',
                  fromGroup: groupData.subject,
                  jid: participant.id,
                  isLidFormat: isLidFormat,
                } as ContactMetadata,
                lastMessageAt: null,
              });
              totalScraped++;
            }
          }
        }

        // Add random delay between groups to avoid detection
        if (i < groupJids.length - 1) {
          const delay = this.getRandomDelay(
            scrapingConfig.delays.minDelayBetweenGroups,
            scrapingConfig.delays.maxDelayBetweenGroups
          );
          console.log(`⏳ Waiting ${delay}ms before processing next group...`);
          await this.sleep(delay);
        }

        // Check if we've reached the limit
        if (totalScraped >= scrapingConfig.rateLimit.maxContactsPerScrape) {
          break;
        }
      }

      // Count contacts with names
      const withDisplayName = contactsToSave.filter(c => c.displayName).length;
      const withPushName = contactsToSave.filter(c => c.pushName).length;
      const withAnyName = contactsToSave.filter(c => c.displayName || c.pushName).length;

      console.log(`✅ Scraped ${totalScraped} unique contacts`);
      console.log(`📛 Contacts with display_name: ${withDisplayName}`);
      console.log(`📛 Contacts with push_name: ${withPushName}`);
      console.log(`📛 Contacts with any name: ${withAnyName} (${Math.round(withAnyName/totalScraped*100)}%)`);

      // Save contacts in batches to avoid overload
      const totalSaved = await this.saveContactsInBatches(contactsToSave);

      // Update scraping log
      await this.updateScrapingLog(logId, 'completed', totalScraped);

      // Fetch saved contacts to return
      const savedContacts = await this.contactRepository.findByUserIdAndSessionId(
        userId,
        session.id
      );

      const message = totalScraped >= scrapingConfig.rateLimit.maxContactsPerScrape
        ? `Scraped maximum allowed contacts (${scrapingConfig.rateLimit.maxContactsPerScrape}). Some contacts may not have been scraped.`
        : undefined;

      return {
        totalScraped,
        totalSaved,
        contacts: savedContacts,
        message,
      };
    } catch (error) {
      console.error('❌ Error scraping contacts:', error);
      await this.updateScrapingLog(
        logId,
        'failed',
        totalScraped,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(`Failed to scrape contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async checkCooldown(userId: number, sessionId: number): Promise<void> {
    const cooldownMs = scrapingConfig.rateLimit.cooldownBetweenScrapes;
    const lastScrape = await this.db.queryOne<ScrapingLog>(
      `SELECT id, started_at FROM scraping_logs
       WHERE user_id = ? AND whatsapp_session_id = ? AND status = 'completed'
       ORDER BY started_at DESC LIMIT 1`,
      [userId, sessionId]
    );

    if (lastScrape) {
      const timeSinceLastScrape = Date.now() - new Date(lastScrape.started_at).getTime();
      if (timeSinceLastScrape < cooldownMs) {
        const remainingTime = Math.ceil((cooldownMs - timeSinceLastScrape) / 1000 / 60);
        throw new Error(
          `Mohon tunggu ${remainingTime} menit sebelum scraping lagi. Ini untuk mencegah akun Anda diblokir.`
        );
      }
    }
  }

  private async checkDailyLimit(userId: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM scraping_logs
       WHERE user_id = ? AND status = 'completed' AND started_at >= ?`,
      [userId, today]
    );

    if (count && count.count >= scrapingConfig.rateLimit.maxScrapesPerDay) {
      throw new Error(
        `Batas scraping harian tercapai (${scrapingConfig.rateLimit.maxScrapesPerDay} scraping per hari). Silakan coba lagi besok.`
      );
    }
  }

  private async createScrapingLog(userId: number, sessionId: number): Promise<number> {
    const result = await this.db.execute(
      `INSERT INTO scraping_logs (user_id, whatsapp_session_id, status, started_at)
       VALUES (?, ?, 'in_progress', NOW())`,
      [userId, sessionId]
    );
    return result.insertId;
  }

  private async updateScrapingLog(
    logId: number,
    status: 'completed' | 'failed',
    totalScraped: number,
    errorMessage?: string
  ): Promise<void> {
    await this.db.execute(
      `UPDATE scraping_logs
       SET status = ?, total_scraped = ?, completed_at = NOW(), error_message = ?
       WHERE id = ?`,
      [status, totalScraped, errorMessage || null, logId]
    );
  }

  private async saveContactsInBatches(contacts: CreateContactData[]): Promise<number> {
    if (contacts.length === 0) {
      return 0;
    }

    const batchSize = scrapingConfig.batch.contactsPerBatch;
    let totalSaved = 0;

    console.log(`💾 Saving ${contacts.length} contacts in batches of ${batchSize}...`);

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      const saved = await this.contactRepository.createBulk(batch);
      totalSaved += saved;

      console.log(`💾 Saved batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(contacts.length / batchSize)} (${saved} contacts)`);

      // Add delay between batches
      if (i + batchSize < contacts.length) {
        await this.sleep(scrapingConfig.delays.batchSaveDelay);
      }
    }

    console.log(`✅ Total saved: ${totalSaved} contacts`);
    return totalSaved;
  }

  private cleanPhoneNumber(jid: string): string | null {
    console.log(`🔍 Processing JID: ${jid}`);

    // Skip LID format JIDs (WhatsApp Linked ID, not real phone numbers)
    // LID format: "123456789:12@lid" or ends with @lid
    if (jid.includes('@lid')) {
      console.log(`  ❌ Skipped: LID format`);
      return null;
    }

    // Handle JIDs with device suffix like "62812xxx:123@s.whatsapp.net"
    // Extract just the phone number part
    let cleanJid = jid;
    if (jid.includes(':') && jid.includes('@s.whatsapp.net')) {
      cleanJid = jid.split(':')[0] + '@s.whatsapp.net';
      console.log(`  🔄 Cleaned device suffix: ${cleanJid}`);
    }

    // Only accept @s.whatsapp.net JIDs (personal numbers)
    if (!cleanJid.endsWith('@s.whatsapp.net')) {
      console.log(`  ❌ Skipped: Not @s.whatsapp.net (got: ${cleanJid})`);
      return null;
    }

    // Extract phone number from JID (e.g., "6281234567890@s.whatsapp.net" -> "6281234567890")
    const match = cleanJid.match(/^(\d+)@s\.whatsapp\.net$/);
    if (!match) {
      console.log(`  ❌ Skipped: Could not extract number from ${cleanJid}`);
      return null;
    }

    const phoneNumber = match[1];

    // Validate phone number length (should be 10-15 digits)
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
      console.log(`⚠️ Skipping invalid phone number length: ${phoneNumber} (${phoneNumber.length} digits)`);
      return null;
    }

    // Validate it looks like a real phone number
    // Valid country codes are typically 1-3 digits
    // Indonesia: 62, US: 1, UK: 44, etc.
    // Skip numbers that don't start with valid patterns
    const validPrefixes = [
      '62',   // Indonesia
      '1',    // USA/Canada
      '44',   // UK
      '91',   // India
      '60',   // Malaysia
      '65',   // Singapore
      '66',   // Thailand
      '84',   // Vietnam
      '63',   // Philippines
      '81',   // Japan
      '82',   // South Korea
      '86',   // China
      '61',   // Australia
      '64',   // New Zealand
      '33',   // France
      '49',   // Germany
      '39',   // Italy
      '34',   // Spain
      '31',   // Netherlands
      '7',    // Russia
      '971',  // UAE
      '966',  // Saudi Arabia
      '20',   // Egypt
      '27',   // South Africa
      '55',   // Brazil
      '52',   // Mexico
    ];

    const hasValidPrefix = validPrefixes.some(prefix => phoneNumber.startsWith(prefix));
    if (!hasValidPrefix) {
      console.log(`  ⚠️ Skipping number with unknown country code: ${phoneNumber}`);
      return null;
    }

    console.log(`  ✅ Valid phone number: ${phoneNumber}`);
    return phoneNumber;
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
