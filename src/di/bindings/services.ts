import { Container } from 'inversify';
import { TYPES } from '../types';

// Infrastructure
import { MysqlConnection } from '@infrastructure/database/mysql/MysqlConnection';
import { SessionManager } from '@infrastructure/whatsapp/SessionManager';
import { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import { MessageHandler } from '@infrastructure/whatsapp/MessageHandler';
import { OpenAIService } from '@infrastructure/external-services/OpenAIService';
import { RajaOngkirService } from '@infrastructure/external-services/RajaOngkirService';
import { BitShipService } from '@infrastructure/external-services/BitShipService';
import { RateLimiter } from '@infrastructure/rate-limiter/RateLimiter';
import { SocketServer } from '@infrastructure/websocket/SocketServer';

// Interfaces
import { IWhatsAppClient } from '@application/interfaces/services/IWhatsAppClient';
import { IOpenAIService } from '@application/interfaces/services/IOpenAIService';
import { IRajaOngkirService } from '@application/interfaces/services/IRajaOngkirService';

export function bindServices(container: Container): void {
  // Database
  container.bind<MysqlConnection>(TYPES.DatabaseConnection).to(MysqlConnection).inSingletonScope();

  // WhatsApp
  container.bind<SessionManager>(TYPES.SessionManager).to(SessionManager).inSingletonScope();
  container.bind<IWhatsAppClient>(TYPES.WhatsAppClient).to(BaileysClient).inSingletonScope();
  container.bind<MessageHandler>(TYPES.MessageHandler).to(MessageHandler).inSingletonScope();

  // External Services
  container.bind<IOpenAIService>(TYPES.OpenAIService).to(OpenAIService).inSingletonScope();
  container.bind<IRajaOngkirService>(TYPES.RajaOngkirService).to(RajaOngkirService).inSingletonScope();
  container.bind<BitShipService>(TYPES.BitShipService).to(BitShipService).inSingletonScope();

  // Rate Limiter
  container.bind<RateLimiter>(TYPES.RateLimiter).to(RateLimiter).inSingletonScope();

  // WebSocket
  container.bind<SocketServer>(TYPES.SocketServer).to(SocketServer).inSingletonScope();
}
