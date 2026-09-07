/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {CombatService} from './combat.service';
import {SessionEventsService} from './session-events.service';
import {MonsterCatalogService} from './monster-catalog.service';
import {
  AddMonsterToSessionInput,
  AddPlayerInput,
  AdvantageState,
  CreateGameSessionInput,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionPagedList,
  MonsterSession,
  NpcSession,
  RevealedMonster,
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
    @service(MonsterCatalogService)
    private monsterCatalogService: MonsterCatalogService,
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

  /**
   * Adiciona um monstro à sessão — a partir de um monstro já catalogado (`id_monster_catalog`)
   * ou catalogando um novo na hora (`monster_api_slug`), que também fica salvo no bestiário do
   * mestre pra reuso futuro.
   */
  async addMonster(
    idGameSession: string,
    userId: string,
    input: AddMonsterToSessionInput,
  ): Promise<MonsterSession> {
    const session = await this.repository.findById(idGameSession);
    if (!session)
      throw new HttpErrors.NotFound(
        `Sessão com id ${idGameSession} não encontrada`,
      );
    if (session.game_session.user_id !== userId)
      throw new HttpErrors.Forbidden('Apenas o mestre pode adicionar monstros');

    let catalogEntry;
    if (input.id_monster_catalog) {
      catalogEntry = await this.monsterCatalogService.getCatalogEntry(input.id_monster_catalog, userId);
    } else if (input.monster_api_slug) {
      catalogEntry = await this.monsterCatalogService.catalogMonster(
        userId,
        input.monster_api_slug,
        input.custom_name ?? null,
      );
    } else {
      throw new HttpErrors.BadRequest('Informe id_monster_catalog ou monster_api_slug');
    }

    const monster = await this.repository.addMonsterToSession(idGameSession, {
      monster_api_slug: catalogEntry.monster_api_slug,
      custom_name: catalogEntry.custom_name ?? undefined,
      hp_current: catalogEntry.hp_max,
      hp_max: catalogEntry.hp_max,
      ac: catalogEntry.ac,
      data_snapshot: catalogEntry.data_snapshot,
    });
    this.events.publish(idGameSession);
    return monster;
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

    const isDm = session.game_session.user_id === userId;
    const revealedMonsters: RevealedMonster[] = session.monsters
      .filter(m => m.is_revealed)
      .map(m => ({
        id_monster_session: m.id_monster_session,
        name: m.custom_name ?? this.monsterSnapshotName(m),
      }));

    const combat = await this.combatService.getActiveEncounterDetail(id);
    return {
      ...session,
      monsters: isDm ? session.monsters : [],
      revealed_monsters: revealedMonsters,
      combat,
    };
  }

  /** Só o mestre pode alterar o PV atual de um NPC. */
  async updateNpcHp(
    idNpcSession: string,
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
    const result = await this.repository.updateNpcHp(
      idNpcSession,
      currentHitPoints,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('NPC não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode alterar a vida deste NPC',
      );
    this.events.publish(result.idGameSession!);
  }

  /** Só o mestre pode alterar o PV atual de um monstro. */
  async updateMonsterHp(
    idMonsterSession: string,
    hpCurrent: number,
    userId: string,
  ): Promise<void> {
    if (typeof hpCurrent !== 'number' || !Number.isInteger(hpCurrent)) {
      throw new HttpErrors.UnprocessableEntity(
        'hp_current deve ser um número inteiro',
      );
    }
    const result = await this.repository.updateMonsterHp(
      idMonsterSession,
      hpCurrent,
      userId,
    );
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden(
        'Você não tem permissão para alterar a vida deste monstro',
      );
    this.events.publish(result.idGameSession!);
  }

  /** Só o mestre pode revelar/esconder monstros da sessão. */
  async revealMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.setMonsterRevealed(idMonsterSession, true, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode revelar o monstro');
    this.events.publish(result.idGameSession!);
  }

  async hideMonster(idMonsterSession: string, userId: string): Promise<void> {
    const result = await this.repository.setMonsterRevealed(idMonsterSession, false, userId);
    if (result.status === 'not_found')
      throw new HttpErrors.NotFound('Monstro não encontrado na sessão');
    if (result.status === 'unauthorized')
      throw new HttpErrors.Forbidden('Apenas o mestre pode esconder o monstro');
    this.events.publish(result.idGameSession!);
  }

  private monsterSnapshotName(monster: MonsterSession): string {
    const snapshot = monster.data_snapshot as {name?: string};
    return snapshot.name ?? 'Monstro';
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
