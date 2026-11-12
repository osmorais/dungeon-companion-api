/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  BestiaryMonster,
  BestiaryMonsterSummary,
} from '../models/monster-catalog-types';

/** Bestiário de referência (tabela `monster`, fichas do Manual dos Monstros) — só leitura. */
@injectable({scope: BindingScope.TRANSIENT})
export class MonsterRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async listSummaries(): Promise<BestiaryMonsterSummary[]> {
    return this.db.sql<BestiaryMonsterSummary[]>`
      SELECT slug AS index, name, challenge_rating::float8 AS challenge_rating,
        data->>'size' AS size, data->>'type' AS type, data->>'alignment' AS alignment,
        hp_max, ac,
        CASE WHEN jsonb_typeof(data->'legendary_actions') = 'array'
          THEN jsonb_array_length(data->'legendary_actions') > 0 ELSE false END AS legendary,
        (data->'speed'->>'voo') IS NOT NULL AS flies
      FROM monster
      ORDER BY name
    `;
  }

  /** Bestas do bestiário (Forma Selvagem), com a ficha inteira. */
  async listBeasts(): Promise<
    (BestiaryMonster & {challenge_rating: number})[]
  > {
    return this.db.sql<(BestiaryMonster & {challenge_rating: number})[]>`
      SELECT slug, name, hp_max, ac, challenge_rating::float8 AS challenge_rating, data
      FROM monster
      WHERE data->>'type' = 'besta'
      ORDER BY challenge_rating, name
    `;
  }

  async findBeast(
    slug: string,
  ): Promise<(BestiaryMonster & {challenge_rating: number}) | null> {
    const rows = await this.db.sql<
      (BestiaryMonster & {challenge_rating: number})[]
    >`
      SELECT slug, name, hp_max, ac, challenge_rating::float8 AS challenge_rating, data
      FROM monster
      WHERE slug = ${slug} AND data->>'type' = 'besta'
    `;
    return rows[0] ?? null;
  }

  async findBySlug(slug: string): Promise<BestiaryMonster | null> {
    const rows = await this.db.sql<BestiaryMonster[]>`
      SELECT slug, name, hp_max, ac, data FROM monster WHERE slug = ${slug}
    `;
    return rows[0] ?? null;
  }
}
