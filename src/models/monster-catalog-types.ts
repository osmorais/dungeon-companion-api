/* eslint-disable @typescript-eslint/naming-convention */

export interface MonsterCatalogInput {
  monster_api_slug: string;
  custom_name?: string | null;
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
