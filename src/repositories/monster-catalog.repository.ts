/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {MonsterCatalogEntry} from '../models/monster-catalog-types';

@injectable({scope: BindingScope.TRANSIENT})
export class MonsterCatalogRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async create(
    userId: string,
    slug: string,
    customName: string | null,
    hpMax: number,
    ac: number,
    dataSnapshot: Record<string, unknown>,
  ): Promise<MonsterCatalogEntry> {
    const [row] = await this.db.sql<MonsterCatalogEntry[]>`
      INSERT INTO monster_catalog (
        user_id, monster_api_slug, custom_name, hp_max, ac, data_snapshot
      ) VALUES (
        ${userId}, ${slug}, ${customName}, ${hpMax}, ${ac}, ${this.db.sql.json(dataSnapshot as any)}
      )
      RETURNING id_monster_catalog, user_id, monster_api_slug, custom_name, hp_max, ac, data_snapshot, created_at
    `;
    return row;
  }

  async findPagedByUser(
    userId: string,
    pageSize: number,
    page: number,
  ): Promise<(MonsterCatalogEntry & {total_count: number})[]> {
    return this.db.sql<(MonsterCatalogEntry & {total_count: number})[]>`
      SELECT id_monster_catalog, user_id, monster_api_slug, custom_name, hp_max, ac, data_snapshot, created_at,
        COUNT(*) OVER() AS total_count
      FROM monster_catalog
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  async findById(id: string): Promise<MonsterCatalogEntry | null> {
    const rows = await this.db.sql<MonsterCatalogEntry[]>`
      SELECT id_monster_catalog, user_id, monster_api_slug, custom_name, hp_max, ac, data_snapshot, created_at
      FROM monster_catalog
      WHERE id_monster_catalog = ${id}
    `;
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.db.sql`DELETE FROM monster_catalog WHERE id_monster_catalog = ${id}`;
  }
}
