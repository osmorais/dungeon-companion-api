/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {
  del,
  get,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {CompanionService} from '../services/companion.service';

/** Companheiro Animal do ranger na mesa: o jogador do ranger e o mestre mexem; todos veem. */
@authenticate('jwt')
export class CompanionController {
  constructor(
    @service(CompanionService)
    private companions: CompanionService,
  ) {}

  @get('/api/game-session/{id}/companion-options')
  @response(200, {description: 'Bestas que o ranger pode ter como companheiro'})
  async options(
    @param.path.string('id') id: string,
    @param.query.string('id_player_session') idPlayerSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    return this.companions.options(id, idPlayerSession, currentUser.id);
  }

  @post('/api/game-session/{id}/companion')
  @response(200, {description: 'Escolhe (ou troca) o companheiro do ranger'})
  async choose(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: '{id_player_session, slug}',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {id_player_session: string; slug: string},
  ): Promise<object> {
    return this.companions.choose(id, body ?? {}, currentUser.id);
  }

  @del('/api/game-session/companion/{idCompanion}')
  @response(204, {description: 'Dispensa o companheiro'})
  async dismiss(
    @param.path.string('idCompanion') idCompanion: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    await this.companions.dismiss(idCompanion, currentUser.id);
  }

  @patch('/api/game-session/companion/{idCompanion}/hp')
  @response(200, {description: 'Ajusta o PV atual do companheiro'})
  async setHp(
    @param.path.string('idCompanion') idCompanion: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: '{hp_current}',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {hp_current: number},
  ): Promise<object> {
    return this.companions.setHp(idCompanion, body?.hp_current, currentUser.id);
  }
}
