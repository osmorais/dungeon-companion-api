/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {SessionInviteRepository} from '../repositories/session-invite.repository';
import {FriendRepository} from '../repositories/friend.repository';
import {UserBlockRepository} from '../repositories/user-block.repository';
import {GameSessionService} from './game-session.service';
import {NotificationService} from './notification.service';
import {SocialEventsService} from './social-events.service';
import {isUuid, resolvePaging, toPagedList} from './friend-rules';
import {isUniqueViolation} from './username.service';
import {PagedList} from '../models/friend-types';
import {
  AcceptSessionInviteInput,
  AcceptSessionInviteResult,
  SendSessionInviteInput,
  SessionInvite,
  SessionInviteView,
} from '../models/session-invite-types';

export const SESSION_INVITE_TTL_DAYS = 7;
export const SESSION_INVITE_MESSAGE_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_NOT_FOUND = 'Convite não encontrado';
const PLAYER_NOT_FOUND = 'Jogador não encontrado';

/**
 * Convites para mesa (1.18.0). Só o mestre convida, e só amigos. Aceitar não pula o fluxo de
 * entrada: chama `GameSessionService.addPlayer` com o código da mesa e o personagem escolhido,
 * que confere de novo o personagem, a vaga e se a pessoa já está na mesa. Convite de outra pessoa
 * é 404; bloqueio entre os dois também (não revela o bloqueio).
 */
@injectable({scope: BindingScope.TRANSIENT})
export class SessionInviteService {
  /** Relógio — sobrescrito só nos testes. */
  now: () => number = () => Date.now();

  constructor(
    @service(SessionInviteRepository)
    private repository: SessionInviteRepository,
    @service(FriendRepository)
    private friends: FriendRepository,
    @service(UserBlockRepository)
    private blocks: UserBlockRepository,
    // GameSessionService tem dois bindings (manual + boot): chave literal, como no controller.
    @inject('services.GameSessionService')
    private gameSessions: GameSessionService,
    @service(NotificationService)
    private notifications: NotificationService,
    @service(SocialEventsService)
    private events: SocialEventsService,
  ) {}

  async send(
    senderId: string,
    input: SendSessionInviteInput,
  ): Promise<SessionInvite> {
    const idGameSession = input?.id_game_session;
    const receiverId = input?.receiver_id;
    if (!isUuid(idGameSession) || !isUuid(receiverId))
      throw new HttpErrors.UnprocessableEntity('Convite inválido');
    if (receiverId === senderId)
      throw new HttpErrors.UnprocessableEntity(
        'Você não pode convidar a si mesmo',
      );
    const message = normalizeMessage(input.message);

    const session = await this.repository.findTargetSession(idGameSession);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');
    if (session.user_id !== senderId)
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode convidar para a mesa',
      );

    const block = await this.blocks.blockStatus(senderId, receiverId);
    if (block.byThem) throw new HttpErrors.NotFound(PLAYER_NOT_FOUND);
    if (block.byMe)
      throw new HttpErrors.UnprocessableEntity(
        'Desbloqueie esse jogador para convidá-lo',
      );
    if (!(await this.friends.areFriends(senderId, receiverId)))
      throw new HttpErrors.UnprocessableEntity('Só é possível convidar amigos');
    if (await this.repository.isInSession(idGameSession, receiverId))
      throw new HttpErrors.Conflict('Esse jogador já está na mesa');
    if (session.player_count >= session.max_player_quantity)
      throw new HttpErrors.UnprocessableEntity('A mesa já está cheia');

