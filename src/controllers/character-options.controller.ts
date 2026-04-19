import {inject} from '@loopback/core';
import {get, response} from '@loopback/rest';
import {CharacterOptionsService} from '../services';
import {CharacterOptions} from '../services/character-options/types';

export class CharacterOptionsController {
  constructor(
    @inject('services.CharacterOptionsService')
    private characterOptionsService: CharacterOptionsService,
  ) {}

  @get('/api/character-options')
  @response(200, {
    description: 'Returns all attribute types and skills available for character creation',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getCharacterOptions(): Promise<CharacterOptions> {
    return this.characterOptionsService.getCharacterOptions();
  }
}
