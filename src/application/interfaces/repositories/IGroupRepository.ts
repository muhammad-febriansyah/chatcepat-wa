import { WhatsAppGroup, GroupMetadata } from '@domain/entities/WhatsAppGroup';

export interface CreateGroupData {
  userId: number;
  whatsappSessionId: number;
  groupJid: string;
  name: string;
  description: string | null;
  ownerJid: string | null;
  subjectTime: Date | null;
  subjectOwnerJid: string | null;
  participantsCount: number;
  adminsCount: number;
  isAnnounce: boolean;
  isLocked: boolean;
  metadata: GroupMetadata | null;
}

export interface IGroupRepository {
  create(group: CreateGroupData): Promise<WhatsAppGroup>;
  createBulk(groups: CreateGroupData[]): Promise<number>;
  findById(id: number): Promise<WhatsAppGroup | null>;
  findByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<WhatsAppGroup[]>;
  findByUserIdAndGroupJid(userId: number, groupJid: string): Promise<WhatsAppGroup | null>;
  update(id: number, group: Partial<WhatsAppGroup>): Promise<void>;
  delete(id: number): Promise<void>;
  deleteByUserIdAndSessionId(userId: number, whatsappSessionId: number): Promise<void>;
}
