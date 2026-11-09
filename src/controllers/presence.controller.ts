/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {get, HttpErrors, put, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {PresenceService} from '../services/presence.service';
import {
  CHOSEN_PRESENCE_STATUSES,
  ChosenPresenceStatus,
  MyPresence,
  PLAY_AVAILABILITIES,
  PlayAvailability,
  UpdatePresenceInput,
} from '../models/social-event-types';

/** Presença do próprio usuário (1.18.0): status e disponibilidade pra jogar. Fica só em memória. */
@authenticate('jwt')
export class PresenceController {
  constructor(
    @service(PresenceService)
    private presence: PresenceService,
  ) {}

  @get('/api/presence/me')
  @response(200, {description: 'Status e disponibilidade do usuário logado'})
  async getMine(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<MyPresence> {
    return this.presence.mine(currentUser.id);
  }

  @put('/api/presence/me')
  @response(200, {description: 'Troca o status e/ou a disponibilidade'})
  async updateMine(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              status: {type: 'string'},
              availability: {type: 'string'},
            },
          },
        },
      },
    })
    body: UpdatePresenceInput,
  ): Promise<MyPresence> {
    const update: {
      status?: ChosenPresenceStatus;
      availability?: PlayAvailability;
    } = {};
    if (body?.status !== undefined) {
      if (!CHOSEN_PRESENCE_STATUSES.includes(body.status))
        throw new HttpErrors.UnprocessableEntity('Status inválido');
      update.status = body.status;
    }
    if (body?.availability !== undefined) {
      if (!PLAY_AVAILABILITIES.includes(body.availability))
        throw new HttpErrors.UnprocessableEntity('Disponibilidade inválida');
      update.availability = body.availability;
    }
    return this.presence.setChoice(currentUser.id, update);
  }
}
