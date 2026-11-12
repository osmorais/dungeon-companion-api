import {inject, service} from '@loopback/core';
import {del, get, param, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {WildShapeService} from '../services/wild-shape.service';

/** Forma Selvagem do druida: quem controla o personagem (dono ou mestre da mesa). */
@authenticate('jwt')
export class WildShapeController {
  constructor(
    @service(WildShapeService)
    private wildShape: WildShapeService,
  ) {}

  @get('/api/character-sheet/{id}/wild-shape/options')
  @response(200, {
    description: 'Bestas do bestiário que o druida pode virar no nível dele',
  })
  async options(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    return this.wildShape.options(id, currentUser.id);
  }

  @post('/api/character-sheet/{id}/wild-shape')
  @response(200, {
    description:
      'Transforma o druida na besta (gasta um uso de Forma Selvagem)',
  })
  async start(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: '{slug} da besta no bestiário',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {slug: string},
  ): Promise<object> {
    return this.wildShape.start(id, body?.slug, currentUser.id);
  }

  @del('/api/character-sheet/{id}/wild-shape')
  @response(200, {description: 'Volta o druida à forma normal'})
  async end(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    return this.wildShape.end(id, currentUser.id);
  }
}
