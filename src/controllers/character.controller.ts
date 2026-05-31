import {inject} from '@loopback/core';
import {get, param, patch, post, requestBody, response, HttpErrors} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {AiAgentService, CharacterSheetService} from '../services';
import {AvatarPreset, CharacterInput, CharacterBackground} from '../models/character-sheet-types';

@authenticate('jwt')
export class CharacterController {
  constructor(
    @inject('services.AiAgentService')
    public aiAgentService: AiAgentService,
    @inject('services.CharacterSheetService')
    public characterSheetService: CharacterSheetService,
  ) {}

  // @get('/api/generate-character')
  // @response(200, {
  //   description: 'Generates a D&D Character Sheet using AI',
  //   content: {'application/json': {schema: {type: 'object'}}},
  // })
  // async generate(
  //   @param.query.string('class') charClass = 'Rogue',
  //   @param.query.number('level') level = 1,
  // ): Promise<object> {
  //   return this.aiAgentService.generateCharacter(charClass, level);
  // }

  // @get('/api/generate-character-with-tools')
  // @response(200, {
  //   description: 'Generates a D&D Character Sheet — Claude rolls dice and looks up class features using tools',
  //   content: {'application/json': {schema: {type: 'object'}}},
  // })
  // async generateWithTools(
  //   @param.query.string('class') charClass = 'Fighter',
  //   @param.query.number('level') level = 3,
  // ): Promise<object> {
  //   return this.aiAgentService.generateCharacterWithTools(charClass, level);
  // }

  @post('/api/character-sheet')
  @response(200, {
    description: 'Builds a complete D&D 5e character sheet from structured input, applying all rules deterministically',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  buildSheet(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Character build input',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    input: CharacterInput,
  ): object {
    return this.characterSheetService.createCharacter(input, currentUser.id);
  }

  @post('/api/character-sheet/update-notes')
  @response(200, {
    description: 'Update character notes and history.',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  updateNotes(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Update character notes and history.',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    input: CharacterBackground,
  ): object {
    return this.characterSheetService.updateCharacterBackground(input, currentUser.id);
  }

  @get('/api/character-sheet')
  @response(200, {
    description: 'Returns a summary list of all characters',
    content: {'application/json': {schema: {type: 'array'}}},
  })
  async listSheets(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<object> {
    const MAX_PAGE_SIZE = 50;
    if ((pageSize || 50) > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;

    return this.characterSheetService.listCharactersPagedList(currentUser.id, pageSize || 10, page || 1);
  }

  @patch('/api/character-sheet/{id}/avatar')
  @response(200, {
    description: 'Updates the avatar preset for a character',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async updateAvatar(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Avatar preset',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: {avatar_preset: AvatarPreset},
  ): Promise<object> {
    return this.characterSheetService.updateAvatarPreset(id, body.avatar_preset, currentUser.id);
  }

  @get('/api/character-sheet/{id}/background')
  @response(200, {
    description: 'Returns the background (full_history) for the given character ID',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getBackground(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    try {
      return await this.characterSheetService.getCharacterBackground(id, currentUser.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Character not found') throw new HttpErrors.NotFound(`Character with id ${id} not found`);
      if (message === 'Unauthorized') throw new HttpErrors.Forbidden();
      throw e;
    }
  }

  @get('/api/character-sheet/{id}')
  @response(200, {
    description: 'Returns the full character sheet for the given character ID',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getSheet(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    const sheet = await this.characterSheetService.loadCharacter(id, currentUser.id);
    if (!sheet) throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    return sheet;
  }
}