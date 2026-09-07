/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  CombatEncounter,
  CombatParticipant,
  CombatStatus,
} from '../models/combat-types';

const ACTIVE_STATUSES: CombatStatus[] = ['rolling_initiative', 'active'];

export interface ParticipantContext {
  id_combat_encounter: string;
  id_game_session: string;
  dm_user_id: string | null;
  status: CombatStatus;
  participant_type: 'player' | 'npc';
  player_user_id: string | null;
  initiative_total: number | null;
}

export interface EncounterContext {
  id_game_session: string;
  dm_user_id: string | null;
  status: CombatStatus;
  round_number: number;
  current_turn_index: number;
}

@injectable({scope: BindingScope.TRANSIENT})
export class CombatRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findActiveEncounterByGameSession(
    idGameSession: string,
  ): Promise<CombatEncounter | null> {
    const rows = await this.db.sql<CombatEncounter[]>`
      SELECT id_combat_encounter, id_game_session, status, round_number, current_turn_index, created_at
      FROM combat_encounter
      WHERE id_game_session = ${idGameSession} AND status = ANY(${ACTIVE_STATUSES})
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async createEncounter(idGameSession: string): Promise<CombatEncounter> {
    const [row] = await this.db.sql<CombatEncounter[]>`
      INSERT INTO combat_encounter (id_game_session)
      VALUES (${idGameSession})
      RETURNING id_combat_encounter, id_game_session, status, round_number, current_turn_index, created_at
    `;
    return row;
  }

  /** Retorna os id_player_session da lista que de fato pertencem a essa sessão. */
  async filterValidPlayerSessions(
    idGameSession: string,
    idPlayerSessions: string[],
  ): Promise<string[]> {
    if (!idPlayerSessions.length) return [];
    const rows = await this.db.sql<{id_player_session: string}[]>`
      SELECT id_player_session FROM player_session
      WHERE id_game_session = ${idGameSession} AND id_player_session = ANY(${idPlayerSessions})
    `;
    return rows.map(r => r.id_player_session);
  }

  /** Retorna, para cada NPC válido da sessão, seu modificador de Destreza (iniciativa). */
  async getValidNpcDexModifiers(
    idGameSession: string,
    idNpcSessions: string[],
  ): Promise<{id_npc_session: string; dex_modifier: number}[]> {
    if (!idNpcSessions.length) return [];
    return this.db.sql<{id_npc_session: string; dex_modifier: number}[]>`
      SELECT ns.id_npc_session, c.initiative_value AS dex_modifier
      FROM npc_session ns
      JOIN character c ON c.id_character = ns.id_character
      WHERE ns.id_game_session = ${idGameSession} AND ns.id_npc_session = ANY(${idNpcSessions})
    `;
  }

  async addPlayerParticipants(
    idCombatEncounter: string,
    idPlayerSessions: string[],
  ): Promise<void> {
    if (!idPlayerSessions.length) return;
    await this.db.sql`
      INSERT INTO combat_participant (id_combat_encounter, participant_type, id_player_session)
      SELECT ${idCombatEncounter}, 'player', ps.id_player_session
      FROM player_session ps
      WHERE ps.id_player_session = ANY(${idPlayerSessions})
    `;
  }

  async addNpcParticipant(
    idCombatEncounter: string,
    idNpcSession: string,
    initiativeRoll: number,
    initiativeTotal: number,
  ): Promise<void> {
    await this.db.sql`
      INSERT INTO combat_participant (id_combat_encounter, participant_type, id_npc_session, initiative_roll, initiative_total)
      VALUES (${idCombatEncounter}, 'npc', ${idNpcSession}, ${initiativeRoll}, ${initiativeTotal})
    `;
  }

  /** Retorna, para cada monstro válido da sessão, sua Destreza (usada pra rolar a iniciativa). */
  async getValidMonsterDexModifiers(
    idGameSession: string,
    idMonsterSessions: string[],
  ): Promise<{id_monster_session: string; dexterity: number}[]> {
    if (!idMonsterSessions.length) return [];
    return this.db.sql<{id_monster_session: string; dexterity: number}[]>`
      SELECT id_monster_session, COALESCE((data_snapshot->>'dexterity')::int, 10) AS dexterity
      FROM monster_session
      WHERE id_game_session = ${idGameSession} AND id_monster_session = ANY(${idMonsterSessions})
    `;
  }

  async addMonsterParticipant(
    idCombatEncounter: string,
    idMonsterSession: string,
    initiativeRoll: number,
    initiativeTotal: number,
  ): Promise<void> {
    await this.db.sql`
      INSERT INTO combat_participant (id_combat_encounter, participant_type, id_monster_session, initiative_roll, initiative_total)
      VALUES (${idCombatEncounter}, 'monster', ${idMonsterSession}, ${initiativeRoll}, ${initiativeTotal})
    `;
  }

  async findParticipants(
    idCombatEncounter: string,
  ): Promise<CombatParticipant[]> {
    return this.db.sql<CombatParticipant[]>`
      SELECT
        cp.id_combat_participant,
        cp.id_combat_encounter,
        cp.participant_type,
        cp.id_player_session,
        cp.id_npc_session,
        cp.id_monster_session,
        cp.initiative_roll,
        cp.initiative_total,
        COALESCE(pchar.initiative_value, nchar.initiative_value, 0) AS dex_modifier
      FROM combat_participant cp
      LEFT JOIN player_session ps ON ps.id_player_session = cp.id_player_session
      LEFT JOIN character pchar ON pchar.id_character = ps.id_character
      LEFT JOIN npc_session ns ON ns.id_npc_session = cp.id_npc_session
      LEFT JOIN character nchar ON nchar.id_character = ns.id_character
      WHERE cp.id_combat_encounter = ${idCombatEncounter}
      ORDER BY cp.initiative_total DESC NULLS LAST, dex_modifier DESC, cp.id_combat_participant ASC
    `;
  }

  async countPendingParticipants(idCombatEncounter: string): Promise<number> {
    const rows = await this.db.sql<{count: string}[]>`
      SELECT COUNT(*) AS count FROM combat_participant
      WHERE id_combat_encounter = ${idCombatEncounter} AND initiative_total IS NULL
    `;
    return parseInt(rows[0].count, 10);
  }

  async setParticipantInitiative(
    idCombatParticipant: string,
    roll: number,
    total: number,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_participant
      SET initiative_roll = ${roll}, initiative_total = ${total}
      WHERE id_combat_participant = ${idCombatParticipant}
    `;
  }

  async activateEncounter(idCombatEncounter: string): Promise<void> {
    await this.db.sql`
      UPDATE combat_encounter
      SET status = 'active', current_turn_index = 0
      WHERE id_combat_encounter = ${idCombatEncounter}
    `;
  }

  async updateTurnState(
    idCombatEncounter: string,
    currentTurnIndex: number,
    roundNumber: number,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_encounter
      SET current_turn_index = ${currentTurnIndex}, round_number = ${roundNumber}
      WHERE id_combat_encounter = ${idCombatEncounter}
    `;
  }

  async finishEncounter(idCombatEncounter: string): Promise<void> {
    await this.db.sql`
      UPDATE combat_encounter SET status = 'finished' WHERE id_combat_encounter = ${idCombatEncounter}
    `;
  }

  async findEncounterContext(
    idCombatEncounter: string,
  ): Promise<EncounterContext | null> {
    const rows = await this.db.sql<EncounterContext[]>`
      SELECT
        ce.id_game_session,
        gs.user_id AS dm_user_id,
        ce.status,
        ce.round_number,
        ce.current_turn_index
      FROM combat_encounter ce
      JOIN game_session gs ON gs.id_game_session = ce.id_game_session
      WHERE ce.id_combat_encounter = ${idCombatEncounter}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findParticipantContext(
    idCombatParticipant: string,
  ): Promise<ParticipantContext | null> {
    const rows = await this.db.sql<ParticipantContext[]>`
      SELECT
        cp.id_combat_encounter,
        ce.id_game_session,
        gs.user_id AS dm_user_id,
        ce.status,
        cp.participant_type,
        ps.user_id AS player_user_id,
        cp.initiative_total
      FROM combat_participant cp
      JOIN combat_encounter ce ON ce.id_combat_encounter = cp.id_combat_encounter
      JOIN game_session gs ON gs.id_game_session = ce.id_game_session
      LEFT JOIN player_session ps ON ps.id_player_session = cp.id_player_session
      WHERE cp.id_combat_participant = ${idCombatParticipant}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
