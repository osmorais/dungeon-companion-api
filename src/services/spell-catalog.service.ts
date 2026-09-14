/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {SpellCatalogRepository} from '../repositories/spell-catalog.repository';
import {SpellCatalogEntry, SpellCatalogPagedList} from '../models/spell-catalog-types';

@injectable({scope: BindingScope.TRANSIENT})
export class SpellCatalogService {
  constructor(
    @service(SpellCatalogRepository)
    private repository: SpellCatalogRepository,
  ) {}

  async listCatalog(
    pageSize: number,
    page: number,
    search: string | null,
  ): Promise<SpellCatalogPagedList> {
    const rows = await this.repository.findPaged(pageSize, page, search);
    return {
      SpellCatalogPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }

  async getSpell(id: number): Promise<SpellCatalogEntry> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new HttpErrors.NotFound('Magia não encontrada');
    return entry;
  }
}
