import {injectable, BindingScope} from '@loopback/core';
import {EventEmitter} from 'events';
import {SocialEvent} from '../models/social-event-types';

/**
 * Barramento em memória dos eventos sociais (amigos, notificações, presença), no mesmo molde do
 * SessionEventsService: os services publicam aqui, depois da gravação no banco, e o
 * SocialSocketGateway é o único assinante — retransmite via socket.io. Mesma limitação: vale pra
 * uma instância só do backend.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SocialEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: SocialEvent): void {
    this.emitter.emit('event', event);
  }

  /** Retorna uma função de unsubscribe. */
  subscribe(listener: (event: SocialEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
