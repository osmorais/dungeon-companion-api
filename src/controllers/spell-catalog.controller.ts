/* eslint-disable @typescript-eslint/naming-convention */
import {service} from '@loopback/core';
import {get, param, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SpellCatalogService} from '../services/spell-catalog.service';
import {SpellCatalogEntry, SpellCatalogPagedList} from '../models/spell-catalog-types';

@authenticate('jwt')
export class SpellCatalogController {
  constructor(
    @service(SpellCatalogService)
    private spellCatalogService: SpellCatalogService,
  ) {}

  @get('/api/spell-catalog')
  @response(200, {
    description: 'Returns a paginated, optionally name-filtered list of spells',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async listCatalog(
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
    @param.query.string('search') search?: string,
  ): Promise<SpellCatalogPagedList> {
    const MAX_PAGE_SIZE = 50;
    const resolvedPageSize = Math.min(pageSize ?? 20, MAX_PAGE_SIZE);
    return this.spellCatalogService.listCatalog(resolvedPageSize, page ?? 1, search?.trim() || null);
  }

  @get('/api/spell-catalog/{id}')
  @response(200, {
    description: 'Returns one spell by id',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getSpell(@param.path.number('id') id: number): Promise<SpellCatalogEntry> {
    return this.spellCatalogService.getSpell(id);
  }
}
