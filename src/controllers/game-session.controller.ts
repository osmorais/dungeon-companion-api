import {inject} from '@loopback/core';
import {del, get, param, post, requestBody, response, HttpErrors} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {GameSessionService} from '../services/game-session.service';
import {AddPlayerInput, CreateGameSessionInput, GameSessionCreated, GameSessionDetail, GameSessionPagedList, PlayerSession} from '../models/game-session-types';

@authenticate('jwt')
export class GameSessionController {
  constructor(
    @inject('services.GameSessionService')
    private gameSessionService: GameSessionService,
  ) {}

  @post('/api/game-session')
  @response(201, {
    description: 'Creates a new game session with optional NPCs and monsters',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async createSession(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Game session creation input',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    input: CreateGameSessionInput,
  ): Promise<GameSessionCreated> {
    try {
      return await this.gameSessionService.createSession(input, currentUser.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Código da sessão já está em uso') throw new HttpErrors.Conflict(message);
      throw e;
    }
  }

  @get('/api/game-session')
  @response(200, {
    description: 'Returns a paginated list of game sessions',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async listSessions(
    @inject(SecurityBindings.USER) _currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<GameSessionPagedList> {
    const MAX_PAGE_SIZE = 50;
    const resolvedPageSize = Math.min(pageSize ?? 10, MAX_PAGE_SIZE);
    const resolvedPage = page ?? 1;
    return this.gameSessionService.listSessions(resolvedPageSize, resolvedPage);
  }

  @post('/api/game-session/player')
  @response(201, {
    description: 'Adds a player to a game session by session code',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async addPlayer(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Player session input',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    input: AddPlayerInput,
  ): Promise<PlayerSession> {
    return this.gameSessionService.addPlayer(input, currentUser.id);
  }

  @del('/api/game-session/player/{idPlayerSession}')
  @response(204, {description: 'Player removed from session'})
  async removePlayer(
    @param.path.string('idPlayerSession') idPlayerSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.gameSessionService.removePlayer(idPlayerSession, currentUser.id);
  }

  @del('/api/game-session/{id}')
  @response(204, {description: 'Game session deleted successfully'})
  async deleteSession(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) _currentUser: UserProfile,
  ): Promise<void> {
    try {
      await this.gameSessionService.deleteSession(id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.startsWith('Sessão com id')) throw new HttpErrors.NotFound(message);
      throw e;
    }
  }

  @get('/api/game-session/my-sessions')
  @response(200, {
    description: 'Returns a paginated list of game sessions the logged-in user owns or participates in',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async listUserSessions(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<GameSessionPagedList> {
    const MAX_PAGE_SIZE = 50;
    const resolvedPageSize = Math.min(pageSize ?? 10, MAX_PAGE_SIZE);
    const resolvedPage = page ?? 1;
    return this.gameSessionService.listUserSessions(currentUser.id, resolvedPageSize, resolvedPage);
  }

  @get('/api/game-session/{id}')
  @response(200, {
    description: 'Returns a game session by ID with its NPCs and monsters',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getSession(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<GameSessionDetail> {
    return this.gameSessionService.getSession(id, currentUser.id);
  }
}
