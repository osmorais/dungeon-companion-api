/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {CombatService} from './combat.service';
import {SessionEventsService} from './session-events.service';
import {
  AddPlayerInput,
  AdvantageState,
  CreateGameSessionInput,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionPagedList,
  NpcSession,
  PlayerSession,
  RollLogEntry,
  RollLogInput,
  RollType,
} from '../models/game-session-types';

const ROLL_TYPES: RollType[] = [
  'dice',
  'attack',
  'skill',
  'save',
  'spell',
  'initiative',
];
const ADVANTAGE_STATES: AdvantageState[] = [
  'normal',
  'advantage',
  'disadvantage',
];

@injectable({scope: BindingScope.TRANSIENT})
export class GameSessionService {
  constructor(
    @service(GameSessionRepository)
    private repository: GameSessionRepository,
    @service(CombatService)
    private combatService: CombatService,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  async createSession(
    input: CreateGameSessionInput,
    userId: string,
  ): Promise<GameSessionCreated> {
    const {session_name, session_code, max_player_quantity, dm_name} = input;

    if (!session_name?.trim())
      throw new HttpErrors.UnprocessableEntity('Nome da sessão é obrigatório');
    if (!session_code?.trim())
      throw new HttpErrors.UnprocessableEntity(
        'Código da sessão é obrigatório',
      );
    if (!dm_name?.trim())
      throw new HttpErrors.UnprocessableEntity('Nome do mestre é obrigatório');
    if (!max_player_quantity || max_player_quantity < 1)
      throw new HttpErrors.UnprocessableEntity(
        'Quantidade máxima de jogadores deve ser pelo menos 1',
      );

    try {
      return await this.repository.createSession(input, userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('unique') ||
        msg.includes('duplicate') ||
        msg.includes('session_code')
      ) {
        throw new HttpErrors.Conflict('Código da sessão já está em uso');
      }
      throw err;
    }
  }

  async addPlayer(
    input: AddPlayerInput,
    userId: string,
  ): Promise<PlayerSession> {
    if (!input.session_code?.trim())
      throw new HttpErrors.UnprocessableEntity(
        'Código da sessão é obrigatório',
      );
    if (!input.player_name?.trim())
      throw new HttpErrors.UnprocessableEntity('Nome do jogador é obrigatório');
    if (!input.id_character)
      throw new HttpErrors.UnprocessableEntity('id_character é obrigatório');

    const session = await this.repository.findSessionByCode(input.session_code);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');

    const alreadyIn = await this.repository.isUserInSession(
      session.id_game_session,
      userId,
    );
    if (alreadyIn)
      throw new HttpErrors.Conflict('Usuário já está nessa sessão');

    const currentCount = await this.repository.countPlayers(
      session.id_game_session,
    );
    if (currentCount >= session.max_player_quantity) {
      throw new HttpErrors.UnprocessableEntity(
        'A sessão já atingiu o número máximo de jogadores',
      );
    }

    const player = await this.repository.addPlayer(
      {...input, user_id: userId},
      session.id_game_session,
    );
    this.events.publish(session.id_game_session);
    return player;
  }

  async removeNpc(idNpcSession: string, userId: string): Promise<void> {
    const result = await this.repository.removeNpc(idNpcSession, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('NPC não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode remover NPCs');
    this.events.publish(result.idGameSession!);
  }

  async addNpc(
    idGameSession: string,
    idCharacter: number,
    userId: string,
  ): Promise<NpcSession> {
    const session = await this.repository.findById(idGameSession);
    if (!session)
      throw new HttpErrors.NotFound(
        `Sessão com id ${idGameSession} não encontrada`,
      );
    if (session.game_session.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode adicionar NPCs');
    const npc = await this.repository.addNpc(idGameSession, idCharacter);
    this.events.publish(idGameSession);
    return npc;
  }

  async removePlayer(idPlayerSession: string, userId: string): Promise<void> {
    const result = await this.repository.removePlayer(idPlayerSession, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não pode remover outro jogador da sessão',
      );
    this.events.publish(result.idGameSession!);
  }

  async updateCharacterHp(
    idPlayerSession: string,
    currentHitPoints: number,
    userId: string,
  ): Promise<void> {
    if (
      typeof currentHitPoints !== 'number' ||
      !Number.isInteger(currentHitPoints)
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'current_hit_points deve ser um número inteiro',
      );
    }
    const result = await this.repository.updateCharacterHp(
      idPlayerSession,
      currentHitPoints,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não tem permissão para alterar a vida deste personagem',
      );
    this.events.publish(result.idGameSession!);
  }

  async deleteSession(id: string): Promise<void> {
    const deleted = await this.repository.deleteById(id);
    if (!deleted)
      throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);
  }

  async getSession(id: string, userId: string): Promise<GameSessionDetail> {
    const session = await this.repository.findById(id);
    if (!session)
      throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);

    const hasAccess = await this.repository.hasSessionAccess(id, userId);
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    const combat = await this.combatService.getActiveEncounterDetail(id);
    return {...session, combat};
  }

  async hasSessionAccess(id: string, userId: string): Promise<boolean> {
    return this.repository.hasSessionAccess(id, userId);
  }

  async addRoll(
    idGameSession: string,
    input: RollLogInput,
    userId: string,
  ): Promise<RollLogEntry> {
    const hasAccess = await this.repository.hasSessionAccess(
      idGameSession,
      userId,
    );
    if (!hasAccess)
      throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    if (!input.actor_name?.trim())
      throw new HttpErrors.UnprocessableEntity('actor_name é obrigatório');
    if (!input.label?.trim())
      throw new HttpErrors.UnprocessableEntity('label é obrigatório');
    if (!input.dice_notation?.trim())
      throw new HttpErrors.UnprocessableEntity('dice_notation é obrigatório');
    if (!Array.isArray(input.rolls) || input.rolls.length === 0) {
      throw new HttpErrors.UnprocessableEntity(
        'rolls deve conter ao menos um valor',
      );
    }
    if (!ROLL_TYPES.includes(input.roll_type))
      throw new HttpErrors.UnprocessableEntity('roll_type inválido');
    if (!ADVANTAGE_STATES.includes(input.advantage_state)) {
      throw new HttpErrors.UnprocessableEntity('advantage_state inválido');
    }

    const idCharacter = input.id_character ?? null;
    const canPost = await this.repository.canPostRollFor(
      idGameSession,
      idCharacter,
      userId,
    );
    if (!canPost)
      throw new HttpErrors.Forbidden(
        'Você não pode registrar uma rolagem para esse personagem',
      );

    const roll = await this.repository.addRoll(idGameSession, {
      ...input,
      id_character: idCharacter,
    });
    this.events.publish(idGameSession);
    return roll;
  }

  async listSessions(
    pageSize: number,
    page: number,
  ): Promise<GameSessionPagedList> {
    const rows = await this.repository.findPaged(pageSize, page);
    return {
      GameSessionPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }

  async listUserSessions(
    userId: string,
    pageSize: number,
    page: number,
    role: 'dm' | 'player' | 'all' = 'all',
  ): Promise<GameSessionPagedList> {
    const rows = await this.repository.findPagedByUser(
      userId,
      pageSize,
      page,
      role,
    );
    return {
      GameSessionPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }
}
