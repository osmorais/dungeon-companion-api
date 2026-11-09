/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {del, get, param, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {SessionInviteService} from '../services/session-invite.service';
import {RateLimitService} from '../services/rate-limit.service';
import {PagedList} from '../models/friend-types';
import {
  AcceptSessionInviteInput,
  AcceptSessionInviteResult,
  SendSessionInviteInput,
  SessionInvite,
  SessionInviteView,
} from '../models/session-invite-types';

/** Convites para mesa (1.18.0): o mestre convida amigos; o convidado aceita com um personagem. */
@authenticate('jwt')
export class SessionInviteController {
  constructor(
    @service(SessionInviteService)
    private inviteService: SessionInviteService,
    @service(RateLimitService)
    private rateLimit: RateLimitService,
  ) {}

  @get('/api/session-invites/received')
  @response(200, {description: 'Convites pendentes recebidos'})
  async listReceived(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<SessionInviteView>> {
    return this.inviteService.list(currentUser.id, 'received', page, pageSize);
  }

  @get('/api/session-invites/sent')
  @response(200, {description: 'Convites pendentes enviados pelo mestre'})
  async listSent(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<PagedList<SessionInviteView>> {
    return this.inviteService.list(currentUser.id, 'sent', page, pageSize);
  }

  @post('/api/session-invites')
  @response(200, {description: 'Convida um amigo para uma mesa sua'})
  async send(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id_game_session', 'receiver_id'],
            properties: {
              id_game_session: {type: 'string'},
              receiver_id: {type: 'string'},
              message: {type: 'string', nullable: true},
            },
          },
        },
      },
    })
    body: SendSessionInviteInput,
  ): Promise<SessionInvite> {
    this.rateLimit.consume('sessionInviteUser', currentUser.id);
    return this.inviteService.send(currentUser.id, body);
  }

  @post('/api/session-invites/{id}/accept')
  @response(200, {
    description: 'Aceita o convite e entra na mesa com o personagem escolhido',
  })
  async accept(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id_character'],
            properties: {id_character: {type: 'number'}},
          },
        },
      },
    })
    body: AcceptSessionInviteInput,
  ): Promise<AcceptSessionInviteResult> {
    return this.inviteService.accept(id, currentUser.id, body);
  }

  @post('/api/session-invites/{id}/reject')
  @response(200, {description: 'Recusa o convite (só o convidado)'})
  async reject(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<SessionInvite> {
    return this.inviteService.reject(id, currentUser.id);
  }

  @del('/api/session-invites/{id}')
  @response(200, {description: 'Cancela o convite (só quem convidou)'})
  async cancel(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<SessionInvite> {
    return this.inviteService.cancel(id, currentUser.id);
  }
}
