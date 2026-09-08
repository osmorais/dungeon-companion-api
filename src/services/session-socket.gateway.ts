import {inject, injectable, BindingScope, service} from '@loopback/core';
import {Server as SocketIOServer, Socket} from 'socket.io';
import http from 'http';
import {GameSessionService} from './game-session.service';
import {SessionEventsService} from './session-events.service';
import {DM_ONLY_EVENT_TYPES, SessionEvent} from '../models/session-event-types';
import {createSocketAuthMiddleware} from '../strategies/socket-auth.middleware';

const sessionRoom = (id: string) => `session:${id}`;
const dmRoom = (id: string) => `session:${id}:dm`;

/**
 * Único ponto do backend que sabe que existe socket.io — GameSessionService e CombatService
 * só conhecem o SessionEventsService (eventos de domínio), sem saber como são transportados.
 *
 * Uma sessão vira duas rooms: `session:{id}` (todos os autorizados) e `session:{id}:dm` (só
 * o mestre) — necessário porque alguns eventos carregam dado que o REST já esconde de
 * jogadores (ver DM_ONLY_EVENT_TYPES).
 */
@injectable({scope: BindingScope.SINGLETON})
export class SessionSocketGateway {
  private io: SocketIOServer | null = null;

  constructor(
    @service(SessionEventsService)
    private events: SessionEventsService,
    // GameSessionService fica bindado duas vezes (manual em application.ts + auto-descoberta
    // do boot), então @service() por tipo acha as duas bindings e falha — por isso a chave
    // literal, igual GameSessionController já faz.
    @inject('services.GameSessionService')
    private gameSessionService: GameSessionService,
  ) {}

  /** Chamado uma vez, depois que o LoopBack já subiu o http.Server (ver src/index.ts). */
  attach(httpServer: http.Server, corsOrigins: string[]): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {origin: corsOrigins, credentials: true},
    });
    this.io.use(createSocketAuthMiddleware());
    this.io.on('connection', socket => {
      this.onConnection(socket).catch(err => {
        console.error('Erro ao conectar socket na sessão:', err);
        socket.disconnect(true);
      });
    });
    this.events.subscribe(event => this.broadcast(event));
  }

  private async onConnection(socket: Socket): Promise<void> {
    const idGameSession = String(socket.handshake.query.sessionId ?? '');
    const userId = socket.data.userId as string;
    if (!idGameSession) {
      socket.disconnect(true);
      return;
    }

    const hasAccess = await this.gameSessionService.hasSessionAccess(
      idGameSession,
      userId,
    );
    if (!hasAccess) {
      socket.disconnect(true);
      return;
    }

    await socket.join(sessionRoom(idGameSession));
    if (await this.gameSessionService.isSessionOwner(idGameSession, userId)) {
      await socket.join(dmRoom(idGameSession));
    }
  }

  private broadcast(event: SessionEvent): void {
    const room = DM_ONLY_EVENT_TYPES.has(event.type)
      ? dmRoom(event.id_game_session)
      : sessionRoom(event.id_game_session);
    this.io?.to(room).emit('session:event', event);

    // Um jogador removido não sai sozinho da room — sem isso, o socket dele continuaria
    // recebendo eventos em tempo real da sessão mesmo depois do REST já negar acesso (403).
    if (event.type === 'player_removed') {
      this.evictStaleMembers(event.id_game_session).catch(err => {
        console.error('Erro ao remover sockets sem acesso da sessão:', err);
      });
    }
  }

  private async evictStaleMembers(idGameSession: string): Promise<void> {
    if (!this.io) return;
    const sockets = await this.io.in(sessionRoom(idGameSession)).fetchSockets();
    await Promise.all(
      sockets.map(async socket => {
        const userId = socket.data.userId as string;
        const stillHasAccess = await this.gameSessionService.hasSessionAccess(
          idGameSession,
          userId,
        );
        if (!stillHasAccess) socket.disconnect(true);
      }),
    );
  }
}
