/* eslint-disable @typescript-eslint/naming-convention */

export interface SpellCatalogEntry {
  id_spell: number;
  name: string;
  description: string | null;
  casting_time: string | null;
  range_distance: number | null;
  duration: string | null;
  is_verbal: boolean;
  is_somatic: boolean;
  is_material: boolean;
  spellLevel: number;
  school: string | null;
}

export interface SpellCatalogPagedList {
  SpellCatalogPagedList: SpellCatalogEntry[];
  page: number;
  pageSize: number;
  total_count: number;
}
