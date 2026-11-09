/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {UserBlockRepository} from '../repositories/user-block.repository';
import {UserRepository} from '../repositories/user.repository';
import {BlockedUser, PagedList} from '../models/friend-types';
import {isUuid, resolvePaging, toPagedList} from './friend-rules';
import {SocialEventsService} from './social-events.service';

/**
 * Bloqueio de usuários. Bloquear desfaz a amizade e cancela as solicitações pendentes entre os
 * dois (ver UserBlockRepository.block); as travas nas solicitações e na busca ficam no
 * FriendService/FriendRepository. Quem foi bloqueado nunca é avisado.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class UserBlockService {
  constructor(
    @service(UserBlockRepository)
    private repository: UserBlockRepository,
    @service(UserRepository)
    private users: UserRepository,
    @service(SocialEventsService)
    private events: SocialEventsService,
  ) {}

  async block(
    userId: string,
    otherId: string,
  ): Promise<{friendshipRemoved: boolean}> {
    if (otherId === userId)
      throw new HttpErrors.UnprocessableEntity(
        'Você não pode bloquear a si mesmo',
      );
    const other = isUuid(otherId)
      ? await this.users.findById(otherId)
      : undefined;
    if (!other) throw new HttpErrors.NotFound('Jogador não encontrado');
    const result = await this.repository.block(userId, otherId);
    for (const scope of ['friends', 'requests', 'blocked', 'invites'] as const)
      this.events.publish({type: 'social_changed', user_id: userId, scope});
    // O bloqueado recebe só o "recarregue a lista" genérico, igual ao de uma amizade desfeita:
    // a tela dele para de mostrar o amigo (e a presença dele) sem revelar que foi bloqueio.
    for (const scope of ['friends', 'requests', 'invites'] as const)
      this.events.publish({type: 'social_changed', user_id: otherId, scope});
    return result;
  }

  async unblock(userId: string, otherId: string): Promise<void> {
    const removed =
      isUuid(otherId) && (await this.repository.unblock(userId, otherId));
    if (!removed)
      throw new HttpErrors.NotFound('Esse jogador não está bloqueado');
    this.events.publish({
      type: 'social_changed',
      user_id: userId,
      scope: 'blocked',
    });
  }

  async listBlocked(
    userId: string,
    page?: number,
    pageSize?: number,
  ): Promise<PagedList<BlockedUser>> {
    const paging = resolvePaging(page, pageSize);
    const rows = await this.repository.findBlocked(
      userId,
      paging.pageSize,
      paging.page,
    );
    return toPagedList(rows, paging.page, paging.pageSize);
  }

  /** Há bloqueio em alguma direção — usado por outros fluxos sociais (ex.: convites). */
  async isBlockedEither(userId: string, otherId: string): Promise<boolean> {
    const status = await this.repository.blockStatus(userId, otherId);
    return status.byMe || status.byThem;
  }
}
