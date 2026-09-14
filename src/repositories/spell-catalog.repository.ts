/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {SpellCatalogEntry} from '../models/spell-catalog-types';

@injectable({scope: BindingScope.TRANSIENT})
export class SpellCatalogRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findPaged(
    pageSize: number,
    page: number,
    search: string | null,
  ): Promise<(SpellCatalogEntry & {total_count: number})[]> {
    const searchPattern = search ? `%${search}%` : null;
    return this.db.sql<(SpellCatalogEntry & {total_count: number})[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
        is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school,
        COUNT(*) OVER() AS total_count
      FROM spell
      WHERE (${searchPattern}::text IS NULL OR name ILIKE ${searchPattern})
      ORDER BY spelllevel, name
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  async findById(id: number): Promise<SpellCatalogEntry | null> {
    const rows = await this.db.sql<SpellCatalogEntry[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
        is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school
      FROM spell
      WHERE id_spell = ${id}
    `;
    return rows[0] ?? null;
  }
}
