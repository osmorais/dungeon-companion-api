import {injectable, BindingScope, service} from '@loopback/core';
import {Namespace, Server as SocketIOServer, Socket} from 'socket.io';
import {SocialEventsService} from './social-events.service';
import {PresenceService, PRESENCE_SWEEP_MS} from './presence.service';
import {FriendService} from './friend.service';
import {SocialEvent} from '../models/social-event-types';
import {createSocketAuthMiddleware} from '../strategies/socket-auth.middleware';

const userRoom = (userId: string) => `user:${userId}`;

/**
 * Tempo real da parte social (amigos, notificações, presença), no namespace `/social` do mesmo
 * servidor socket.io das sessões e com a mesma autenticação do handshake. Cada conexão entra só
 * na room do próprio usuário (`user:{id}`, id vindo do token — nunca do cliente), então um evento
 * nunca chega a outra pessoa.
 *
 * Presença: cada socket é uma conexão; o cliente manda `presence:heartbeat` periodicamente e o
 * PresenceService derruba quem parou (TTL). Quando o que os amigos veem muda, avisa os amigos.
 *
 * Usa o sufixo .gateway.ts pra não ser descoberto pelo boot — bind manual em application.ts.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SocialSocketGateway {
  private nsp: Namespace | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @service(SocialEventsService)
    private events: SocialEventsService,
    @service(PresenceService)
    private presence: PresenceService,
    @service(FriendService)
    private friendService: FriendService,
  ) {}

  /** Chamado uma vez, com o servidor que o SessionSocketGateway criou (ver src/index.ts). */
  attach(io: SocketIOServer): void {
    this.nsp = io.of('/social');
    this.nsp.use(createSocketAuthMiddleware());
    this.nsp.on('connection', socket => {
      this.onConnection(socket).catch(err => {
        console.error('Erro ao conectar socket social:', err);
        socket.disconnect(true);
      });
    });
    this.events.subscribe(event => this.deliver(event));
    this.presence.onChange(userId => {
      this.broadcastPresence(userId).catch(err => {
        console.error('Erro ao avisar presença:', (err as Error).message);
      });
    });
    this.sweepTimer = setInterval(
      () => this.presence.sweep(),
      PRESENCE_SWEEP_MS,
    );
    this.sweepTimer.unref();
  }

  private async onConnection(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string;
    await socket.join(userRoom(userId));
    this.presence.connect(userId, socket.id);
    socket.on('presence:heartbeat', () =>
      this.presence.heartbeat(userId, socket.id),
    );
    socket.on('disconnect', () => this.presence.disconnect(userId, socket.id));
  }

  private deliver(event: SocialEvent): void {
    this.nsp?.to(userRoom(event.user_id)).emit('social:event', event);
  }

  private async broadcastPresence(userId: string): Promise<void> {
    const updates = await this.friendService.presenceUpdatesFor(userId);
    updates.forEach(event => this.deliver(event));
  }
}
