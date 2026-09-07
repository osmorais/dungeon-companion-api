/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {MonsterCatalogRepository} from '../repositories/monster-catalog.repository';
import {SrdMonsterService, SrdMonsterSummary} from './srd-monster.service';
import {MonsterCatalogEntry, MonsterCatalogPagedList} from '../models/monster-catalog-types';

interface SrdMonsterShape {
  armor_class?: {value: number}[];
  hit_points?: number;
}

@injectable({scope: BindingScope.TRANSIENT})
export class MonsterCatalogService {
  constructor(
    @service(MonsterCatalogRepository)
    private repository: MonsterCatalogRepository,
    @service(SrdMonsterService)
    private srdMonsterService: SrdMonsterService,
  ) {}

  async searchSrdMonsters(): Promise<SrdMonsterSummary[]> {
    return this.srdMonsterService.listMonsters();
  }

  async getSrdMonster(slug: string): Promise<Record<string, unknown>> {
    return this.srdMonsterService.getMonster(slug);
  }

  /**
   * Recataloga sempre a partir do SRD (não confia em stat block enviado pelo cliente) — o
   * cliente só manda o slug escolhido e um nome customizado opcional.
   */
  async catalogMonster(
    userId: string,
    slug: string,
    customName: string | null,
  ): Promise<MonsterCatalogEntry> {
    const detail = (await this.srdMonsterService.getMonster(slug)) as SrdMonsterShape &
      Record<string, unknown>;
    const hpMax = detail.hit_points ?? 0;
    const ac = detail.armor_class?.[0]?.value ?? 10;
    return this.repository.create(userId, slug, customName, hpMax, ac, detail);
  }

  async listCatalog(
    userId: string,
    pageSize: number,
    page: number,
  ): Promise<MonsterCatalogPagedList> {
    const rows = await this.repository.findPagedByUser(userId, pageSize, page);
    return {
      MonsterCatalogPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }

  async getCatalogEntry(id: string, userId: string): Promise<MonsterCatalogEntry> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new HttpErrors.NotFound('Monstro não encontrado no catálogo');
    if (entry.user_id !== userId) {
      throw new HttpErrors.Forbidden('Você não pode ver um monstro catalogado por outro mestre');
    }
    return entry;
  }

  async deleteCatalogEntry(id: string, userId: string): Promise<void> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new HttpErrors.NotFound('Monstro não encontrado no catálogo');
    if (entry.user_id !== userId) {
      throw new HttpErrors.Forbidden('Você não pode remover um monstro catalogado por outro mestre');
    }
    await this.repository.delete(id);
  }
}
