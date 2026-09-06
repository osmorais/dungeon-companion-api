import {inject} from '@loopback/core';
import {get, param, patch, post, requestBody, response, HttpErrors, RestBindings, Response} from '@loopback/rest';
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

  @patch('/api/character-sheet/{id}/hp')
  @response(200, {
    description: 'Updates the current HP for a character',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async updateHp(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'New current HP value',
      required: true,
      content: {'application/json': {schema: {type: 'object', required: ['current_hit_points'], properties: {current_hit_points: {type: 'integer'}}}}},
    })
    body: {current_hit_points: number},
  ): Promise<object> {
    if (typeof body.current_hit_points !== 'number' || !Number.isInteger(body.current_hit_points)) {
      throw new HttpErrors.UnprocessableEntity('current_hit_points deve ser um número inteiro');
    }
    try {
      return await this.characterSheetService.updateCurrentHitPoints(id, body.current_hit_points, currentUser.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Character not found') throw new HttpErrors.NotFound(`Character with id ${id} not found`);
      if (message === 'Unauthorized') throw new HttpErrors.Forbidden();
      throw e;
    }
  }

  @patch('/api/character-sheet/{id}/spell-slots')
  @response(200, {
    description: 'Expends or restores one spell slot of the given level',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async updateSpellSlots(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Spell level and delta (1 to expend, -1 to restore)',
      required: true,
      content: {'application/json': {schema: {type: 'object', required: ['level', 'delta'], properties: {level: {type: 'integer'}, delta: {type: 'integer'}}}}},
    })
    body: {level: number; delta: number},
  ): Promise<object> {
    return this.characterSheetService.expendSpellSlot(id, body.level, body.delta, currentUser.id);
  }

  @post('/api/character-sheet/{id}/short-rest/hit-die')
  @response(200, {
    description: 'Spends one Hit Die to recover HP during a short rest',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async rollHitDie(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    return this.characterSheetService.rollHitDie(id, currentUser.id);
  }

  @post('/api/character-sheet/{id}/long-rest')
  @response(200, {
    description: 'Restores all HP, recovers half the Hit Dice (min 1) and resets expended spell slots',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async longRest(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<object> {
    return this.characterSheetService.longRest(id, currentUser.id);
  }

  @patch('/api/character-sheet/{id}/spells/{idSpell}/prepared')
  @response(200, {
    description: 'Marks a known spell as prepared or unprepared for the day',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async setSpellPrepared(
    @param.path.number('id') id: number,
    @param.path.number('idSpell') idSpell: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Prepared state',
      required: true,
      content: {'application/json': {schema: {type: 'object', required: ['is_prepared'], properties: {is_prepared: {type: 'boolean'}}}}},
    })
    body: {is_prepared: boolean},
  ): Promise<object> {
    return this.characterSheetService.setSpellPrepared(id, idSpell, body.is_prepared, currentUser.id);
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

  @get('/api/character-sheet/{id}/print')
  @response(200, {
    description: 'Returns a printable HTML character sheet',
    content: {'text/html': {schema: {type: 'string'}}},
  })
  async printSheet(
    @param.path.number('id') id: number,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<Response> {
    try {
      const html = await this.characterSheetService.getCharacterPrintHtml(id, currentUser.id);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
      return res;
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
    try {
      const sheet = await this.characterSheetService.loadCharacter(id, currentUser.id);
      if (!sheet) throw new HttpErrors.NotFound(`Character with id ${id} not found`);
      return sheet;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Character not found') throw new HttpErrors.NotFound(`Character with id ${id} not found`);
      if (message === 'Unauthorized') throw new HttpErrors.Forbidden();
      throw e;
    }
  }
}