    await this.repository.expireStale(receiverId);
    let invite: SessionInvite;
    try {
      invite = await this.repository.create({
        id_game_session: idGameSession,
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        expires_at: new Date(this.now() + SESSION_INVITE_TTL_DAYS * DAY_MS),
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new HttpErrors.Conflict(
          'Esse jogador já tem um convite pendente para essa mesa',
        );
      throw err;
    }
    await this.notifications.notify({
      user_id: receiverId,
      actor_id: senderId,
      type: 'session_invite_received',
      payload: {
        id_session_invite: invite.id_session_invite,
        id_game_session: idGameSession,
      },
      dedupe_key: `session_invite_received:${invite.id_session_invite}`,
    });
    this.changed(senderId, receiverId);
    return invite;
  }

  async accept(
    id: string,
    userId: string,
    input: AcceptSessionInviteInput,
  ): Promise<AcceptSessionInviteResult> {
    const idCharacter = input?.id_character;
    if (!Number.isInteger(idCharacter) || idCharacter <= 0)
      throw new HttpErrors.UnprocessableEntity(
        'Escolha um personagem para entrar na mesa',
      );
    const invite = await this.findOwnPending(id, userId, 'receiver');

    if (new Date(invite.expires_at).getTime() <= this.now()) {
      await this.repository.close(id, 'expired');
      this.changed(invite.sender_id, userId);
      throw new HttpErrors.UnprocessableEntity('Esse convite expirou');
    }
    const session = await this.repository.findTargetSession(
      invite.id_game_session,
    );
    if (!session) throw new HttpErrors.NotFound(INVITE_NOT_FOUND);
    // O convite vale enquanto quem convidou for o mestre da mesa.
    if (session.user_id !== invite.sender_id) {
      await this.repository.close(id, 'cancelled');
      throw new HttpErrors.Conflict('Esse convite não vale mais');
    }
    const block = await this.blocks.blockStatus(userId, invite.sender_id);
    if (block.byMe || block.byThem)
      throw new HttpErrors.NotFound(INVITE_NOT_FOUND);

    const claimed = await this.repository.claim(id, userId);
    if (!claimed)
      throw new HttpErrors.Conflict('Não foi possível aceitar esse convite');
    let player;
    try {
      player = await this.gameSessions.addPlayer(
        {session_code: session.session_code, id_character: idCharacter},
        userId,
      );
    } catch (err) {
      // Sem vaga, personagem de outra pessoa, já na mesa…: o convite volta a valer.
      await this.repository.releaseClaim(id);
      throw err;
    }

    await this.notifications.notify({
      user_id: invite.sender_id,
      actor_id: userId,
      type: 'session_invite_accepted',
      payload: {
        id_session_invite: id,
        id_game_session: invite.id_game_session,
      },
      dedupe_key: `session_invite_accepted:${id}`,
    });
    this.changed(invite.sender_id, userId);
    return {id_game_session: invite.id_game_session, player};
  }

  /** Só o convidado recusa. O mestre é avisado (a vaga continua aberta). */
  async reject(id: string, userId: string): Promise<SessionInvite> {
    const invite = await this.findOwnPending(id, userId, 'receiver');
    const closed = await this.repository.close(id, 'rejected', {
      userId,
      as: 'receiver',
    });
    if (!closed)
      throw new HttpErrors.Conflict('Esse convite já foi respondido');
    await this.notifications.notify({
      user_id: invite.sender_id,
      actor_id: userId,
      type: 'session_invite_rejected',
      payload: {
        id_session_invite: id,
        id_game_session: invite.id_game_session,
      },
      dedupe_key: `session_invite_rejected:${id}`,
    });
    this.changed(invite.sender_id, userId);
    return closed;
  }

  /** Só quem convidou cancela. */
  async cancel(id: string, userId: string): Promise<SessionInvite> {
    const invite = await this.findOwnPending(id, userId, 'sender');
    const closed = await this.repository.close(id, 'cancelled', {
      userId,
      as: 'sender',
    });
    if (!closed)
      throw new HttpErrors.Conflict('Esse convite já foi respondido');
    this.changed(userId, invite.receiver_id);
    return closed;
  }

  async list(
    userId: string,
    direction: 'received' | 'sent',
    page?: number,
    pageSize?: number,
  ): Promise<PagedList<SessionInviteView>> {
    const paging = resolvePaging(page, pageSize);
    await this.repository.expireStale(userId);
    const rows = await this.repository.findPending(
      userId,
      direction,
      paging.pageSize,
      paging.page,
    );
    return toPagedList(rows, paging.page, paging.pageSize);
  }

  private async findOwnPending(
    id: string,
    userId: string,
    as: 'receiver' | 'sender',
  ): Promise<SessionInvite> {
    const invite = isUuid(id) ? await this.repository.findById(id) : undefined;
    const ownerId = as === 'receiver' ? invite?.receiver_id : invite?.sender_id;
    if (!invite || ownerId !== userId)
      throw new HttpErrors.NotFound(INVITE_NOT_FOUND);
    if (invite.status !== 'pending')
      throw new HttpErrors.Conflict('Esse convite já foi respondido');
    return invite;
  }

  private changed(...userIds: string[]): void {
    for (const id of userIds)
      this.events.publish({
        type: 'social_changed',
        user_id: id,
        scope: 'invites',
      });
  }
}

/** Recado opcional: aparado, vazio vira null, até SESSION_INVITE_MESSAGE_MAX caracteres. */
export function normalizeMessage(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string')
    throw new HttpErrors.UnprocessableEntity('Mensagem inválida');
  const text = raw.trim();
  if (text.length > SESSION_INVITE_MESSAGE_MAX)
    throw new HttpErrors.UnprocessableEntity(
      `A mensagem pode ter no máximo ${SESSION_INVITE_MESSAGE_MAX} caracteres`,
    );
  return text.length ? text : null;
}
