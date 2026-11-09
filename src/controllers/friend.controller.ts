/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {del, get, param, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {FriendService} from '../services/friend.service';
import {RateLimitService} from '../services/rate-limit.service';
import {
  Friend,
  FriendRequest,
  FriendRequestCounts,
  FriendRequestView,
  PagedList,
  PlayerSearchResult,
  SendFriendRequestInput,
  SendFriendRequestResult,
} from '../models/friend-types';

/** Amigos (1.18.0): lista, solicitações e busca de jogadores. Sempre do usuário logado. */
@authenticate('jwt')
export class FriendController {
  constructor(
    @service(FriendService)
    private friendService: FriendService,
    @service(RateLimitService)
    private rateLimit: RateLimitService,
  ) {}

  @get('/api/friends')
  @response(200, {description: 'Amigos do usuário logado, paginados'})
  async listFriends(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.string('search') search?: string,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<Friend>> {
    return this.friendService.listFriends(
      currentUser.id,
      search,
      page,
      pageSize,
    );
  }

  @del('/api/friends/{userId}')
  @response(204, {description: 'Desfaz a amizade para os dois'})
  async removeFriend(
    @param.path.string('userId') userId: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    await this.friendService.removeFriend(currentUser.id, userId);
  }

  @get('/api/friend-requests/received')
  @response(200, {description: 'Solicitações pendentes recebidas'})
  async listReceived(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<FriendRequestView>> {
    return this.friendService.listRequests(
      currentUser.id,
      'received',
      page,
      pageSize,
    );
  }

  @get('/api/friend-requests/sent')
  @response(200, {description: 'Solicitações pendentes enviadas'})
  async listSent(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<FriendRequestView>> {
    return this.friendService.listRequests(
      currentUser.id,
      'sent',
      page,
      pageSize,
    );
  }

  @get('/api/friend-requests/count')
  @response(200, {
    description: 'Quantas solicitações pendentes (recebidas e enviadas)',
  })
  async countRequests(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<FriendRequestCounts> {
    return this.friendService.countRequests(currentUser.id);
  }

  @post('/api/friend-requests')
  @response(200, {
    description:
      'Envia uma solicitação (ou aceita a que o outro jogador já tinha enviado)',
  })
  async sendRequest(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['receiver_id'],
            properties: {receiver_id: {type: 'string'}},
          },
        },
      },
    })
    body: SendFriendRequestInput,
  ): Promise<SendFriendRequestResult> {
    this.rateLimit.consume('friendRequestUser', currentUser.id);
    return this.friendService.sendRequest(currentUser.id, body);
  }

  @post('/api/friend-requests/{id}/accept')
  @response(200, {description: 'Aceita a solicitação (só o destinatário)'})
  async acceptRequest(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<FriendRequest> {
    return this.friendService.acceptRequest(id, currentUser.id);
  }

  @post('/api/friend-requests/{id}/reject')
  @response(200, {description: 'Recusa a solicitação (só o destinatário)'})
  async rejectRequest(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<FriendRequest> {
    return this.friendService.rejectRequest(id, currentUser.id);
  }

  @del('/api/friend-requests/{id}')
  @response(200, {
    description: 'Cancela a solicitação enviada (só o remetente)',
  })
  async cancelRequest(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<FriendRequest> {
    return this.friendService.cancelRequest(id, currentUser.id);
  }

  @get('/api/users/search')
  @response(200, {
    description:
      'Busca jogadores pelo nome de usuário (sem e-mail nem outros dados da conta)',
  })
  async searchPlayers(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.string('q') q?: string,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<PlayerSearchResult>> {
    this.rateLimit.consume('playerSearchUser', currentUser.id);
    return this.friendService.searchPlayers(currentUser.id, q, page, pageSize);
  }
}
