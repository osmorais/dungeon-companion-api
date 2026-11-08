/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope} from '@loopback/core';
import {EventEmitter} from 'events';
import {
  ChosenPresenceStatus,
  FriendPresence,
  MyPresence,
  PlayAvailability,
  PresencePrivacy,
  PresenceStatus,
} from '../models/social-event-types';

/** O site manda um heartbeat a cada ~25 s; sem heartbeat por isso, a conexão conta como caída. */
export const PRESENCE_TTL_MS = 70 * 1000;
export const PRESENCE_SWEEP_MS = 30 * 1000;

interface Choice {
  status: ChosenPresenceStatus;
  availability: PlayAvailability;
}

const DEFAULT_CHOICE: Choice = {
  status: 'online',
  availability: 'not_available',
};

/**
 * Aplica as preferências de quem é visto: `nobody` aparece sempre offline; offline mostra a última
 * atividade só com `show_last_seen`.
 */
export function visiblePresence(
  live: {presence: PresenceStatus; availability: PlayAvailability},
  privacy: PresencePrivacy,
): FriendPresence {
  if (privacy.presence_visibility === 'nobody')
    return {presence: 'offline', availability: null, last_seen_at: null};
  if (live.presence === 'offline')
    return {
      presence: 'offline',
      availability: null,
      last_seen_at: privacy.show_last_seen ? privacy.last_access_at : null,
    };
  return {
    presence: live.presence,
    availability: live.availability,
    last_seen_at: null,
  };
}

/**
 * Presença em memória — dado temporário, nunca gravado no banco. Cada aba/dispositivo é uma
 * conexão com heartbeat; o usuário só fica offline quando todas caem ou expiram (TTL), então
 * uma queda sem `disconnect` não o deixa online pra sempre. O status escolhido (ausente, ocupado,
 * disponível pra jogar) dura enquanto o processo estiver no ar.
 *
 * Mesma limitação do SessionEventsService: uma instância só do backend. Com várias instâncias,
 * isso precisaria ir pra um store compartilhado com TTL (ex.: Redis).
 *
 * Emite `changed` (userId) sempre que o que os amigos veem muda.
 */
@injectable({scope: BindingScope.SINGLETON})
export class PresenceService {
  private connections = new Map<string, Map<string, number>>();
  private choices = new Map<string, Choice>();
  private emitter = new EventEmitter();

  /** Relógio — sobrescrito só nos testes. */
  now: () => number = () => Date.now();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  onChange(listener: (userId: string) => void): () => void {
    this.emitter.on('changed', listener);
    return () => this.emitter.off('changed', listener);
  }

  connect(userId: string, connectionId: string): void {
    const conns = this.connections.get(userId) ?? new Map<string, number>();
    const wasOffline = conns.size === 0;
    conns.set(connectionId, this.now());
    this.connections.set(userId, conns);
    if (wasOffline) this.changed(userId);
  }

  heartbeat(userId: string, connectionId: string): void {
    const conns = this.connections.get(userId);
    if (conns?.has(connectionId)) conns.set(connectionId, this.now());
    else this.connect(userId, connectionId);
  }

  disconnect(userId: string, connectionId: string): void {
    const conns = this.connections.get(userId);
    if (!conns?.delete(connectionId)) return;
    if (conns.size === 0) {
      this.connections.delete(userId);
      this.changed(userId);
    }
  }

  /** Derruba as conexões sem heartbeat dentro do TTL. Devolve quem ficou offline. */
  sweep(): string[] {
    const limit = this.now() - PRESENCE_TTL_MS;
    const wentOffline: string[] = [];
    for (const [userId, conns] of this.connections) {
      for (const [id, at] of conns) if (at < limit) conns.delete(id);
      if (conns.size === 0) {
        this.connections.delete(userId);
        wentOffline.push(userId);
      }
    }
    wentOffline.forEach(id => this.changed(id));
    return wentOffline;
  }

  isConnected(userId: string): boolean {
    return (this.connections.get(userId)?.size ?? 0) > 0;
  }

  onlineUserIds(): string[] {
    return [...this.connections.keys()];
  }

  live(userId: string): {
    presence: PresenceStatus;
    availability: PlayAvailability;
  } {
    const choice = this.choices.get(userId) ?? DEFAULT_CHOICE;
    return {
      presence: this.isConnected(userId) ? choice.status : 'offline',
      availability: choice.availability,
    };
  }

  mine(userId: string): MyPresence {
    const choice = this.choices.get(userId) ?? DEFAULT_CHOICE;
    return {...choice, connected: this.isConnected(userId)};
  }

  setChoice(userId: string, update: Partial<Choice>): MyPresence {
    const current = this.choices.get(userId) ?? DEFAULT_CHOICE;
    const next = {...current, ...update};
    this.choices.set(userId, next);
    if (
      next.status !== current.status ||
      next.availability !== current.availability
    )
      this.changed(userId);
    return this.mine(userId);
  }

  /** Avisa os amigos de novo (ex.: mudou a preferência de privacidade da presença). */
  touch(userId: string): void {
    this.changed(userId);
  }

  private changed(userId: string): void {
    this.emitter.emit('changed', userId);
  }
}
