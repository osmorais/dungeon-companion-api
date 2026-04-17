import {inject} from '@loopback/core';
import {get, param, response} from '@loopback/rest';
import {AiAgentService} from '../services';

export class CharacterController {
  constructor(
    @inject('services.AiAgentService')
    public aiAgentService: AiAgentService,
  ) {}

  @get('/api/generate-character')
  @response(200, {
    description: 'Generates a D&D Character Sheet using AI',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async generate(
    @param.query.string('class') charClass = 'Rogue',
    @param.query.number('level') level = 1,
  ): Promise<object> {
    return this.aiAgentService.generateCharacter(charClass, level);
  }

  @get('/api/generate-character-with-tools')
  @response(200, {
    description: 'Generates a D&D Character Sheet — Claude rolls dice and looks up class features using tools',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async generateWithTools(
    @param.query.string('class') charClass = 'Fighter',
    @param.query.number('level') level = 3,
  ): Promise<object> {
    return this.aiAgentService.generateCharacterWithTools(charClass, level);
  }
}