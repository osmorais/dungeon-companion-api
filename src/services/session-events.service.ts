import {injectable, BindingScope} from '@loopback/core';
import {EventEmitter} from 'events';

/**
 * Barramento de eventos em memória usado para notificar clientes conectados via SSE
 * (GET /api/game-session/{id}/events) sempre que o estado de uma sessão muda.
 *
 * Singleton dentro do processo: só funciona corretamente com uma única instância do
 * backend rodando. Se a API vier a escalar horizontalmente, isso precisaria migrar para
 * Postgres LISTEN/NOTIFY (ou um pub/sub externo) para propagar eventos entre instâncias.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SessionEventsService {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(idGameSession: string): void {
    this.emitter.emit(idGameSession);
  }

  /** Retorna uma função de unsubscribe. */
  subscribe(idGameSession: string, listener: () => void): () => void {
    this.emitter.on(idGameSession, listener);
    return () => this.emitter.off(idGameSession, listener);
  }
}
