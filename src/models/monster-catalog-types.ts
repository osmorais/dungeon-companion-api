/* eslint-disable @typescript-eslint/naming-convention */

export interface MonsterCatalogInput {
  monster_api_slug: string;
  custom_name?: string | null;
}

/** Item da lista do bestiário (tabela `monster`) mostrada antes de catalogar. */
export interface BestiaryMonsterSummary {
  index: string;
  name: string;
  challenge_rating: number;
  size: string;
  type: string;
}

/** Ficha do bestiário — `data` segue as chaves da dnd5eapi, com valores em português. */
export interface BestiaryMonster {
  slug: string;
  name: string;
  hp_max: number;
  ac: number;
  data: Record<string, unknown>;
}

export interface MonsterCatalogEntry {
  id_monster_catalog: string;
  user_id: string;
  monster_api_slug: string;
  custom_name: string | null;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
  created_at: Date;
  /** Arte customizada subida pelo mestre (Supabase Storage) — null enquanto não subir nenhuma. */
  image_url: string | null;
}

export interface MonsterCatalogPagedList {
  MonsterCatalogPagedList: MonsterCatalogEntry[];
  page: number;
  pageSize: number;
  total_count: number;
}
