/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  AddPlayerInput,
  CreateGameSessionInput,
  GameSession,
  GameSessionCreated,
  GameSessionDetail,
  GameSessionSummary,
  MonsterSession,
  NpcSession,
  PlayerSession,
  RollLogEntry,
  RollLogInput,
} from '../models/game-session-types';

@injectable({scope: BindingScope.TRANSIENT})
export class GameSessionRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async createSession(input: CreateGameSessionInput, userId: string): Promise<GameSessionCreated> {
    const {session_name, session_code, max_player_quantity, dm_name, npcs = [], monsters = []} = input;

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
        const [row] = await sql<MonsterSession[]>`
          INSERT INTO monster_session (
            id_game_session, monster_api_slug, custom_name,
            hp_current, hp_max, ac, data_snapshot
          ) VALUES (
            ${session.id_game_session},
            ${monster.monster_api_slug},
            ${monster.custom_name ?? null},
            ${monster.hp_current},
            ${monster.hp_max},
            ${monster.ac},
            ${sql.json(monster.data_snapshot as any)}
          )
          RETURNING id_monster_session, id_game_session, monster_api_slug, custom_name, hp_current, hp_max, ac, data_snapshot
        `;
        insertedMonsters.push(row);
      }

      return {
        game_session: session,
        npcs: insertedNpcs,
        monsters: insertedMonsters,
      };
    });
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

    const playerRows = await this.db.sql<{
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
      avatar_preset: unknown | null;
    }[]>`
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
        c.avatar_preset
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
      character: row.character_name != null
        ? {
            name: row.character_name,
            class: row.character_class ?? '',
            race: row.character_race ?? '',
            level: row.character_level ?? 0,
            max_hit_points: row.max_hit_points ?? 0,
            current_hit_points: row.current_hit_points ?? 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            avatar_preset: (row.avatar_preset as any) ?? null,
          }
        : null,
    }));

    const npcRows = await this.db.sql<{
      id_npc_session: string;
      id_game_session: string;
      id_character: number;
      character_name: string | null;
      character_class: string | null;
      character_race: string | null;
      character_level: number | null;
      max_hit_points: number | null;
      current_hit_points: number | null;
      avatar_preset: unknown | null;
    }[]>`
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
        c.avatar_preset
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
      character: row.character_name != null
        ? {
            name: row.character_name,
            class: row.character_class ?? '',
            race: row.character_race ?? '',
            level: row.character_level ?? 0,
            max_hit_points: row.max_hit_points ?? 0,
            current_hit_points: row.current_hit_points ?? 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            avatar_preset: (row.avatar_preset as any) ?? null,
          }
        : null,
    }));

    const monsters = await this.db.sql<MonsterSession[]>`
      SELECT id_monster_session, id_game_session, monster_api_slug, custom_name,
             hp_current, hp_max, ac, data_snapshot
      FROM monster_session
      WHERE id_game_session = ${id}
    `;

    const recent_rolls = await this.findRecentRolls(id);

    return {game_session: session, players, npcs, monsters, recent_rolls};
  }

  async addRoll(idGameSession: string, input: RollLogInput): Promise<RollLogEntry> {
    const [row] = await this.db.sql<RollLogEntry[]>`
      INSERT INTO session_roll_log (
        id_game_session, id_character, actor_name, roll_type, label,
        dice_notation, rolls, advantage_state, modifier, total
      ) VALUES (
        ${idGameSession}, ${input.id_character}, ${input.actor_name}, ${input.roll_type}, ${input.label},
        ${input.dice_notation}, ${input.rolls}, ${input.advantage_state}, ${input.modifier}, ${input.total}
      )
      RETURNING id_roll, id_game_session, id_character, actor_name, roll_type, label,
                dice_notation, rolls, advantage_state, modifier, total, created_at
    `;
    return row;
  }

  async findRecentRolls(idGameSession: string, limit = 30): Promise<RollLogEntry[]> {
    return this.db.sql<RollLogEntry[]>`
      SELECT id_roll, id_game_session, id_character, actor_name, roll_type, label,
             dice_notation, rolls, advantage_state, modifier, total, created_at
      FROM session_roll_log
      WHERE id_game_session = ${idGameSession}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  /** Mestre pode rolar por qualquer personagem da sessão; jogador só pelo seu próprio. */
  async canPostRollFor(idGameSession: string, idCharacter: number | null, userId: string): Promise<boolean> {
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

  async hasSessionAccess(idGameSession: string, userId: string): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM game_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
        UNION ALL
        SELECT 1 FROM player_session WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  async findSessionByCode(sessionCode: string): Promise<{id_game_session: string; max_player_quantity: number} | null> {
    const rows = await this.db.sql<{id_game_session: string; max_player_quantity: number}[]>`
      SELECT id_game_session, max_player_quantity
      FROM game_session
      WHERE session_code = ${sessionCode}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async isUserInSession(idGameSession: string, userId: string): Promise<boolean> {
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

  async addPlayer(input: AddPlayerInput, idGameSession: string): Promise<PlayerSession> {
    const [inserted] = await this.db.sql<{id_player_session: string}[]>`
      INSERT INTO player_session (id_game_session, id_character, player_name, user_id)
      VALUES (${idGameSession}, ${input.id_character}, ${input.player_name}, ${input.user_id ?? null})
      RETURNING id_player_session
    `;

    const rows = await this.db.sql<{
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
      avatar_preset: unknown | null;
    }[]>`
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
      character: row.character_name != null
        ? {
            name: row.character_name,
            class: row.character_class ?? '',
            race: row.character_race ?? '',
            level: row.character_level ?? 0,
            max_hit_points: row.max_hit_points ?? 0,
            current_hit_points: row.current_hit_points ?? 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            avatar_preset: (row.avatar_preset as any) ?? null,
          }
        : null,
    };
  }

  async removeNpc(idNpcSession: string, userId: string): Promise<'not_found' | 'unauthorized' | 'ok'> {
    const rows = await this.db.sql<{session_owner_id: string | null}[]>`
      SELECT gs.user_id AS session_owner_id
      FROM npc_session ns
      JOIN game_session gs ON gs.id_game_session = ns.id_game_session
      WHERE ns.id_npc_session = ${idNpcSession}
      LIMIT 1
    `;
    if (!rows.length) return 'not_found';
    if (rows[0].session_owner_id !== userId) return 'unauthorized';

    await this.db.sql`DELETE FROM npc_session WHERE id_npc_session = ${idNpcSession}`;
    return 'ok';
  }

  async addNpc(idGameSession: string, idCharacter: number): Promise<NpcSession> {
    const [row] = await this.db.sql<NpcSession[]>`
      INSERT INTO npc_session (id_game_session, id_character)
      VALUES (${idGameSession}, ${idCharacter})
      RETURNING id_npc_session, id_game_session, id_character
    `;
    return row;
  }

  async removePlayer(idPlayerSession: string, userId: string): Promise<'not_found' | 'unauthorized' | 'ok'> {
    const rows = await this.db.sql<{user_id: string | null; session_owner_id: string | null}[]>`
      SELECT ps.user_id, gs.user_id AS session_owner_id
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE ps.id_player_session = ${idPlayerSession}
      LIMIT 1
    `;
    if (!rows.length) return 'not_found';

    const {user_id, session_owner_id} = rows[0];
    const isOwnPlayer = user_id === userId;
    const isSessionOwner = session_owner_id === userId;
    if (!isOwnPlayer && !isSessionOwner) return 'unauthorized';

    await this.db.sql`
      DELETE FROM player_session WHERE id_player_session = ${idPlayerSession}
    `;
    return 'ok';
  }

  async updateCharacterHp(
    idPlayerSession: string,
    currentHitPoints: number,
    userId: string,
  ): Promise<'not_found' | 'unauthorized' | 'ok'> {
    const rows = await this.db.sql<{id_character: number; player_user_id: string | null; session_owner_id: string | null}[]>`
      SELECT ps.id_character, ps.user_id AS player_user_id, gs.user_id AS session_owner_id
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE ps.id_player_session = ${idPlayerSession}
      LIMIT 1
    `;
    if (!rows.length) return 'not_found';

    const {id_character, player_user_id, session_owner_id} = rows[0];
    if (player_user_id !== userId && session_owner_id !== userId) return 'unauthorized';

    await this.db.sql`
      UPDATE character SET current_hit_points = ${currentHitPoints} WHERE id_character = ${id_character}
    `;
    return 'ok';
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.sql`
      DELETE FROM game_session
      WHERE id_game_session = ${id}
    `;
    return result.count > 0;
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

  async findPaged(pageSize: number, page: number): Promise<GameSessionSummary[]> {
    return this.db.sql<GameSessionSummary[]>`
      SELECT
        id_game_session,
        session_name,
        session_code,
        max_player_quantity,
        dm_name,
        created_at,
        COUNT(*) OVER() AS total_count
      FROM game_session
      ORDER BY created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }
}
