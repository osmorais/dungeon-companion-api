/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {param, patch, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {AttackCheckService} from '../services/attack-check.service';

/** Acerto automático do ataque contra a CA do alvo (1.25.0) e a opção da mesa que liga isso. */
@authenticate('jwt')
export class AttackCheckController {
  constructor(
    @service(AttackCheckService)
    private attacks: AttackCheckService,
  ) {}

  @patch('/api/game-session/{id}/settings')
  @response(200, {
    description: 'Mestre muda as opções da mesa (acerto automático)',
  })
  async updateSettings(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {auto_hit_check?: unknown},
  ): Promise<object> {
    return this.attacks.setAutoHitCheck(
      id,
      body?.auto_hit_check,
      currentUser.id,
    );
  }

  @post('/api/game-session/{id}/attack-check')
  @response(200, {
    description:
      'Diz se o ataque acertou o alvo (sem revelar a CA) — só com a opção ligada',
  })
  async check(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {
      target_kind?: unknown;
      target_id?: unknown;
      total?: unknown;
      natural?: unknown;
    },
  ): Promise<{hit: boolean}> {
    return this.attacks.check(id, body, currentUser.id);
  }
}
