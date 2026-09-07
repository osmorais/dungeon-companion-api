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
  HttpErrors,
  Response,
  RestBindings,
} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {GameSessionService} from '../services/game-session.service';
import {SessionEventsService} from '../services/session-events.service';
import {
  AddMonsterToSessionInput,
  AddPlayerInput,
  CreateGameSessionInput,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionPagedList,
  MonsterSession,
  NpcSession,
  PlayerSession,
  RollLogEntry,
  RollLogInput,
} from '../models/game-session-types';

const SSE_HEARTBEAT_MS = 20_000;

@authenticate('jwt')
export class GameSessionController {
  constructor(
    @inject('services.GameSessionService')
    private gameSessionService: GameSessionService,
    @service(SessionEventsService)
    private sessionEvents: SessionEventsService,
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
      if (message === 'Código da sessão já está em uso')
        throw new HttpErrors.Conflict(message);
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

  @post('/api/game-session/{id}/npc')
  @response(201, {
    description: 'Adds an NPC to a game session',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async addNpc(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'NPC to add',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id_character'],
            properties: {id_character: {type: 'integer'}},
          },
        },
      },
    })
    body: {id_character: number},
  ): Promise<NpcSession> {
    return this.gameSessionService.addNpc(
      id,
      body.id_character,
      currentUser.id,
    );
  }

  @post('/api/game-session/{id}/monster')
  @response(201, {
    description:
      'Adds a monster to a game session — from an already-cataloged monster or by cataloging a new one on the fly',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async addMonster(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Monster to add: either id_monster_catalog or monster_api_slug',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id_monster_catalog: {type: 'string'},
              monster_api_slug: {type: 'string'},
              custom_name: {type: 'string'},
            },
          },
        },
      },
    })
    body: AddMonsterToSessionInput,
  ): Promise<MonsterSession> {
    return this.gameSessionService.addMonster(id, currentUser.id, body);
  }

  @patch('/api/game-session/monster-session/{id}/hp')
  @response(204, {description: 'Monster current HP updated'})
  async updateMonsterHp(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'New current HP value',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['hp_current'],
            properties: {hp_current: {type: 'integer'}},
          },
        },
      },
    })
    body: {hp_current: number},
  ): Promise<void> {
    return this.gameSessionService.updateMonsterHp(id, body.hp_current, currentUser.id);
  }

  @post('/api/game-session/monster-session/{id}/reveal')
  @response(204, {description: 'Reveals a monster to the players (name only, no stats/HP)'})
  async revealMonster(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.gameSessionService.revealMonster(id, currentUser.id);
  }

  @post('/api/game-session/monster-session/{id}/hide')
  @response(204, {description: 'Hides a previously revealed monster from the players again'})
  async hideMonster(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.gameSessionService.hideMonster(id, currentUser.id);
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

  @patch('/api/game-session/player/{idPlayerSession}/hp')
  @response(204, {description: 'Current HP updated'})
  async updateCharacterHp(
    @param.path.string('idPlayerSession') idPlayerSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'New current HP value',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['current_hit_points'],
            properties: {current_hit_points: {type: 'integer'}},
          },
        },
      },
    })
    body: {current_hit_points: number},
  ): Promise<void> {
    return this.gameSessionService.updateCharacterHp(
      idPlayerSession,
      body.current_hit_points,
      currentUser.id,
    );
  }

  @patch('/api/game-session/npc/{idNpcSession}/hp')
  @response(204, {description: 'Current HP updated'})
  async updateNpcHp(
    @param.path.string('idNpcSession') idNpcSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'New current HP value',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['current_hit_points'],
            properties: {current_hit_points: {type: 'integer'}},
          },
        },
      },
    })
    body: {current_hit_points: number},
  ): Promise<void> {
    return this.gameSessionService.updateNpcHp(
      idNpcSession,
      body.current_hit_points,
      currentUser.id,
    );
  }

  @del('/api/game-session/npc/{idNpcSession}')
  @response(204, {description: 'NPC removed from session'})
  async removeNpc(
    @param.path.string('idNpcSession') idNpcSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.gameSessionService.removeNpc(idNpcSession, currentUser.id);
  }

  @del('/api/game-session/player/{idPlayerSession}')
  @response(204, {description: 'Player removed from session'})
  async removePlayer(
    @param.path.string('idPlayerSession') idPlayerSession: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.gameSessionService.removePlayer(
      idPlayerSession,
      currentUser.id,
    );
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
      if (message.startsWith('Sessão com id'))
        throw new HttpErrors.NotFound(message);
      throw e;
    }
  }

  @get('/api/game-session/my-sessions')
  @response(200, {
    description:
      'Returns a paginated list of game sessions the logged-in user owns or participates in',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async listUserSessions(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
    @param.query.string('role') role?: 'dm' | 'player' | 'all',
  ): Promise<GameSessionPagedList> {
    const MAX_PAGE_SIZE = 50;
    const resolvedPageSize = Math.min(pageSize ?? 10, MAX_PAGE_SIZE);
    const resolvedPage = page ?? 1;
    return this.gameSessionService.listUserSessions(
      currentUser.id,
      resolvedPageSize,
      resolvedPage,
      role ?? 'all',
    );
  }

  @post('/api/game-session/{id}/roll')
  @response(201, {
    description: 'Registers a dice roll in the game session log',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async addRoll(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'Roll to register',
      required: true,
      content: {'application/json': {schema: {type: 'object'}}},
    })
    body: RollLogInput,
  ): Promise<RollLogEntry> {
    return this.gameSessionService.addRoll(id, body, currentUser.id);
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

  /**
   * Canal de eventos em tempo real (Server-Sent Events) da sessão. Substitui o polling
   * do painel: o cliente escuta esse stream e, a cada evento `update`, refaz um
   * GET /api/game-session/{id} normal para buscar o estado completo mais recente.
   */
  @get('/api/game-session/{id}/events')
  @response(200, {description: 'Server-Sent Events stream of session updates'})
  async streamEvents(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<void> {
    const hasAccess = await this.gameSessionService.hasSessionAccess(
      id,
      currentUser.id,
    );
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':ok\n\n');

    const send = () => res.write('event: update\ndata: {}\n\n');
    const unsubscribe = this.sessionEvents.subscribe(id, send);
    const heartbeat = setInterval(
      () => res.write(':ping\n\n'),
      SSE_HEARTBEAT_MS,
    );

    return new Promise<void>(resolve => {
      res.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
        resolve();
      });
    });
  }
}
