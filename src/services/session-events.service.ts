import {injectable, BindingScope} from '@loopback/core';
import {EventEmitter} from 'events';
import {SessionEvent} from '../models/session-event-types';

/**
 * Barramento de eventos em memória: os services de domínio (GameSessionService,
 * CombatService) publicam eventos tipados aqui sempre que o estado de uma sessão muda, e o
 * SessionSocketGateway é o único assinante — ele retransmite via socket.io. Os services de
 * domínio não sabem que socket.io existe.
 *
 * Singleton dentro do processo: só funciona corretamente com uma única instância do backend
 * rodando. Se a API vier a escalar horizontalmente, isso precisaria migrar para Postgres
 * LISTEN/NOTIFY (ou um pub/sub externo) para propagar eventos entre instâncias.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SessionEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: SessionEvent): void {
    this.emitter.emit('event', event);
  }

  /** Retorna uma função de unsubscribe. */
  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
