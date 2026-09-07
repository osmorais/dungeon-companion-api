/* eslint-disable @typescript-eslint/naming-convention */
import {inject, service} from '@loopback/core';
import {del, get, param, post, requestBody, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {SecurityBindings, UserProfile} from '@loopback/security';
import {MonsterCatalogService} from '../services/monster-catalog.service';
import {SrdMonsterSummary} from '../services/srd-monster.service';
import {MonsterCatalogEntry, MonsterCatalogPagedList} from '../models/monster-catalog-types';

@authenticate('jwt')
export class MonsterCatalogController {
  constructor(
    @service(MonsterCatalogService)
    private monsterCatalogService: MonsterCatalogService,
  ) {}

  @get('/api/monster-catalog/srd')
  @response(200, {
    description: 'Returns the list of monsters available in the D&D 5e SRD',
    content: {'application/json': {schema: {type: 'array'}}},
  })
  async listSrdMonsters(
    @inject(SecurityBindings.USER) _currentUser: UserProfile,
  ): Promise<SrdMonsterSummary[]> {
    return this.monsterCatalogService.searchSrdMonsters();
  }

  @get('/api/monster-catalog/srd/{slug}')
  @response(200, {
    description: 'Returns the full SRD stat block for a monster, for preview before cataloging',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getSrdMonster(
    @param.path.string('slug') slug: string,
    @inject(SecurityBindings.USER) _currentUser: UserProfile,
  ): Promise<object> {
    return this.monsterCatalogService.getSrdMonster(slug);
  }

  @post('/api/monster-catalog')
  @response(201, {
    description: 'Catalogs a new monster (from the SRD) for the current DM',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async catalogMonster(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @requestBody({
      description: 'SRD slug of the monster to catalog, with an optional custom name',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['monster_api_slug'],
            properties: {
              monster_api_slug: {type: 'string'},
              custom_name: {type: 'string'},
            },
          },
        },
      },
    })
    body: {monster_api_slug: string; custom_name?: string},
  ): Promise<MonsterCatalogEntry> {
    return this.monsterCatalogService.catalogMonster(
      currentUser.id,
      body.monster_api_slug,
      body.custom_name ?? null,
    );
  }

  @get('/api/monster-catalog')
  @response(200, {
    description: "Returns a paginated list of the current DM's cataloged monsters",
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async listCatalog(
    @inject(SecurityBindings.USER) currentUser: UserProfile,
    @param.query.number('page') page?: number,
    @param.query.number('pageSize') pageSize?: number,
  ): Promise<MonsterCatalogPagedList> {
    const MAX_PAGE_SIZE = 50;
    const resolvedPageSize = Math.min(pageSize ?? 12, MAX_PAGE_SIZE);
    return this.monsterCatalogService.listCatalog(currentUser.id, resolvedPageSize, page ?? 1);
  }

  @get('/api/monster-catalog/{id}')
  @response(200, {
    description: 'Returns one cataloged monster, including its full SRD stat block',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getCatalogEntry(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<MonsterCatalogEntry> {
    return this.monsterCatalogService.getCatalogEntry(id, currentUser.id);
  }

  @del('/api/monster-catalog/{id}')
  @response(204, {description: 'Cataloged monster deleted successfully'})
  async deleteCatalogEntry(
    @param.path.string('id') id: string,
    @inject(SecurityBindings.USER) currentUser: UserProfile,
  ): Promise<void> {
    return this.monsterCatalogService.deleteCatalogEntry(id, currentUser.id);
  }
}
