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
  current_turn_participant_id: string | null;
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
      SELECT id_combat_encounter, id_game_session, status, round_number, current_turn_participant_id, created_at
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
      RETURNING id_combat_encounter, id_game_session, status, round_number, current_turn_participant_id, created_at
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

  /**
   * Retorna, para cada NPC válido da sessão, seu modificador de Destreza atual (não o
   * `initiative_value` congelado desde a criação — esse não acompanha ASI nem talentos como
   * Alerta). O bônus de talentos (ex: Alerta) é somado depois, na service, que já tem o
   * catálogo de feats — aqui só a parte que dá pra resolver em SQL.
   */
  async getValidNpcCombatInfo(
    idGameSession: string,
    idNpcSessions: string[],
  ): Promise<
    {id_npc_session: string; id_character: number; dex_modifier: number}[]
  > {
    if (!idNpcSessions.length) return [];
    return this.db.sql<
      {id_npc_session: string; id_character: number; dex_modifier: number}[]
    >`
      SELECT ns.id_npc_session, c.id_character, ca.modifier_value AS dex_modifier
      FROM npc_session ns
      JOIN character c ON c.id_character = ns.id_character
      JOIN character_attribute ca ON ca.id_character = c.id_character
      JOIN attribute_type at ON at.id_attribute = ca.id_attribute AND at.name = 'DES'
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

  /**
   * `dex_modifier` aqui é só o modificador de Destreza atual (mesmo motivo do método acima —
   * não usa mais o `initiative_value` congelado). `id_character` vai junto pra a service somar
   * o bônus de talentos (Alerta) e reordenar antes de devolver ao front — não faz parte do
   * `CombatParticipant` público.
   */
  async findParticipants(
    idCombatEncounter: string,
  ): Promise<(CombatParticipant & {id_character: number | null})[]> {
    return this.db.sql<(CombatParticipant & {id_character: number | null})[]>`
      SELECT
        cp.id_combat_participant,
        cp.id_combat_encounter,
        cp.participant_type,
        cp.id_player_session,
        cp.id_npc_session,
        cp.id_monster_session,
        cp.initiative_roll,
        cp.initiative_total,
        cp.turn_order,
        cp.delayed_this_round,
        COALESCE(pchar.id_character, nchar.id_character) AS id_character,
        COALESCE(pdex.modifier_value, ndex.modifier_value, 0) AS dex_modifier
      FROM combat_participant cp
      LEFT JOIN player_session ps ON ps.id_player_session = cp.id_player_session
      LEFT JOIN character pchar ON pchar.id_character = ps.id_character
      LEFT JOIN character_attribute pdex
        ON pdex.id_character = pchar.id_character
        AND pdex.id_attribute = (SELECT id_attribute FROM attribute_type WHERE name = 'DES')
      LEFT JOIN npc_session ns ON ns.id_npc_session = cp.id_npc_session
      LEFT JOIN character nchar ON nchar.id_character = ns.id_character
      LEFT JOIN character_attribute ndex
        ON ndex.id_character = nchar.id_character
        AND ndex.id_attribute = (SELECT id_attribute FROM attribute_type WHERE name = 'DES')
      WHERE cp.id_combat_encounter = ${idCombatEncounter}
      ORDER BY cp.turn_order ASC NULLS LAST, cp.initiative_total DESC NULLS LAST, dex_modifier DESC, cp.id_combat_participant ASC
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

  async activateEncounter(
    idCombatEncounter: string,
    firstParticipantId: string,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_encounter
      SET status = 'active', current_turn_participant_id = ${firstParticipantId}
      WHERE id_combat_encounter = ${idCombatEncounter}
    `;
  }

  async updateTurnState(
    idCombatEncounter: string,
    nextParticipantId: string,
    roundNumber: number,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_encounter
      SET current_turn_participant_id = ${nextParticipantId}, round_number = ${roundNumber}
      WHERE id_combat_encounter = ${idCombatEncounter}
    `;
  }

  async setTurnOrder(
    idCombatParticipant: string,
    turnOrder: number,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_participant SET turn_order = ${turnOrder}
      WHERE id_combat_participant = ${idCombatParticipant}
    `;
  }

  async setDelayed(
    idCombatParticipant: string,
    delayed: boolean,
  ): Promise<void> {
    await this.db.sql`
      UPDATE combat_participant SET delayed_this_round = ${delayed}
      WHERE id_combat_participant = ${idCombatParticipant}
    `;
  }

  /** Chamado quando uma nova rodada começa — atrasos só valem pra rodada em que foram pedidos. */
  async clearDelayedFlags(idCombatEncounter: string): Promise<void> {
    await this.db.sql`
      UPDATE combat_participant SET delayed_this_round = false
      WHERE id_combat_encounter = ${idCombatEncounter} AND delayed_this_round = true
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
        ce.current_turn_participant_id
      FROM combat_encounter ce
      JOIN game_session gs ON gs.id_game_session = ce.id_game_session
      WHERE ce.id_combat_encounter = ${idCombatEncounter}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  /** true se o personagem (como jogador ou NPC) está num combate ainda não encerrado, em
   *  qualquer sessão — usado pra travar preparo de magia durante o combate. */
  async isCharacterInActiveCombat(idCharacter: number): Promise<boolean> {
    const rows = await this.db.sql<{id_combat_participant: string}[]>`
      SELECT cp.id_combat_participant
      FROM combat_participant cp
      JOIN combat_encounter ce ON ce.id_combat_encounter = cp.id_combat_encounter
      LEFT JOIN player_session ps ON ps.id_player_session = cp.id_player_session
      LEFT JOIN npc_session ns ON ns.id_npc_session = cp.id_npc_session
      WHERE ce.status = ANY(${ACTIVE_STATUSES})
        AND (ps.id_character = ${idCharacter} OR ns.id_character = ${idCharacter})
      LIMIT 1
    `;
    return rows.length > 0;
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
