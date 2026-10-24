/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {MonsterCatalogRepository} from '../repositories/monster-catalog.repository';
import {MonsterRepository} from '../repositories/monster.repository';
import {SupabaseStorageService} from './supabase-storage.service';
import {ImageCleanupService} from './image-cleanup.service';
import {
  BestiaryMonster,
  BestiaryMonsterSummary,
  MonsterCatalogEntry,
  MonsterCatalogPagedList,
} from '../models/monster-catalog-types';

@injectable({scope: BindingScope.TRANSIENT})
export class MonsterCatalogService {
  constructor(
    @service(MonsterCatalogRepository)
    private repository: MonsterCatalogRepository,
    @service(MonsterRepository)
    private bestiary: MonsterRepository,
    @service(SupabaseStorageService)
    private storageService: SupabaseStorageService,
    @service(ImageCleanupService)
    private imageCleanup: ImageCleanupService,
  ) {}

  /** Lista do bestiário (tabela `monster`, fichas do Manual dos Monstros) pra escolher o que catalogar. */
  async listBestiary(): Promise<BestiaryMonsterSummary[]> {
    return this.bestiary.listSummaries();
  }

  async getBestiaryMonster(slug: string): Promise<Record<string, unknown>> {
    return (await this.findBestiaryMonster(slug)).data;
  }

  private async findBestiaryMonster(slug: string): Promise<BestiaryMonster> {
    const monster = await this.bestiary.findBySlug(slug);
    if (!monster) throw new HttpErrors.NotFound(`Monstro "${slug}" não encontrado no bestiário`);
    return monster;
  }

  /**
   * Cataloga sempre a partir do bestiário (não confia em stat block enviado pelo cliente) — o
   * cliente só manda o slug escolhido e um nome customizado opcional.
   */
  async catalogMonster(
    userId: string,
    slug: string,
    customName: string | null,
  ): Promise<MonsterCatalogEntry> {
    const monster = await this.findBestiaryMonster(slug);
    return this.repository.create(userId, slug, customName, monster.hp_max, monster.ac, monster.data);
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

  /** Sobe a arte customizada de um monstro já catalogado e salva a URL pública no registro. */
  async setCatalogImage(
    id: string,
    userId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<MonsterCatalogEntry> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new HttpErrors.NotFound('Monstro não encontrado no catálogo');
    if (entry.user_id !== userId) {
      throw new HttpErrors.Forbidden(
        'Você não pode alterar um monstro catalogado por outro mestre',
      );
    }
    const imageUrl = await this.storageService.uploadImage(buffer, contentType);
    const updated = await this.repository.updateImage(id, imageUrl);
    await this.imageCleanup.deleteIfUnreferenced([entry.image_url]);
    return updated;
  }

  async deleteCatalogEntry(id: string, userId: string): Promise<void> {
    const entry = await this.repository.findById(id);
    if (!entry) throw new HttpErrors.NotFound('Monstro não encontrado no catálogo');
    if (entry.user_id !== userId) {
      throw new HttpErrors.Forbidden('Você não pode remover um monstro catalogado por outro mestre');
    }
    await this.repository.delete(id);
    // Monstros já adicionados a sessões continuam usando a mesma URL — aí ela fica (ver ImageCleanupService).
    await this.imageCleanup.deleteIfUnreferenced([entry.image_url]);
  }
}
