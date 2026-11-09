/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {del, get, param, post, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {UserBlockService} from '../services/user-block.service';
import {RateLimitService} from '../services/rate-limit.service';
import {BlockedUser, PagedList} from '../models/friend-types';

/** Bloqueio de jogadores (1.18.0). */
@authenticate('jwt')
export class UserBlockController {
  constructor(
    @service(UserBlockService)
    private userBlockService: UserBlockService,
    @service(RateLimitService)
    private rateLimit: RateLimitService,
  ) {}

  @get('/api/users/blocked')
  @response(200, {description: 'Jogadores bloqueados pelo usuário logado'})
  async listBlocked(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<BlockedUser>> {
    return this.userBlockService.listBlocked(currentUser.id, page, pageSize);
  }

  @post('/api/users/{id}/block')
  @response(200, {
    description:
      'Bloqueia o jogador (desfaz a amizade e cancela solicitações pendentes)',
  })
  async block(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<{friendshipRemoved: boolean}> {
    this.rateLimit.consume('userBlockUser', currentUser.id);
    return this.userBlockService.block(currentUser.id, id);
  }

  @del('/api/users/{id}/block')
  @response(204, {description: 'Desbloqueia o jogador'})
  async unblock(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    this.rateLimit.consume('userBlockUser', currentUser.id);
    await this.userBlockService.unblock(currentUser.id, id);
  }
}
