import { Container } from 'inversify';
import { TYPES } from '../types';

// Use Cases
import { CreateSessionUseCase } from '@application/use-cases/session/CreateSessionUseCase';
import { GetSessionQRCodeUseCase } from '@application/use-cases/session/GetSessionQRCodeUseCase';
import { GetUserSessionsUseCase } from '@application/use-cases/session/GetUserSessionsUseCase';
import { DisconnectSessionUseCase } from '@application/use-cases/session/DisconnectSessionUseCase';
import { ProcessIncomingMessageUseCase } from '@application/use-cases/messaging/ProcessIncomingMessageUseCase';
import { ProcessAutoReplyUseCase } from '@application/use-cases/auto-reply/ProcessAutoReplyUseCase';
import { CreateBroadcastUseCase } from '@application/use-cases/broadcast/CreateBroadcastUseCase';
import { ExecuteBroadcastUseCase } from '@application/use-cases/broadcast/ExecuteBroadcastUseCase';
import { GetBroadcastCampaignsUseCase } from '@application/use-cases/broadcast/GetBroadcastCampaignsUseCase';
import { CancelBroadcastUseCase } from '@application/use-cases/broadcast/CancelBroadcastUseCase';
import { ScrapeContactsUseCase } from '@application/use-cases/contacts/ScrapeContactsUseCase';
import { GetSessionContactsUseCase } from '@application/use-cases/contacts/GetSessionContactsUseCase';
import { GetScrapingHistoryUseCase } from '@application/use-cases/contacts/GetScrapingHistoryUseCase';
import { ScrapeGroupsUseCase } from '@application/use-cases/groups/ScrapeGroupsUseCase';
import { GetSessionGroupsUseCase } from '@application/use-cases/groups/GetSessionGroupsUseCase';
import { BroadcastToGroupUseCase } from '@application/use-cases/groups/BroadcastToGroupUseCase';
import { ScrapeGroupMembersUseCase } from '@application/use-cases/groups/ScrapeGroupMembersUseCase';
import { CaptureGroupMemberUseCase } from '@application/use-cases/groups/CaptureGroupMemberUseCase';

export function bindUseCases(container: Container): void {
  // Session Use Cases
  container.bind<CreateSessionUseCase>(TYPES.CreateSessionUseCase).to(CreateSessionUseCase);
  container.bind<GetSessionQRCodeUseCase>(TYPES.GetSessionQRCodeUseCase).to(GetSessionQRCodeUseCase);
  container.bind<GetUserSessionsUseCase>(TYPES.GetUserSessionsUseCase).to(GetUserSessionsUseCase);
  container.bind<DisconnectSessionUseCase>(TYPES.DisconnectSessionUseCase).to(DisconnectSessionUseCase);

  // Messaging Use Cases
  container.bind<ProcessIncomingMessageUseCase>(TYPES.ProcessIncomingMessageUseCase).to(ProcessIncomingMessageUseCase);

  // Auto-Reply Use Cases
  container.bind<ProcessAutoReplyUseCase>(TYPES.ProcessAutoReplyUseCase).to(ProcessAutoReplyUseCase);

  // Broadcast Use Cases
  container.bind<CreateBroadcastUseCase>(TYPES.CreateBroadcastUseCase).to(CreateBroadcastUseCase);
  container.bind<ExecuteBroadcastUseCase>(TYPES.ExecuteBroadcastUseCase).to(ExecuteBroadcastUseCase);
  container.bind<GetBroadcastCampaignsUseCase>(TYPES.GetBroadcastCampaignsUseCase).to(GetBroadcastCampaignsUseCase);
  container.bind<CancelBroadcastUseCase>(TYPES.CancelBroadcastUseCase).to(CancelBroadcastUseCase);

  // Contact Use Cases
  container.bind<ScrapeContactsUseCase>(TYPES.ScrapeContactsUseCase).to(ScrapeContactsUseCase);
  container.bind<GetSessionContactsUseCase>(TYPES.GetSessionContactsUseCase).to(GetSessionContactsUseCase);
  container.bind<GetScrapingHistoryUseCase>(TYPES.GetScrapingHistoryUseCase).to(GetScrapingHistoryUseCase);

  // Group Use Cases
  container.bind<ScrapeGroupsUseCase>(TYPES.ScrapeGroupsUseCase).to(ScrapeGroupsUseCase);
  container.bind<GetSessionGroupsUseCase>(TYPES.GetSessionGroupsUseCase).to(GetSessionGroupsUseCase);
  container.bind<BroadcastToGroupUseCase>(TYPES.BroadcastToGroupUseCase).to(BroadcastToGroupUseCase);
  container.bind<ScrapeGroupMembersUseCase>(TYPES.ScrapeGroupMembersUseCase).to(ScrapeGroupMembersUseCase);
  container.bind<CaptureGroupMemberUseCase>(TYPES.CaptureGroupMemberUseCase).to(CaptureGroupMemberUseCase);
}
