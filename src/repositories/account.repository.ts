/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  AccountProfile,
  ExportedCatalogMonster,
  ExportedDmSession,
  ExportedParticipation,
  ExportedRoll,
} from '../models/account-types';

/** Dados da conta do próprio usuário — perfil, exportação (LGPD art. 18) e exclusão da conta. */
@injectable({scope: BindingScope.TRANSIENT})
export class AccountRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findProfile(
    userId: string,
  ): Promise<(AccountProfile & {password_hash: string | null}) | undefined> {
    const rows = await this.db.sql<
      (AccountProfile & {password_hash: string | null})[]
    >`
      SELECT id, email, full_name, created_at,
             (password_hash IS NOT NULL) AS has_password,
             (google_id IS NOT NULL) AS google_linked,
             show_in_ranking,
             password_hash
      FROM users
      WHERE id = ${userId}
      LIMIT 1
    `;
    return rows[0];
  }

  async updateFullName(userId: string, fullName: string | null): Promise<void> {
    await this.db.sql`
      UPDATE users SET full_name = ${fullName} WHERE id = ${userId}
    `;
  }

  async updateShowInRanking(userId: string, show: boolean): Promise<void> {
    await this.db.sql`
      UPDATE users SET show_in_ranking = ${show} WHERE id = ${userId}
    `;
  }

  async findRankingStats(userId: string): Promise<object[]> {
    return this.db.sql`
      SELECT s.*, gs.session_name
      FROM character_session_stats s
      JOIN character c ON c.id_character = s.id_character
      JOIN game_session gs ON gs.id_game_session = s.id_game_session
      WHERE c.user_id = ${userId}
      ORDER BY s.updated_at
    `;
  }

  async findCharacters(
    userId: string,
  ): Promise<{id_character: number; name: string; level: number | null}[]> {
    return this.db.sql<
      {id_character: number; name: string; level: number | null}[]
    >`
      SELECT id_character, name, level FROM character
      WHERE user_id = ${userId}
      ORDER BY id_character
    `;
  }

  /** Sessões em que o usuário é o mestre — sem os dados dos outros jogadores. */
  async findDmSessions(userId: string): Promise<ExportedDmSession[]> {
    return this.db.sql<ExportedDmSession[]>`
      SELECT
        gs.id_game_session, gs.session_name, gs.session_code, gs.max_player_quantity,
        gs.dm_name, gs.created_at, gs.dm_notes,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id_monster_session', ms.id_monster_session,
            'monster_api_slug', ms.monster_api_slug,
            'custom_name', ms.custom_name,
            'hp_current', ms.hp_current,
            'hp_max', ms.hp_max,
            'ac', ms.ac,
            'image_url', ms.image_url
          ))
          FROM monster_session ms WHERE ms.id_game_session = gs.id_game_session
        ), '[]'::json) AS monsters,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id_reference_image', ri.id_reference_image,
            'image_url', ri.image_url,
            'title', ri.title,
            'created_at', ri.created_at
          ) ORDER BY ri.created_at)
          FROM session_reference_image ri WHERE ri.id_game_session = gs.id_game_session
        ), '[]'::json) AS reference_images
      FROM game_session gs
      WHERE gs.user_id = ${userId}
      ORDER BY gs.created_at
    `;
  }

  /** Participações como jogador, com o inventário de cada uma. */
  async findParticipations(userId: string): Promise<ExportedParticipation[]> {
    return this.db.sql<ExportedParticipation[]>`
      SELECT
        ps.id_player_session, ps.id_game_session, gs.session_name, ps.id_character,
        ps.player_name,
        COALESCE((
          SELECT json_agg(json_build_object(
            'name', pii.name,
            'description', pii.description,
            'quantity', pii.quantity,
            'price_value', pii.price_value,
            'weight', pii.weight
          ) ORDER BY pii.name)
          FROM player_inventory_item pii WHERE pii.id_player_session = ps.id_player_session
        ), '[]'::json) AS inventory
      FROM player_session ps
      JOIN game_session gs ON gs.id_game_session = ps.id_game_session
      WHERE ps.user_id = ${userId}
      ORDER BY gs.created_at
    `;
  }

  async findCatalogMonsters(userId: string): Promise<ExportedCatalogMonster[]> {
    return this.db.sql<ExportedCatalogMonster[]>`
      SELECT id_monster_catalog, monster_api_slug, custom_name, hp_max, ac, image_url, created_at
      FROM monster_catalog
      WHERE user_id = ${userId}
      ORDER BY created_at
    `;
  }

  /** Rolagens feitas pelos personagens do usuário (o log guarda só as 30 últimas por sessão). */
  async findRolls(userId: string): Promise<ExportedRoll[]> {
    return this.db.sql<ExportedRoll[]>`
      SELECT r.id_game_session, r.id_character, r.actor_name, r.roll_type, r.label,
             r.dice_notation, r.rolls, r.advantage_state, r.modifier, r.total, r.created_at
      FROM session_roll_log r
      JOIN character c ON c.id_character = r.id_character
      WHERE c.user_id = ${userId}
      ORDER BY r.created_at
    `;
  }

  /**
   * Apaga a conta. `users` cascateia pra personagens (e tudo deles), sessões que o usuário mestra,
   * participações como jogador (com inventário) e catálogo de monstros. A exceção são as rolagens
   * dos personagens dele em sessões de **outros** mestres: o FK é `ON DELETE SET NULL` e o
   * `actor_name` sobreviveria — por isso são apagadas antes, explicitamente.
   *
   * Devolve as URLs de imagem que pertenciam à conta, pra limpeza do storage depois do commit.
   */
  async deleteAccount(userId: string): Promise<{imageUrls: string[]}> {
    return this.db.sql.begin(async sql => {
      const images = await sql<{image_url: string}[]>`
        SELECT image_url FROM character
        WHERE user_id = ${userId} AND image_url IS NOT NULL
        UNION
        SELECT image_url FROM monster_catalog
        WHERE user_id = ${userId} AND image_url IS NOT NULL
        UNION
        SELECT ms.image_url FROM monster_session ms
        JOIN game_session gs ON gs.id_game_session = ms.id_game_session
        WHERE gs.user_id = ${userId} AND ms.image_url IS NOT NULL
        UNION
        SELECT ri.image_url FROM session_reference_image ri
        JOIN game_session gs ON gs.id_game_session = ri.id_game_session
        WHERE gs.user_id = ${userId}
      `;
      await sql`
        DELETE FROM session_roll_log
        WHERE id_character IN (SELECT id_character FROM character WHERE user_id = ${userId})
      `;
      await sql`DELETE FROM users WHERE id = ${userId}`;
      return {imageUrls: images.map(r => r.image_url)};
    });
  }
}
