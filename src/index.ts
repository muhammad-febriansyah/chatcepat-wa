import 'reflect-metadata';
import 'tsconfig-paths/register';
import { ExpressServer } from './server';
import { validateEnv } from '@shared/config/env';

// Validate environment variables
validateEnv();

// Create and start server
const server = new ExpressServer();

server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
