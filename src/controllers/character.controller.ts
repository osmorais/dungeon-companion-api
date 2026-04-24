import {inject} from '@loopback/core';
import {get, param, post, requestBody, response, HttpErrors} from '@loopback/rest';
import {AiAgentService, CharacterSheetService} from '../services';
import {CharacterInput} from '../models/character-sheet-types';

export class CharacterController {
  constructor(
    @inject('services.AiAgentService')
    public aiAgentService: AiAgentService,
    @inject('services.CharacterSheetService')
    public characterSheetService: CharacterSheetService,
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

  @post('/api/character-sheet')
  @response(200, {
    description: 'Builds a complete D&D 5e character sheet from structured input, applying all rules deterministically',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  buildSheet(
    @requestBody({
      description: 'Character build input',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    input: CharacterInput,
  ): object {
    return this.characterSheetService.saveCharacter(input);
  }

  @get('/api/character-sheet/{id}')
  @response(200, {
    description: 'Returns the full character sheet for the given character ID',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getSheet(
    @param.path.number('id') id: number,
  ): Promise<object> {
    const sheet = await this.characterSheetService.loadCharacter(id);
    if (!sheet) throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    return sheet;
  }
}