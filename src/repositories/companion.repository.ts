/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  companionView,
  SessionCompanion,
} from '../services/character-sheet/companion';

type CompanionRow = Parameters<typeof companionView>[0];

/** Companheiros da mesa, com o nível e a proficiência do ranger (detalhe da sessão). */
export async function selectCompanions(
  sql: PostgresDatasource['sql'],
  idGameSession: string,
): Promise<SessionCompanion[]> {
  const rows = await sql<CompanionRow[]>`
    SELECT sc.id_session_companion, sc.id_game_session, sc.id_player_session,
           sc.monster_slug, sc.name, sc.color, sc.hp_current, sc.data_snapshot,
           COALESCE(c.level, 1) AS ranger_level,
           COALESCE(c.proficiency_bonus, 2) AS proficiency_bonus
    FROM session_companion sc
    JOIN player_session ps ON ps.id_player_session = sc.id_player_session
    LEFT JOIN character c ON c.id_character = ps.id_character
    WHERE sc.id_game_session = ${idGameSession}
    ORDER BY sc.created_at
  `;
  return rows.map(companionView);
}

/** Companheiro Animal do ranger numa mesa (`session_companion`). As regras ficam no service. */
@injectable({scope: BindingScope.TRANSIENT})
export class CompanionRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  private select(where: ReturnType<PostgresDatasource['sql']>) {
    return this.db.sql<Parameters<typeof companionView>[0][]>`
      SELECT sc.id_session_companion, sc.id_game_session, sc.id_player_session,
             sc.monster_slug, sc.name, sc.color, sc.hp_current, sc.data_snapshot,
             COALESCE(c.level, 1) AS ranger_level,
             COALESCE(c.proficiency_bonus, 2) AS proficiency_bonus
      FROM session_companion sc
      JOIN player_session ps ON ps.id_player_session = sc.id_player_session
      LEFT JOIN character c ON c.id_character = ps.id_character
      WHERE ${where}
      ORDER BY sc.created_at
    `;
  }

  async findBySession(idGameSession: string): Promise<SessionCompanion[]> {
    return selectCompanions(this.db.sql, idGameSession);
  }

  async findById(id: string): Promise<SessionCompanion | null> {
    const [row] = await this.select(
      this.db.sql`sc.id_session_companion = ${id}`,
    );
    return row ? companionView(row) : null;
  }

  /** Quem pode mexer no companheiro: o jogador do ranger e o mestre da mesa. */
  async findOwners(
    id: string,
  ): Promise<{
    player_user_id: string | null;
    session_owner_id: string | null;
  } | null> {
    const [row] = await this.db.sql<
      {player_user_id: string | null; session_owner_id: string | null}[]
    >`
      SELECT ps.user_id AS player_user_id, gs.user_id AS session_owner_id
      FROM session_companion sc
      JOIN player_session ps ON ps.id_player_session = sc.id_player_session
      JOIN game_session gs ON gs.id_game_session = sc.id_game_session
      WHERE sc.id_session_companion = ${id}
    `;
    return row ?? null;
  }

  /** O ranger da vaga: dono, mestre da mesa, classe, subclasse e nível. */
  async findRanger(
    idGameSession: string,
    idPlayerSession: string,
  ): Promise<{
    player_user_id: string | null;
    session_owner_id: string | null;
    id_class: number | null;
    id_subclass: string | null;
    level: number | null;
  } | null> {
    const [row] = await this.db.sql<
      {
        player_user_id: string | null;
        session_owner_id: string | null;
        id_class: number | null;
        id_subclass: string | null;
        level: number | null;
      }[]
    >`
      SELECT ps.user_id AS player_user_id, gs.user_id AS session_owner_id,
             c.id_class, c.id_subclass, c.level
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      LEFT JOIN character c ON c.id_character = ps.id_character
      WHERE ps.id_player_session = ${idPlayerSession}
        AND ps.id_game_session = ${idGameSession}
    `;
    return row ?? null;
  }

  async usedColors(
    idGameSession: string,
    exceptPlayerSession: string,
  ): Promise<string[]> {
    const rows = await this.db.sql<{color: string}[]>`
      SELECT color FROM session_companion
      WHERE id_game_session = ${idGameSession} AND id_player_session <> ${exceptPlayerSession}
    `;
    return rows.map(r => r.color);
  }

  /** Escolhe (ou troca) o companheiro da vaga: um por jogador na mesa. Devolve o id. */
  async upsert(input: {
    idGameSession: string;
    idPlayerSession: string;
    slug: string;
    name: string;
    hpCurrent: number;
    data: Record<string, unknown>;
    color: string;
  }): Promise<string> {
    const [row] = await this.db.sql<{id_session_companion: string}[]>`
      INSERT INTO session_companion
        (id_game_session, id_player_session, monster_slug, name, hp_current, data_snapshot, color)
      VALUES (${input.idGameSession}, ${input.idPlayerSession}, ${input.slug}, ${input.name},
              ${input.hpCurrent}, ${this.db.sql.json(input.data as never)}, ${input.color})
      ON CONFLICT (id_player_session) DO UPDATE SET
        monster_slug = EXCLUDED.monster_slug,
        name = EXCLUDED.name,
        hp_current = EXCLUDED.hp_current,
        data_snapshot = EXCLUDED.data_snapshot,
        created_at = NOW()
      RETURNING id_session_companion
    `;
    return row.id_session_companion;
  }

  async writeHp(id: string, hp: number): Promise<void> {
    await this.db.sql`
      UPDATE session_companion SET hp_current = ${hp} WHERE id_session_companion = ${id}
    `;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.sql`
      DELETE FROM session_companion WHERE id_session_companion = ${id}
    `;
    return result.count > 0;
  }
}
