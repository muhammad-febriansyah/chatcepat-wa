import { WhatsAppContact, ContactMetadata } from '@domain/entities/WhatsAppContact';

export interface CreateContactData {
  userId: number;
  whatsappSessionId: number;
  phoneNumber: string;
  displayName: string | null;
  pushName: string | null;
  isBusiness: boolean;
  isGroup: boolean;
  metadata: ContactMetadata | null;
  lastMessageAt: Date | null;
}

export interface IContactRepository {
  create(contact: CreateContactData): Promise<WhatsAppContact>;
  createBulk(contacts: CreateContactData[]): Promise<number>;
  findById(id: number): Promise<WhatsAppContact | null>;
  findByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<WhatsAppContact[]>;
  findByUserIdAndPhoneNumber(userId: number, phoneNumber: string): Promise<WhatsAppContact | null>;
  update(id: number, contact: Partial<WhatsAppContact>): Promise<void>;
  delete(id: number): Promise<void>;
  deleteByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<void>;
}
