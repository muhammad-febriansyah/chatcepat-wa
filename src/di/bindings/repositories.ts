import { Container } from 'inversify';
import { TYPES } from '../types';

// Repositories
import { SessionRepository } from '@infrastructure/database/mysql/repositories/SessionRepository';
import { MessageRepository } from '@infrastructure/database/mysql/repositories/MessageRepository';
import { RateLimitRepository } from '@infrastructure/database/mysql/repositories/RateLimitRepository';
import { BroadcastRepository } from '@infrastructure/database/mysql/repositories/BroadcastRepository';
import { ContactRepository } from '@infrastructure/database/mysql/repositories/ContactRepository';
import { GroupRepository } from '@infrastructure/database/mysql/repositories/GroupRepository';
import { ISessionRepository } from '@application/interfaces/repositories/ISessionRepository';
import { IMessageRepository } from '@application/interfaces/repositories/IMessageRepository';
import { IRateLimitRepository } from '@application/interfaces/repositories/IRateLimitRepository';
import { IBroadcastRepository } from '@application/interfaces/repositories/IBroadcastRepository';
import { IContactRepository } from '@application/interfaces/repositories/IContactRepository';
import { IGroupRepository } from '@application/interfaces/repositories/IGroupRepository';

export function bindRepositories(container: Container): void {
  container.bind<ISessionRepository>(TYPES.SessionRepository).to(SessionRepository);
  container.bind<IMessageRepository>(TYPES.MessageRepository).to(MessageRepository);
  container.bind<IRateLimitRepository>(TYPES.RateLimitRepository).to(RateLimitRepository);
  container.bind<IBroadcastRepository>(TYPES.BroadcastRepository).to(BroadcastRepository);
  container.bind<IContactRepository>(TYPES.ContactRepository).to(ContactRepository);
  container.bind<IGroupRepository>(TYPES.GroupRepository).to(GroupRepository);
}
