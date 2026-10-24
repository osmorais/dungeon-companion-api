/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {RankingEntry} from '../models/ranking-types';
import {RankingCategoryDef} from '../services/ranking-stats';

@injectable({scope: BindingScope.TRANSIENT})
export class RankingRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  /**
   * Os melhores de uma categoria, no site todo. Entra só quem ainda está na mesa (tem
   * `player_session`) e não saiu do ranking na conta (`users.show_in_ranking`). Empate: quem
   * chegou primeiro fica na frente.
   */
  async topFor(
    def: RankingCategoryDef,
    limit: number,
  ): Promise<RankingEntry[]> {
    const sql = this.db.sql;
    // `value` e `where` vêm das constantes de RANKING_CATEGORIES (nunca do usuário).
    const value = sql.unsafe(def.value);
    const extra = def.where ? sql`AND ${sql.unsafe(def.where)}` : sql``;
    const rows = await sql<Omit<RankingEntry, 'position'>[]>`
      SELECT s.id_character,
             c.name AS character_name,
             c.avatar_preset,
             -- Nome de usuário atual (1.9.0); o nome gravado na mesa só pra quem não tem.
             COALESCE(u.username, ps.player_name) AS player_name,
             gs.session_name,
             (${value})::float AS value
      FROM character_session_stats s
      JOIN character c ON c.id_character = s.id_character
      JOIN game_session gs ON gs.id_game_session = s.id_game_session
      JOIN LATERAL (
        SELECT player_name, user_id FROM player_session
        WHERE id_game_session = s.id_game_session AND id_character = s.id_character
        LIMIT 1
      ) ps ON TRUE
      LEFT JOIN users u ON u.id = COALESCE(c.user_id, ps.user_id)
      WHERE (${value}) > 0 ${extra}
        AND COALESCE(u.show_in_ranking, TRUE)
      ORDER BY value DESC, s.updated_at ASC
      LIMIT ${limit}
    `;
    return rows.map((r, i) => ({
      ...r,
      value: Number(r.value),
      position: i + 1,
    }));
  }
}
