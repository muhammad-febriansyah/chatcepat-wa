export interface GroupMetadata {
  profilePicUrl?: string;
  creationTime?: number;
  inviteCode?: string;
  size?: number;
  [key: string]: any;
}

export class WhatsAppGroup {
  constructor(
    public readonly id: number,
    public readonly userId: number,
    public readonly whatsappSessionId: number,
    public readonly groupJid: string,
    public name: string,
    public description: string | null,
    public ownerJid: string | null,
    public subjectTime: Date | null,
    public subjectOwnerJid: string | null,
    public participantsCount: number,
    public adminsCount: number,
    public isAnnounce: boolean,
    public isLocked: boolean,
    public metadata: GroupMetadata | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  getDisplayName(): string {
    return this.name || this.groupJid;
  }

  isUserAdmin(userJid: string): boolean {
    // This would need to check against participants list
    // For now, just check if user is owner
    return this.ownerJid === userJid;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      whatsappSessionId: this.whatsappSessionId,
      groupJid: this.groupJid,
      name: this.name,
      description: this.description,
      ownerJid: this.ownerJid,
      subjectTime: this.subjectTime,
      subjectOwnerJid: this.subjectOwnerJid,
      participantsCount: this.participantsCount,
      adminsCount: this.adminsCount,
      isAnnounce: this.isAnnounce,
      isLocked: this.isLocked,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
