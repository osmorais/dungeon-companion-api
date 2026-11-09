/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {FriendRepository} from '../repositories/friend.repository';
import {UserBlockRepository} from '../repositories/user-block.repository';
import {
  Friend,
  FriendRow,
  FriendRequest,
  FriendRequestCounts,
  FriendRequestView,
  PagedList,
  PlayerSearchResult,
  SendFriendRequestInput,
  SendFriendRequestResult,
} from '../models/friend-types';
import {
  FRIEND_REQUEST_COOLDOWN_DAYS,
  isUuid,
  normalizeFilter,
  resolvePaging,
  searchTerm,
  toPagedList,
} from './friend-rules';
import {isUniqueViolation} from './username.service';
import {NotificationService} from './notification.service';
import {SocialEventsService} from './social-events.service';
import {PresenceService, visiblePresence} from './presence.service';
import {SocialEvent} from '../models/social-event-types';

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYER_NOT_FOUND = 'Jogador não encontrado';
const REQUEST_NOT_FOUND = 'Solicitação não encontrada';

/**
 * Amizades e solicitações. O usuário vem sempre do token (nunca do corpo). Jogador inexistente,
 * sem nome de usuário ou que bloqueou quem pede recebem a mesma resposta (404), pra não revelar
 * o bloqueio; solicitação de outra pessoa também é 404.
 *
 * Depois de gravar, avisa: notificação persistida (solicitação recebida/aceita) e evento em tempo
 * real `social_changed` pros envolvidos recarregarem as listas.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class FriendService {
  /** Relógio — sobrescrito só nos testes. */
  now: () => number = () => Date.now();

  constructor(
    @service(FriendRepository)
    private repository: FriendRepository,
    @service(UserBlockRepository)
    private blocks: UserBlockRepository,
    @service(NotificationService)
    private notifications: NotificationService,
    @service(SocialEventsService)
    private events: SocialEventsService,
    @service(PresenceService)
    private presence: PresenceService,
  ) {}

  /** `status = 'online'`: só os conectados agora que não escondem a presença (aba Online). */
  async listFriends(
    userId: string,
    search?: string,
    page?: number,
    pageSize?: number,
    status?: string,
  ): Promise<PagedList<Friend>> {
    const paging = resolvePaging(page, pageSize);
    let onlyIds: string[] | undefined;
    if (status === 'online') {
      onlyIds = this.presence.onlineUserIds().filter(id => id !== userId);
      if (!onlyIds.length) return {items: [], ...paging, total_count: 0};
    }
    const rows = await this.repository.findFriends(
      userId,
      normalizeFilter(search),
      paging.pageSize,
      paging.page,
      onlyIds,
    );
    return toPagedList(
      rows.map(row => ({...this.toFriend(row), total_count: row.total_count})),
      paging.page,
      paging.pageSize,
    );
  }

  /** Eventos `presence_updated` pros amigos de `userId`, com a privacidade dele aplicada. */
  async presenceUpdatesFor(userId: string): Promise<SocialEvent[]> {
    const audience = await this.repository.findPresenceAudience(userId);
    if (!audience) return [];
    const visible = visiblePresence(
      this.presence.live(userId),
      audience.privacy,
    );
    return audience.friendIds.map(friendId => ({
      type: 'presence_updated' as const,
      user_id: friendId,
      friend: {id: userId, ...visible},
    }));
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const removed =
      isUuid(friendId) &&
      (await this.repository.removeFriendship(userId, friendId));
    if (!removed) throw new HttpErrors.NotFound('Amizade não encontrada');
    this.changed('friends', userId, friendId);
    // Os convites para mesa pendentes entre os dois foram cancelados junto.
    this.changed('invites', userId, friendId);
  }

  async listRequests(
    userId: string,
    direction: 'received' | 'sent',
    page?: number,
    pageSize?: number,
  ): Promise<PagedList<FriendRequestView>> {
    const paging = resolvePaging(page, pageSize);
    const rows = await this.repository.findPendingRequests(
      userId,
      direction,
      paging.pageSize,
      paging.page,
    );
    return toPagedList(rows, paging.page, paging.pageSize);
  }

  async countRequests(userId: string): Promise<FriendRequestCounts> {
    return this.repository.countPendingRequests(userId);
  }

  async sendRequest(
    senderId: string,
    input: SendFriendRequestInput,
  ): Promise<SendFriendRequestResult> {
    const receiverId = input?.receiver_id;
    if (!isUuid(receiverId))
      throw new HttpErrors.UnprocessableEntity('Jogador inválido');
    if (receiverId === senderId)
      throw new HttpErrors.UnprocessableEntity(
        'Você não pode adicionar a si mesmo',
      );

    const sender = await this.repository.findRecipient(senderId);
    if (!sender?.username)
      throw new HttpErrors.UnprocessableEntity(
        'Escolha um nome de usuário antes de adicionar amigos',
      );
    const receiver = await this.repository.findRecipient(receiverId);
    if (!receiver?.username) throw new HttpErrors.NotFound(PLAYER_NOT_FOUND);

    const block = await this.blocks.blockStatus(senderId, receiverId);
    if (block.byThem) throw new HttpErrors.NotFound(PLAYER_NOT_FOUND);
    if (block.byMe)
      throw new HttpErrors.UnprocessableEntity(
        'Desbloqueie esse jogador para enviar uma solicitação',
      );

    if (await this.repository.areFriends(senderId, receiverId))
      throw new HttpErrors.Conflict('Vocês já são amigos');

    const pending = await this.repository.findPendingBetween(
      senderId,
      receiverId,
    );
    if (pending) {
      if (pending.sender_id === senderId)
        throw new HttpErrors.Conflict('Solicitação já enviada');
      // O outro já tinha pedido: enviar vira aceitar a dele (nada de duas solicitações).
      const accepted = await this.repository.acceptRequest(
        pending.id_friend_request,
        senderId,
      );
      if (!accepted)
        throw new HttpErrors.Conflict(
          'Não foi possível aceitar a solicitação desse jogador',
        );
      await this.onAccepted(accepted);
      return {status: 'accepted', request: accepted};
    }

    if (!receiver.accept_friend_requests)
      throw new HttpErrors.UnprocessableEntity(
        'Esse jogador não está recebendo solicitações de amizade',
      );

    const rejectedAt = await this.repository.lastRejectedAt(
      senderId,
      receiverId,
    );
    if (
      rejectedAt &&
      this.now() - new Date(rejectedAt).getTime() <
        FRIEND_REQUEST_COOLDOWN_DAYS * DAY_MS
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'Não é possível enviar outra solicitação para esse jogador agora',
      );
    }

    let request: FriendRequest | undefined;
    try {
      request = await this.repository.createRequest(senderId, receiverId);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new HttpErrors.Conflict(
          'Já existe uma solicitação pendente entre vocês',
        );
      throw err;
    }
    // Bloqueio que entrou entre a conferência e o INSERT.
    if (!request) throw new HttpErrors.NotFound(PLAYER_NOT_FOUND);
    await this.notifications.notify({
      user_id: receiverId,
      actor_id: senderId,
      type: 'friend_request_received',
      payload: {id_friend_request: request.id_friend_request},
      // Por remetente e dia (UTC): cancelar e reenviar não vira uma notificação nova a cada vez.
      dedupe_key: `friend_request_received:${senderId}:${new Date(this.now()).toISOString().slice(0, 10)}`,
    });
    this.changed('requests', senderId, receiverId);
    return {status: 'pending', request};
  }

  /** Só o destinatário aceita. */
  async acceptRequest(id: string, userId: string): Promise<FriendRequest> {
    await this.findOwnPending(id, userId, 'receiver');
    const accepted = await this.repository.acceptRequest(id, userId);
    if (!accepted)
      throw new HttpErrors.Conflict(
        'Não foi possível aceitar essa solicitação',
      );
    await this.onAccepted(accepted);
    return accepted;
  }

  /** Só o destinatário recusa. O remetente não é avisado. */
  async rejectRequest(id: string, userId: string): Promise<FriendRequest> {
    await this.findOwnPending(id, userId, 'receiver');
    const closed = await this.close(id, userId, 'receiver');
    this.changed('requests', userId);
    return closed;
  }

  /** Só o remetente cancela. */
  async cancelRequest(id: string, userId: string): Promise<FriendRequest> {
    const request = await this.findOwnPending(id, userId, 'sender');
    const closed = await this.close(id, userId, 'sender');
    this.changed('requests', userId, request.receiver_id);
    return closed;
  }

  async searchPlayers(
    userId: string,
    q: string | undefined,
    page?: number,
    pageSize?: number,
  ): Promise<PagedList<PlayerSearchResult>> {
    const term = searchTerm(q);
    const paging = resolvePaging(page, pageSize);
    const rows = await this.repository.searchPlayers(
      userId,
      term,
      paging.pageSize,
      paging.page,
    );
    return toPagedList(rows, paging.page, paging.pageSize);
  }

  private toFriend(row: FriendRow): Friend {
    return {
      id: row.id,
      username: row.username,
      friends_since: row.friends_since,
      ...visiblePresence(this.presence.live(row.id), row),
    };
  }

  /** Amizade criada: avisa quem tinha pedido e atualiza as listas dos dois. */
  private async onAccepted(request: FriendRequest): Promise<void> {
    await this.notifications.notify({
      user_id: request.sender_id,
      actor_id: request.receiver_id,
      type: 'friend_request_accepted',
      payload: {id_friend_request: request.id_friend_request},
      dedupe_key: `friend_request_accepted:${request.id_friend_request}`,
    });
    this.changed('friends', request.sender_id, request.receiver_id);
    this.changed('requests', request.sender_id, request.receiver_id);
  }

  private changed(
    scope: 'friends' | 'requests' | 'invites',
    ...userIds: string[]
  ): void {
    for (const id of userIds)
      this.events.publish({type: 'social_changed', user_id: id, scope});
  }

  private async findOwnPending(
    id: string,
    userId: string,
    as: 'receiver' | 'sender',
  ): Promise<FriendRequest> {
    const request = isUuid(id)
      ? await this.repository.findRequestById(id)
      : undefined;
    const ownerId =
      as === 'receiver' ? request?.receiver_id : request?.sender_id;
    if (!request || ownerId !== userId)
      throw new HttpErrors.NotFound(REQUEST_NOT_FOUND);
    if (request.status !== 'pending')
      throw new HttpErrors.Conflict('Essa solicitação já foi respondida');
    return request;
  }

  private async close(
    id: string,
    userId: string,
    as: 'receiver' | 'sender',
  ): Promise<FriendRequest> {
    const closed = await this.repository.closeRequest(id, userId, as);
    if (!closed)
      throw new HttpErrors.Conflict('Essa solicitação já foi respondida');
    return closed;
  }
}
