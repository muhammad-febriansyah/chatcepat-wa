import { Container } from 'inversify';
import 'reflect-metadata';
import { bindRepositories } from './bindings/repositories';
import { bindServices } from './bindings/services';
import { bindUseCases } from './bindings/useCases';

// Create IoC container
const container = new Container({
  defaultScope: 'Singleton',
  autoBindInjectable: true,
});

// Bind all dependencies
bindRepositories(container);
bindServices(container);
bindUseCases(container);

export { container };
