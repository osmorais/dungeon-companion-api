/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {
  ActiveEffects,
  damageDefensesFor,
} from '../services/character-sheet/combat-features';
import {normalizeKey} from '../services/character-sheet/calculator';
import {StartingItem} from '../services/character-sheet/starting-items';
import {
  RELENTLESS_ENDURANCE_KEY,
  RELENTLESS_ENDURANCE_RACE_ID,
} from '../services/character-sheet/rules';
import {Sql, TransactionSql} from 'postgres';
import {PostgresDatasource} from '../datasources';
import {
  AddPlayerInput,
  CreateGameSessionInput,
  GameSession,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionSummary,
  GrantXpResult,
  MonsterAbilityKey,
  MonsterSession,
  MonsterSessionInput,
  NpcSession,
  PlayerSession,
  ReferenceImage,
  RollLogEntry,
  RollLogInput,
  ShownReferenceImage,
} from '../models/game-session-types';

/** Quantas rolagens ficam guardadas por sessão — não precisa de histórico ilimitado. */
const ROLL_LOG_RETENTION = 30;

@injectable({scope: BindingScope.TRANSIENT})
export class GameSessionRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async createSession(
    input: CreateGameSessionInput,
    userId: string,
  ): Promise<GameSessionCreated> {
    const {
      session_name,
      session_code,
      max_player_quantity,
      dm_name,
      npcs = [],
      monsters = [],
    } = input;

    return this.db.sql.begin(async sql => {
      const [session] = await sql<GameSession[]>`
        INSERT INTO game_session (session_name, session_code, max_player_quantity, dm_name, user_id)
        VALUES (${session_name}, ${session_code}, ${max_player_quantity}, ${dm_name}, ${userId})
        RETURNING id_game_session, session_name, session_code, max_player_quantity, dm_name, user_id, created_at
      `;

      const insertedNpcs: NpcSession[] = [];
      for (const npc of npcs) {
        const [row] = await sql<NpcSession[]>`
          INSERT INTO npc_session (id_game_session, id_character)
          VALUES (${session.id_game_session}, ${npc.id_character})
          RETURNING id_npc_session, id_game_session, id_character
        `;
        insertedNpcs.push(row);
      }

      const insertedMonsters: MonsterSession[] = [];
      for (const monster of monsters) {
        const row = await this.insertMonster(
          sql,
          session.id_game_session,
          monster,
        );
        insertedMonsters.push(row);
      }

      return {
        game_session: session,
        npcs: insertedNpcs,
        monsters: insertedMonsters,
      };
    });
  }

  /** Compartilhado entre createSession (dentro de uma transação) e addMonsterToSession (fora dela). */
  private async insertMonster(
    sql: Sql | TransactionSql,
    idGameSession: string,
    monster: MonsterSessionInput,
  ): Promise<MonsterSession> {
    const [row] = await sql<MonsterSession[]>`
      INSERT INTO monster_session (
        id_game_session, monster_api_slug, custom_name,
        hp_current, hp_max, ac, data_snapshot, image_url
      ) VALUES (
        ${idGameSession},
        ${monster.monster_api_slug},
        ${monster.custom_name ?? null},
        ${monster.hp_current},
        ${monster.hp_max},
        ${monster.ac},
        ${sql.json(monster.data_snapshot as any)},
        ${monster.image_url ?? null}
      )
      RETURNING id_monster_session, id_game_session, monster_api_slug, custom_name, hp_current, hp_max, ac, data_snapshot, is_revealed, image_url
    `;
    return row;
  }

  async addMonsterToSession(
    idGameSession: string,
    monster: MonsterSessionInput,
  ): Promise<MonsterSession> {
    return this.insertMonster(this.db.sql, idGameSession, monster);
  }

  /**
   * Cria uma nova linha em monster_session copiando todos os dados (nome, PV atual/máximo, CA,
   * snapshot, imagem) do monstro original — inclusive o PV atual, ao contrário de addMonster
   * (que sempre parte do PV máximo do catálogo). A cópia sempre entra oculta (mesmo default de
   * insertMonster), mesmo que o original já estivesse revelado.
   */
  async duplicateMonster(
    idMonsterSession: string,
    userId: string,
  ): Promise<{status: 'not_found' | 'unauthorized' | 'ok'; monster?: MonsterSession}> {
    const rows = await this.db.sql<
      (MonsterSession & {session_owner_id: string | null})[]
    >`
      SELECT ms.id_monster_session, ms.id_game_session, ms.monster_api_slug, ms.custom_name,
        ms.hp_current, ms.hp_max, ms.ac, ms.data_snapshot, ms.is_revealed, ms.image_url,
        gs.user_id AS session_owner_id
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};
    const original = rows[0];
    if (original.session_owner_id !== userId) return {status: 'unauthorized'};

    const monster = await this.insertMonster(this.db.sql, original.id_game_session, {
      monster_api_slug: original.monster_api_slug,
      custom_name: original.custom_name ?? undefined,
      hp_current: original.hp_current,
      hp_max: original.hp_max,
      ac: original.ac,
      data_snapshot: original.data_snapshot,
      image_url: original.image_url,
    });
    return {status: 'ok', monster};
  }

  async findById(id: string): Promise<GameSessionDetail | null> {
    const sessions = await this.db.sql<GameSession[]>`
      SELECT id_game_session, session_name, session_code, max_player_quantity, dm_name, user_id, created_at
      FROM game_session
      WHERE id_game_session = ${id}
      LIMIT 1
    `;
    if (!sessions.length) return null;

    const session = sessions[0];

    const playerRows = await this.db.sql<
      {
        id_player_session: string;
        id_game_session: string;
        id_character: number;
        player_name: string;
        user_id: string | null;
        character_name: string | null;
        character_class: string | null;
        character_race: string | null;
        character_level: number | null;
        max_hit_points: number | null;
        current_hit_points: number | null;
        temporary_hit_points: number | null;
        xp_points: number | null;
        image_url: string | null;
        avatar_preset: unknown | null;
        id_race: number | null;
        subrace: string | null;
        id_class: number | null;
        active_effects: ActiveEffects | null;
      }[]
    >`
      SELECT
        ps.id_player_session,
        ps.id_game_session,
        ps.id_character,
        ps.player_name,
        ps.user_id,
        c.name          AS character_name,
        cl.name         AS character_class,
        r.name          AS character_race,
        c.level         AS character_level,
        c.max_hit_points,
        c.current_hit_points,
        c.temporary_hit_points,
        c.xp_points,
        c.image_url,
        c.avatar_preset,
        c.id_race,
        c.subrace,
        c.id_class,
        c.active_effects
      FROM player_session ps
      LEFT JOIN character c  ON c.id_character = ps.id_character
      LEFT JOIN class     cl ON cl.id_class    = c.id_class
      LEFT JOIN race      r  ON r.id_race      = c.id_race
      WHERE ps.id_game_session = ${id}
    `;

    const players: PlayerSession[] = playerRows.map(row => ({
      id_player_session: row.id_player_session,
      id_game_session: row.id_game_session,
      id_character: row.id_character,
      player_name: row.player_name,
      user_id: row.user_id,
      character:
        row.character_name != null
          ? {
              name: row.character_name,
              class: row.character_class ?? '',
              race: row.character_race ?? '',
              level: row.character_level ?? 0,
              max_hit_points: row.max_hit_points ?? 0,
              current_hit_points: row.current_hit_points ?? 0,
              temporary_hit_points: row.temporary_hit_points ?? 0,
              experience_points: row.xp_points ?? 0,
              image_url: row.image_url ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              avatar_preset: (row.avatar_preset as any) ?? null,
              defenses: damageDefensesFor({
                idRace: row.id_race ?? 0,
                subrace: row.subrace ? normalizeKey(row.subrace) : null,
                idClass: row.id_class ?? 0,
                level: row.character_level ?? 0,
                activeEffects: row.active_effects,
              }),
            }
          : null,
    }));

    const npcRows = await this.db.sql<
      {
        id_npc_session: string;
        id_game_session: string;
        id_character: number;
        character_name: string | null;
        character_class: string | null;
        character_race: string | null;
        character_level: number | null;
        max_hit_points: number | null;
        current_hit_points: number | null;
        temporary_hit_points: number | null;
        xp_points: number | null;
        image_url: string | null;
        avatar_preset: unknown | null;
        id_race: number | null;
        subrace: string | null;
        id_class: number | null;
        active_effects: ActiveEffects | null;
      }[]
    >`
      SELECT
        ns.id_npc_session,
        ns.id_game_session,
        ns.id_character,
        c.name          AS character_name,
        cl.name         AS character_class,
        r.name          AS character_race,
        c.level         AS character_level,
        c.max_hit_points,
        c.current_hit_points,
        c.temporary_hit_points,
        c.xp_points,
        c.image_url,
        c.avatar_preset,
        c.id_race,
        c.subrace,
        c.id_class,
        c.active_effects
      FROM npc_session ns
      LEFT JOIN character c  ON c.id_character = ns.id_character
      LEFT JOIN class     cl ON cl.id_class    = c.id_class
      LEFT JOIN race      r  ON r.id_race      = c.id_race
      WHERE ns.id_game_session = ${id}
    `;

    const npcs: NpcSession[] = npcRows.map(row => ({
      id_npc_session: row.id_npc_session,
      id_game_session: row.id_game_session,
      id_character: row.id_character,
      character:
        row.character_name != null
          ? {
              name: row.character_name,
              class: row.character_class ?? '',
              race: row.character_race ?? '',
              level: row.character_level ?? 0,
              max_hit_points: row.max_hit_points ?? 0,
              current_hit_points: row.current_hit_points ?? 0,
              temporary_hit_points: row.temporary_hit_points ?? 0,
              experience_points: row.xp_points ?? 0,
              image_url: row.image_url ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              avatar_preset: (row.avatar_preset as any) ?? null,
              defenses: damageDefensesFor({
                idRace: row.id_race ?? 0,
                subrace: row.subrace ? normalizeKey(row.subrace) : null,
                idClass: row.id_class ?? 0,
                level: row.character_level ?? 0,
                activeEffects: row.active_effects,
              }),
            }
          : null,
    }));

    const monsters = await this.db.sql<MonsterSession[]>`
      SELECT id_monster_session, id_game_session, monster_api_slug, custom_name,
             hp_current, hp_max, ac, data_snapshot, is_revealed, image_url
      FROM monster_session
      WHERE id_game_session = ${id}
    `;

    const recent_rolls = await this.findRecentRolls(id);
    const [shown] = await this.db.sql<ShownReferenceImage[]>`
      SELECT ri.id_reference_image, ri.image_url, ri.title
      FROM game_session gs
      JOIN session_reference_image ri ON ri.id_reference_image = gs.shown_reference_image_id
      WHERE gs.id_game_session = ${id}
    `;

    return {
      game_session: session,
      players,
      npcs,
      monsters,
      // Recalculado no service, que sabe se quem está pedindo é o mestre ou um jogador.
      revealed_monsters: [],
      recent_rolls,
      combat: null,
      shown_reference_image: shown ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Imagens de referência (biblioteca do mestre na sessão)
  // ---------------------------------------------------------------------------

  /** Dono da sessão (`undefined` se a sessão não existe). */
  async findSessionOwnerId(idGameSession: string): Promise<string | null | undefined> {
    const [row] = await this.db.sql<{user_id: string | null}[]>`
      SELECT user_id FROM game_session WHERE id_game_session = ${idGameSession}
    `;
    return row ? row.user_id : undefined;
  }

  async listReferenceImages(idGameSession: string): Promise<ReferenceImage[]> {
    return this.db.sql<ReferenceImage[]>`
      SELECT id_reference_image, id_game_session, image_url, title, created_at
      FROM session_reference_image
      WHERE id_game_session = ${idGameSession}
      ORDER BY created_at DESC
    `;
  }

  async countReferenceImages(idGameSession: string): Promise<number> {
    const [row] = await this.db.sql<{count: number}[]>`
      SELECT COUNT(*)::int AS count FROM session_reference_image
      WHERE id_game_session = ${idGameSession}
    `;
    return row.count;
  }

  async addReferenceImage(
    idGameSession: string,
    imageUrl: string,
    title: string | null,
  ): Promise<ReferenceImage> {
    const [row] = await this.db.sql<ReferenceImage[]>`
      INSERT INTO session_reference_image (id_game_session, image_url, title)
      VALUES (${idGameSession}, ${imageUrl}, ${title})
      RETURNING id_reference_image, id_game_session, image_url, title, created_at
    `;
    return row;
  }

  /** Imagem + dono da sessão + se é a que está em exibição. */
  async findReferenceImage(idReferenceImage: string): Promise<
    | (ReferenceImage & {session_owner_id: string | null; is_shown: boolean})
    | null
  > {
    const [row] = await this.db.sql<
      (ReferenceImage & {session_owner_id: string | null; is_shown: boolean})[]
    >`
      SELECT ri.id_reference_image, ri.id_game_session, ri.image_url, ri.title, ri.created_at,
             gs.user_id AS session_owner_id,
             (gs.shown_reference_image_id = ri.id_reference_image) IS TRUE AS is_shown
      FROM session_reference_image ri
      JOIN game_session gs ON gs.id_game_session = ri.id_game_session
      WHERE ri.id_reference_image = ${idReferenceImage}
    `;
    return row ?? null;
  }

  async setShownReferenceImage(
    idGameSession: string,
    idReferenceImage: string | null,
  ): Promise<void> {
    await this.db.sql`
      UPDATE game_session SET shown_reference_image_id = ${idReferenceImage}
      WHERE id_game_session = ${idGameSession}
    `;
  }

  /** Apaga da biblioteca; se estava em exibição, o FK zera `shown_reference_image_id`. */
  async deleteReferenceImage(idReferenceImage: string): Promise<void> {
    await this.db.sql`
      DELETE FROM session_reference_image WHERE id_reference_image = ${idReferenceImage}
    `;
  }

  async addRoll(
    idGameSession: string,
    input: RollLogInput,
  ): Promise<RollLogEntry> {
    const [row] = await this.db.sql<RollLogEntry[]>`
      INSERT INTO session_roll_log (
        id_game_session, id_character, actor_name, roll_type, label,
        dice_notation, rolls, advantage_state, modifier, total, is_hidden
      ) VALUES (
        ${idGameSession}, ${input.id_character}, ${input.actor_name}, ${input.roll_type}, ${input.label},
        ${input.dice_notation}, ${input.rolls}, ${input.advantage_state}, ${input.modifier}, ${input.total},
        ${input.is_hidden ?? false}
      )
      RETURNING id_roll, id_game_session, id_character, actor_name, roll_type, label,
                dice_notation, rolls, advantage_state, modifier, total, created_at, is_hidden
    `;

    // Poda o histórico pra não crescer pra sempre — mantém só as ROLL_LOG_RETENTION mais
    // recentes da sessão. Roda a cada rolagem: a subquery é barata (ordena por índice,
    // LIMIT pequeno) mesmo com o histórico completo acumulado até aqui.
    await this.db.sql`
      DELETE FROM session_roll_log
      WHERE id_game_session = ${idGameSession}
        AND id_roll NOT IN (
          SELECT id_roll FROM session_roll_log
          WHERE id_game_session = ${idGameSession}
          ORDER BY created_at DESC
          LIMIT ${ROLL_LOG_RETENTION}
        )
    `;

    return row;
  }

  async findRecentRolls(
    idGameSession: string,
    limit = ROLL_LOG_RETENTION,
  ): Promise<RollLogEntry[]> {
    return this.db.sql<RollLogEntry[]>`
      SELECT id_roll, id_game_session, id_character, actor_name, roll_type, label,
             dice_notation, rolls, advantage_state, modifier, total, created_at, is_hidden
      FROM session_roll_log
      WHERE id_game_session = ${idGameSession}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  /** Mestre pode rolar por qualquer personagem da sessão; jogador só pelo seu próprio. */
  async canPostRollFor(
    idGameSession: string,
    idCharacter: number | null,
    userId: string,
  ): Promise<boolean> {
    if (idCharacter === null) return true;
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM game_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
        UNION ALL
        SELECT 1 FROM player_session
        WHERE id_game_session = ${idGameSession} AND id_character = ${idCharacter} AND user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  async hasSessionAccess(
    idGameSession: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM game_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
        UNION ALL
        SELECT 1 FROM player_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  /** Dono e anotações do mestre — `null` se a sessão não existe. */
  async findDmNotes(
    idGameSession: string,
  ): Promise<{user_id: string; dm_notes: string | null} | null> {
    const rows = await this.db.sql<{user_id: string; dm_notes: string | null}[]>`
      SELECT user_id, dm_notes FROM game_session WHERE id_game_session = ${idGameSession}
    `;
    return rows[0] ?? null;
  }

  async updateDmNotes(idGameSession: string, notes: string | null): Promise<void> {
    await this.db.sql`
      UPDATE game_session SET dm_notes = ${notes} WHERE id_game_session = ${idGameSession}
    `;
  }

  async isSessionOwner(
    idGameSession: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM game_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  /** Só o mestre da sessão concede XP; cada `id_player_session` listado recebe o valor cheio (não dividido). */
  async grantXp(
    idGameSession: string,
    xpAmount: number,
    idPlayerSessions: string[],
    idNpcSessions: string[],
    userId: string,
  ): Promise<{status: 'unauthorized' | 'ok'; granted: GrantXpResult[]}> {
    const isOwner = await this.isSessionOwner(idGameSession, userId);
    if (!isOwner) return {status: 'unauthorized', granted: []};

    const granted: GrantXpResult[] = [];

    if (idPlayerSessions.length) {
      const rows = await this.db.sql<{id_player_session: string; id_character: number}[]>`
        SELECT id_player_session, id_character FROM player_session
        WHERE id_game_session = ${idGameSession} AND id_player_session = ANY(${idPlayerSessions})
      `;
      for (const row of rows) {
        const [updated] = await this.db.sql<{xp_points: number; level: number; name: string}[]>`
          UPDATE character SET xp_points = xp_points + ${xpAmount}
          WHERE id_character = ${row.id_character}
          RETURNING xp_points, level, name
        `;
        granted.push({
          participant_type: 'player',
          id_player_session: row.id_player_session,
          id_character: row.id_character,
          character_name: updated.name,
          xp_points: updated.xp_points,
          level: updated.level,
        });
      }
    }

    if (idNpcSessions.length) {
      const rows = await this.db.sql<{id_npc_session: string; id_character: number}[]>`
        SELECT id_npc_session, id_character FROM npc_session
        WHERE id_game_session = ${idGameSession} AND id_npc_session = ANY(${idNpcSessions})
      `;
      for (const row of rows) {
        const [updated] = await this.db.sql<{xp_points: number; level: number; name: string}[]>`
          UPDATE character SET xp_points = xp_points + ${xpAmount}
          WHERE id_character = ${row.id_character}
          RETURNING xp_points, level, name
        `;
        granted.push({
          participant_type: 'npc',
          id_npc_session: row.id_npc_session,
          id_character: row.id_character,
          character_name: updated.name,
          xp_points: updated.xp_points,
          level: updated.level,
        });
      }
    }

    return {status: 'ok', granted};
  }

  /** O mestre de qualquer sessão onde esse personagem participa (como jogador ou NPC) pode gerenciá-lo. */
  async isDmOfCharacter(idCharacter: number, userId: string): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM player_session ps
        JOIN game_session gs ON gs.id_game_session = ps.id_game_session
        WHERE ps.id_character = ${idCharacter} AND gs.user_id = ${userId}
        UNION ALL
        SELECT 1 FROM npc_session ns
        JOIN game_session gs ON gs.id_game_session = ns.id_game_session
        WHERE ns.id_character = ${idCharacter} AND gs.user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  async findSessionByCode(
    sessionCode: string,
  ): Promise<{id_game_session: string; max_player_quantity: number} | null> {
    const rows = await this.db.sql<
      {id_game_session: string; max_player_quantity: number}[]
    >`
      SELECT id_game_session, max_player_quantity
      FROM game_session
      WHERE session_code = ${sessionCode}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async isUserInSession(
    idGameSession: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.db.sql<{count: string}[]>`
      SELECT COUNT(*) AS count
      FROM player_session
      WHERE id_game_session = ${idGameSession}
        AND user_id = ${userId}
    `;
    return parseInt(rows[0].count, 10) > 0;
  }

  async countPlayers(idGameSession: string): Promise<number> {
    const rows = await this.db.sql<{count: string}[]>`
      SELECT COUNT(*) AS count
      FROM player_session
      WHERE id_game_session = ${idGameSession}
    `;
    return parseInt(rows[0].count, 10);
  }

  async addPlayer(
    input: AddPlayerInput,
    idGameSession: string,
    startingItems: StartingItem[] = [],
  ): Promise<PlayerSession> {
    // Jogador e itens iniciais no inventário da sessão entram juntos (ou nenhum dos dois).
    const inserted = await this.db.sql.begin(async sql => {
      const [row] = await sql<{id_player_session: string}[]>`
        INSERT INTO player_session (id_game_session, id_character, player_name, user_id)
        VALUES (${idGameSession}, ${input.id_character}, ${input.player_name}, ${input.user_id ?? null})
        RETURNING id_player_session
      `;
      await this.insertStartingItems(sql, row.id_player_session, startingItems);
      return row;
    });

    const rows = await this.db.sql<
      {
        id_player_session: string;
        id_game_session: string;
        id_character: number;
        player_name: string;
        user_id: string | null;
        character_name: string | null;
        character_class: string | null;
        character_race: string | null;
        character_level: number | null;
        max_hit_points: number | null;
        current_hit_points: number | null;
        temporary_hit_points: number | null;
        xp_points: number | null;
        image_url: string | null;
        avatar_preset: unknown | null;
      }[]
    >`
      SELECT
        ps.id_player_session,
        ps.id_game_session,
        ps.id_character,
        ps.player_name,
        ps.user_id,
        c.name          AS character_name,
        cl.name         AS character_class,
        r.name          AS character_race,
        c.level         AS character_level,
        c.max_hit_points,
        c.current_hit_points,
        c.temporary_hit_points,
        c.xp_points,
        c.image_url,
        c.avatar_preset
      FROM player_session ps
      LEFT JOIN character c  ON c.id_character = ps.id_character
      LEFT JOIN class     cl ON cl.id_class    = c.id_class
      LEFT JOIN race      r  ON r.id_race      = c.id_race
      WHERE ps.id_player_session = ${inserted.id_player_session}
      LIMIT 1
    `;

    const row = rows[0];
    return {
      id_player_session: row.id_player_session,
      id_game_session: row.id_game_session,
      id_character: row.id_character,
      player_name: row.player_name,
      user_id: row.user_id,
      character:
        row.character_name != null
          ? {
              name: row.character_name,
              class: row.character_class ?? '',
              race: row.character_race ?? '',
              level: row.character_level ?? 0,
              max_hit_points: row.max_hit_points ?? 0,
              current_hit_points: row.current_hit_points ?? 0,
              temporary_hit_points: row.temporary_hit_points ?? 0,
              experience_points: row.xp_points ?? 0,
              image_url: row.image_url ?? null,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              avatar_preset: (row.avatar_preset as any) ?? null,
            }
          : null,
    };
  }

  async removeNpc(
    idNpcSession: string,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
  }> {
    const rows = await this.db.sql<
      {id_game_session: string; session_owner_id: string | null}[]
    >`
      SELECT ns.id_game_session, gs.user_id AS session_owner_id
      FROM npc_session ns
      JOIN game_session gs ON gs.id_game_session = ns.id_game_session
      WHERE ns.id_npc_session = ${idNpcSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};
    if (rows[0].session_owner_id !== userId) return {status: 'unauthorized'};

    await this.db
      .sql`DELETE FROM npc_session WHERE id_npc_session = ${idNpcSession}`;
    return {status: 'ok', idGameSession: rows[0].id_game_session};
  }

  /**
   * Só o mestre da sessão pode remover um monstro. Devolve nome/snapshot além do id da sessão
   * porque `GameSessionService.defeatMonster` precisa montar o texto da notificação de
   * derrota sem uma segunda query.
   */
  async removeMonster(
    idMonsterSession: string,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
    customName?: string | null;
    dataSnapshot?: Record<string, unknown>;
    imageUrl?: string | null;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        session_owner_id: string | null;
        custom_name: string | null;
        data_snapshot: Record<string, unknown>;
        image_url: string | null;
      }[]
    >`
      SELECT ms.id_game_session, gs.user_id AS session_owner_id, ms.custom_name, ms.data_snapshot, ms.image_url
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};
    const {
      id_game_session,
      session_owner_id,
      custom_name,
      data_snapshot,
      image_url,
    } = rows[0];
    if (session_owner_id !== userId) return {status: 'unauthorized'};

    await this.db
      .sql`DELETE FROM monster_session WHERE id_monster_session = ${idMonsterSession}`;
    return {
      status: 'ok',
      idGameSession: id_game_session,
      customName: custom_name,
      dataSnapshot: data_snapshot,
      imageUrl: image_url,
    };
  }

  async addNpc(
    idGameSession: string,
    idCharacter: number,
  ): Promise<NpcSession> {
    const [row] = await this.db.sql<NpcSession[]>`
      INSERT INTO npc_session (id_game_session, id_character)
      VALUES (${idGameSession}, ${idCharacter})
      RETURNING id_npc_session, id_game_session, id_character
    `;
    return row;
  }

  async removePlayer(
    idPlayerSession: string,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        user_id: string | null;
        session_owner_id: string | null;
      }[]
    >`
      SELECT ps.id_game_session, ps.user_id, gs.user_id AS session_owner_id
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE ps.id_player_session = ${idPlayerSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {id_game_session, user_id, session_owner_id} = rows[0];
    const isOwnPlayer = user_id === userId;
    const isSessionOwner = session_owner_id === userId;
    if (!isOwnPlayer && !isSessionOwner) return {status: 'unauthorized'};

    await this.db.sql`
      DELETE FROM player_session WHERE id_player_session = ${idPlayerSession}
    `;
    return {status: 'ok', idGameSession: id_game_session};
  }

  async updateCharacterHp(
    idPlayerSession: string,
    currentHitPoints: number,
    temporaryHitPoints: number,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
    /** PV gravado — pode ser 1 em vez de 0 (Resistência Implacável). */
    currentHitPoints?: number;
    /** Nome do personagem quando a Resistência Implacável foi usada agora. */
    relentlessEndurance?: {idCharacter: number; name: string} | null;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        id_character: number;
        player_user_id: string | null;
        session_owner_id: string | null;
      }[]
    >`
      SELECT ps.id_game_session, ps.id_character, ps.user_id AS player_user_id, gs.user_id AS session_owner_id
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE ps.id_player_session = ${idPlayerSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {id_game_session, id_character, player_user_id, session_owner_id} =
      rows[0];
    if (player_user_id !== userId && session_owner_id !== userId)
      return {status: 'unauthorized'};

    const {finalHp, relentlessEndurance} = await this.resolveRelentlessEndurance(
      id_character,
      currentHitPoints,
    );

    await this.db.sql`
      UPDATE character
      SET current_hit_points = ${finalHp}, temporary_hit_points = ${temporaryHitPoints}
      WHERE id_character = ${id_character}
    `;
    return {
      status: 'ok',
      idGameSession: id_game_session,
      currentHitPoints: finalHp,
      relentlessEndurance,
    };
  }

  /**
   * Meio-Orc — Resistência Implacável: dano que zeraria o PV deixa com 1, uma vez por descanso
   * longo (o uso fica no mesmo `resource_uses_expended` dos outros recursos). Só personagem de
   * jogador; devolve o PV a gravar e, se a habilidade entrou agora, o nome pro aviso da mesa.
   */
  async resolveRelentlessEndurance(
    idCharacter: number,
    newHp: number,
  ): Promise<{
    finalHp: number;
    relentlessEndurance: {idCharacter: number; name: string} | null;
  }> {
    if (newHp > 0) return {finalHp: newHp, relentlessEndurance: null};
    const [character] = await this.db.sql<
      {
        name: string;
        id_race: number;
        current_hit_points: number;
        resource_uses_expended: Record<string, number> | null;
      }[]
    >`
      SELECT name, id_race, current_hit_points, resource_uses_expended
      FROM character WHERE id_character = ${idCharacter}
    `;
    const used = character?.resource_uses_expended?.[RELENTLESS_ENDURANCE_KEY] ?? 0;
    if (
      !character ||
      character.id_race !== RELENTLESS_ENDURANCE_RACE_ID ||
      character.current_hit_points <= 0 ||
      used >= 1
    ) {
      return {finalHp: newHp, relentlessEndurance: null};
    }
    await this.db.sql`
      UPDATE character
      SET resource_uses_expended = ${this.db.sql.json({
        ...(character.resource_uses_expended ?? {}),
        [RELENTLESS_ENDURANCE_KEY]: 1,
      })}
      WHERE id_character = ${idCharacter}
    `;
    return {finalHp: 1, relentlessEndurance: {idCharacter, name: character.name}};
  }

  /**
   * Alvo de "aplicar dano/cura" dentro da sessão (jogador, NPC ou monstro), com o PV atual —
   * `null` se não existe nessa sessão. Monstro traz o nome que a mesa vê e se está revelado.
   */
  async findApplyTarget(
    idGameSession: string,
    kind: 'player' | 'npc' | 'monster',
    id: string,
  ): Promise<{
    id_character: number | null;
    label: string;
    current: number;
    max: number;
    temp: number;
    is_revealed: boolean;
  } | null> {
    if (kind === 'monster') {
      const [row] = await this.db.sql<
        {hp_current: number; hp_max: number; is_revealed: boolean; custom_name: string | null; snapshot_name: string | null}[]
      >`
        SELECT hp_current, hp_max, is_revealed, custom_name, data_snapshot->>'name' AS snapshot_name
        FROM monster_session
        WHERE id_monster_session = ${id} AND id_game_session = ${idGameSession}
      `;
      if (!row) return null;
      return {
        id_character: null,
        label: row.custom_name ?? row.snapshot_name ?? 'Monstro',
        current: row.hp_current,
        max: row.hp_max,
        temp: 0,
        is_revealed: row.is_revealed,
      };
    }
    const rows =
      kind === 'player'
        ? await this.db.sql<{id_character: number; name: string; current_hit_points: number; max_hit_points: number; temporary_hit_points: number | null}[]>`
            SELECT c.id_character, c.name, c.current_hit_points, c.max_hit_points, c.temporary_hit_points
            FROM player_session ps JOIN character c ON c.id_character = ps.id_character
            WHERE ps.id_player_session = ${id} AND ps.id_game_session = ${idGameSession}
          `
        : await this.db.sql<{id_character: number; name: string; current_hit_points: number; max_hit_points: number; temporary_hit_points: number | null}[]>`
            SELECT c.id_character, c.name, c.current_hit_points, c.max_hit_points, c.temporary_hit_points
            FROM npc_session ns JOIN character c ON c.id_character = ns.id_character
            WHERE ns.id_npc_session = ${id} AND ns.id_game_session = ${idGameSession}
          `;
    const [row] = rows;
    if (!row) return null;
    return {
      id_character: row.id_character,
      label: row.name,
      current: row.current_hit_points,
      max: row.max_hit_points,
      temp: row.temporary_hit_points ?? 0,
      is_revealed: true,
    };
  }

  /** Grava o PV calculado no servidor (a permissão já foi conferida no service). */
  async writeCharacterHp(idCharacter: number, hp: number, temp: number): Promise<void> {
    await this.db.sql`
      UPDATE character SET current_hit_points = ${hp}, temporary_hit_points = ${temp}
      WHERE id_character = ${idCharacter}
    `;
  }

  async writeMonsterHp(idMonsterSession: string, hp: number): Promise<void> {
    await this.db.sql`
      UPDATE monster_session SET hp_current = ${hp} WHERE id_monster_session = ${idMonsterSession}
    `;
  }

  /** Nome do personagem que fez a rolagem (pro aviso "aplicou"). */
  async findCharacterName(idCharacter: number): Promise<string | null> {
    const [row] = await this.db.sql<{name: string}[]>`
      SELECT name FROM character WHERE id_character = ${idCharacter}
    `;
    return row?.name ?? null;
  }

  /** Só o mestre da sessão pode alterar o PV atual de um NPC. */
  async updateNpcHp(
    idNpcSession: string,
    currentHitPoints: number,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        id_character: number;
        session_owner_id: string | null;
      }[]
    >`
      SELECT ns.id_game_session, ns.id_character, gs.user_id AS session_owner_id
      FROM npc_session ns
      JOIN game_session gs ON gs.id_game_session = ns.id_game_session
      WHERE ns.id_npc_session = ${idNpcSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {id_game_session, id_character, session_owner_id} = rows[0];
    if (session_owner_id !== userId) return {status: 'unauthorized'};

    await this.db.sql`
      UPDATE character SET current_hit_points = ${currentHitPoints} WHERE id_character = ${id_character}
    `;
    return {status: 'ok', idGameSession: id_game_session};
  }

  /** Só o mestre da sessão pode alterar o PV atual de um monstro. */
  async updateMonsterHp(
    idMonsterSession: string,
    hpCurrent: number,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
  }> {
    const rows = await this.db.sql<
      {id_game_session: string; session_owner_id: string | null}[]
    >`
      SELECT ms.id_game_session, gs.user_id AS session_owner_id
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {id_game_session, session_owner_id} = rows[0];
    if (session_owner_id !== userId) return {status: 'unauthorized'};

    await this.db.sql`
      UPDATE monster_session SET hp_current = ${hpCurrent} WHERE id_monster_session = ${idMonsterSession}
    `;
    return {status: 'ok', idGameSession: id_game_session};
  }

  /** Só o mestre da sessão pode editar os status (nome, PV, CA, atributos) de um monstro. */
  async updateMonsterStats(
    idMonsterSession: string,
    userId: string,
    stats: {
      customName: string | null;
      hpCurrent: number;
      hpMax: number;
      ac: number;
      abilities?: Partial<Record<MonsterAbilityKey, number>>;
    },
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
    dataSnapshot?: Record<string, unknown>;
  }> {
    const rows = await this.db.sql<
      {id_game_session: string; session_owner_id: string | null; data_snapshot: Record<string, unknown>}[]
    >`
      SELECT ms.id_game_session, gs.user_id AS session_owner_id, ms.data_snapshot
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {id_game_session, session_owner_id, data_snapshot} = rows[0];
    if (session_owner_id !== userId) return {status: 'unauthorized'};

    const mergedSnapshot = stats.abilities ? {...data_snapshot, ...stats.abilities} : data_snapshot;

    await this.db.sql`
      UPDATE monster_session
      SET custom_name = ${stats.customName}, hp_current = ${stats.hpCurrent}, hp_max = ${stats.hpMax}, ac = ${stats.ac},
          data_snapshot = ${this.db.sql.json(mergedSnapshot as never)}
      WHERE id_monster_session = ${idMonsterSession}
    `;
    return {status: 'ok', idGameSession: id_game_session, dataSnapshot: mergedSnapshot};
  }

  /** Só o mestre da sessão pode revelar/esconder um monstro. */
  async setMonsterRevealed(
    idMonsterSession: string,
    revealed: boolean,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
    customName?: string | null;
    dataSnapshot?: Record<string, unknown>;
    imageUrl?: string | null;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        session_owner_id: string | null;
        custom_name: string | null;
        data_snapshot: Record<string, unknown>;
        image_url: string | null;
      }[]
    >`
      SELECT ms.id_game_session, gs.user_id AS session_owner_id, ms.custom_name, ms.data_snapshot, ms.image_url
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};

    const {
      id_game_session,
      session_owner_id,
      custom_name,
      data_snapshot,
      image_url,
    } = rows[0];
    if (session_owner_id !== userId) return {status: 'unauthorized'};

    await this.db.sql`
      UPDATE monster_session SET is_revealed = ${revealed} WHERE id_monster_session = ${idMonsterSession}
    `;
    return {
      status: 'ok',
      idGameSession: id_game_session,
      customName: custom_name,
      dataSnapshot: data_snapshot,
      imageUrl: image_url,
    };
  }

  /** Só o mestre da sessão pode trocar a imagem de um monstro já adicionado à sessão. */
  async setMonsterImage(
    idMonsterSession: string,
    userId: string,
    imageUrl: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    idGameSession?: string;
    monster?: MonsterSession;
    previousImageUrl?: string | null;
  }> {
    const rows = await this.db.sql<
      {
        id_game_session: string;
        session_owner_id: string | null;
        image_url: string | null;
      }[]
    >`
      SELECT ms.id_game_session, gs.user_id AS session_owner_id, ms.image_url
      FROM monster_session ms
      JOIN game_session gs ON gs.id_game_session = ms.id_game_session
      WHERE ms.id_monster_session = ${idMonsterSession}
      LIMIT 1
    `;
    if (!rows.length) return {status: 'not_found'};
    if (rows[0].session_owner_id !== userId) return {status: 'unauthorized'};

    const [monster] = await this.db.sql<MonsterSession[]>`
      UPDATE monster_session SET image_url = ${imageUrl}
      WHERE id_monster_session = ${idMonsterSession}
      RETURNING id_monster_session, id_game_session, monster_api_slug, custom_name,
                hp_current, hp_max, ac, data_snapshot, is_revealed, image_url
    `;
    return {
      status: 'ok',
      idGameSession: rows[0].id_game_session,
      monster,
      previousImageUrl: rows[0].image_url,
    };
  }

  /**
   * Revela em lote os monstros que ainda não estavam revelados (usado ao iniciar um combate —
   * "entrar na luta" já revela o monstro pros jogadores). Só devolve os que realmente mudaram de
   * estado, pra não disparar o anúncio de novo em quem já tinha sido revelado antes.
   */
  async revealMonsters(
    idGameSession: string,
    idMonsterSessions: string[],
  ): Promise<
    {
      id_monster_session: string;
      custom_name: string | null;
      data_snapshot: Record<string, unknown>;
      image_url: string | null;
    }[]
  > {
    if (!idMonsterSessions.length) return [];
    return this.db.sql<
      {
        id_monster_session: string;
        custom_name: string | null;
        data_snapshot: Record<string, unknown>;
        image_url: string | null;
      }[]
    >`
      UPDATE monster_session
      SET is_revealed = true
      WHERE id_game_session = ${idGameSession}
        AND id_monster_session = ANY(${idMonsterSessions})
        AND is_revealed = false
      RETURNING id_monster_session, custom_name, data_snapshot, image_url
    `;
  }

  /** Esconde todos os monstros revelados da sessão — chamado ao encerrar o combate. Devolve os ids afetados. */
  /** Fim do combate: os efeitos ativos (Fúria, Arma Sagrada) dos personagens da sessão acabam. */
  async clearActiveEffectsInSession(idGameSession: string): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET active_effects = NULL
      WHERE active_effects IS NOT NULL
        AND id_character IN (
          SELECT id_character FROM player_session WHERE id_game_session = ${idGameSession}
          UNION
          SELECT id_character FROM npc_session WHERE id_game_session = ${idGameSession}
        )
    `;
  }

  /** Nome, classe e nível do personagem (Inspiração Bárdica: quem dá). */
  async findCharacterBasics(
    idCharacter: number,
  ): Promise<{name: string; id_class: number; level: number} | null> {
    const [row] = await this.db.sql<{name: string; id_class: number; level: number}[]>`
      SELECT name, id_class, level FROM character WHERE id_character = ${idCharacter}
    `;
    return row ?? null;
  }

  /** Dono do personagem (`undefined` se o personagem não existe). */
  async findCharacterOwnerId(idCharacter: number): Promise<string | null | undefined> {
    const [row] = await this.db.sql<{user_id: string | null}[]>`
      SELECT user_id FROM character WHERE id_character = ${idCharacter}
    `;
    return row ? row.user_id : undefined;
  }

  /** Classe e antecedente do personagem — base do equipamento inicial (`startingInventory`). */
  async findStartingKit(
    idCharacter: number,
  ): Promise<{id_class: number; id_background: number | null} | null> {
    const [row] = await this.db.sql<{id_class: number; id_background: number | null}[]>`
      SELECT c.id_class, cb.id_background
      FROM character c
      LEFT JOIN character_background cb ON cb.id_character = c.id_character
      WHERE c.id_character = ${idCharacter}
      LIMIT 1
    `;
    return row ?? null;
  }

  /**
   * Coloca os itens iniciais no inventário da sessão, copiando nome/descrição/preço/peso do
   * catálogo `item` (mesmo formato de `PlayerInventoryRepository.addItem`). Item que já existe no
   * inventário soma a quantidade. Nome que não está no catálogo é ignorado (o teste de
   * integridade de `starting-items.ts` garante que não acontece).
   */
  private async insertStartingItems(
    sql: Sql | TransactionSql,
    idPlayerSession: string,
    items: StartingItem[],
  ): Promise<void> {
    if (!items.length) return;
    const names = items.map(i => i.item);
    const quantities = items.map(i => i.qty);
    await sql`
      INSERT INTO player_inventory_item (id_player_session, id_item, name, description, price_value, weight, quantity)
      SELECT ${idPlayerSession}, i.id_item, i.name, i.description, i.price_value, i.weight, x.qty
      FROM unnest(${names}::text[], ${quantities}::int[]) AS x(name, qty)
      JOIN item i ON i.name = x.name
      ON CONFLICT (id_player_session, id_item)
      DO UPDATE SET quantity = player_inventory_item.quantity + EXCLUDED.quantity
    `;
  }

  /** Guarda a Inspiração Bárdica no personagem do aliado (substitui uma anterior não usada). */
  async setBardicInspiration(
    idCharacter: number,
    inspiration: {sides: number; from: string},
  ): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET active_effects =
        COALESCE(active_effects, '{"active": [], "turn_uses": {}}'::jsonb)
        || jsonb_build_object('bardic_inspiration', ${this.db.sql.json(inspiration)}::jsonb)
      WHERE id_character = ${idCharacter}
    `;
  }

  async hideAllMonsters(idGameSession: string): Promise<string[]> {
    const rows = await this.db.sql<{id_monster_session: string}[]>`
      UPDATE monster_session SET is_revealed = false
      WHERE id_game_session = ${idGameSession} AND is_revealed = true
      RETURNING id_monster_session
    `;
    return rows.map(r => r.id_monster_session);
  }

  /**
   * Só o mestre (dono) apaga a sessão. Devolve as imagens dos monstros que estavam nela, pra
   * limpeza do storage depois que o DELETE em cascata já removeu os registros.
   */
  async deleteOwnedSession(
    id: string,
    userId: string,
  ): Promise<{
    status: 'not_found' | 'unauthorized' | 'ok';
    imageUrls: string[];
  }> {
    const sessions = await this.db.sql<{user_id: string | null}[]>`
      SELECT user_id FROM game_session WHERE id_game_session = ${id} LIMIT 1
    `;
    if (!sessions.length) return {status: 'not_found', imageUrls: []};
    if (sessions[0].user_id !== userId)
      return {status: 'unauthorized', imageUrls: []};

    const images = await this.db.sql<{image_url: string}[]>`
      SELECT image_url FROM monster_session
      WHERE id_game_session = ${id} AND image_url IS NOT NULL
      UNION
      SELECT image_url FROM session_reference_image WHERE id_game_session = ${id}
    `;
    await this.db.sql`
      DELETE FROM game_session WHERE id_game_session = ${id}
    `;
    return {status: 'ok', imageUrls: images.map(r => r.image_url)};
  }

  async findPagedByUser(
    userId: string,
    pageSize: number,
    page: number,
    role: 'dm' | 'player' | 'all' = 'all',
  ): Promise<GameSessionSummary[]> {
    if (role === 'dm') {
      return this.db.sql<GameSessionSummary[]>`
        SELECT
          gs.id_game_session, gs.session_name, gs.session_code, gs.max_player_quantity,
          gs.dm_name, gs.user_id, gs.created_at,
          COUNT(*) OVER() AS total_count
        FROM game_session gs
        WHERE gs.user_id = ${userId}
        ORDER BY gs.created_at DESC
        LIMIT ${pageSize}
        OFFSET (${page} - 1) * ${pageSize}
      `;
    }

    if (role === 'player') {
      return this.db.sql<GameSessionSummary[]>`
        SELECT
          gs.id_game_session, gs.session_name, gs.session_code, gs.max_player_quantity,
          gs.dm_name, gs.user_id, gs.created_at,
          COUNT(*) OVER() AS total_count
        FROM game_session gs
        JOIN player_session ps ON ps.id_game_session = gs.id_game_session
        WHERE ps.user_id = ${userId}
        ORDER BY gs.created_at DESC
        LIMIT ${pageSize}
        OFFSET (${page} - 1) * ${pageSize}
      `;
    }

    // 'all' — mestre OU jogador, mantido por compatibilidade com quem não passar role.
    return this.db.sql<GameSessionSummary[]>`
      SELECT
        id_game_session,
        session_name,
        session_code,
        max_player_quantity,
        dm_name,
        user_id,
        created_at,
        COUNT(*) OVER() AS total_count
      FROM (
        SELECT gs.id_game_session, gs.session_name, gs.session_code, gs.max_player_quantity, gs.dm_name, gs.user_id, gs.created_at
        FROM game_session gs
        WHERE gs.user_id = ${userId}
        UNION
        SELECT gs.id_game_session, gs.session_name, gs.session_code, gs.max_player_quantity, gs.dm_name, gs.user_id, gs.created_at
        FROM game_session gs
        JOIN player_session ps ON ps.id_game_session = gs.id_game_session
        WHERE ps.user_id = ${userId}
      ) sessions
      ORDER BY created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }
}
