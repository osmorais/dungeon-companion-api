/* eslint-disable @typescript-eslint/naming-convention */
import {SpellCardDamage} from './character-options-types';

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
  /** Dano/cura base pro selo da carta (1.17.0). */
  card_damage?: SpellCardDamage | null;
}

export interface SpellCatalogPagedList {
  SpellCatalogPagedList: SpellCatalogEntry[];
  page: number;
  pageSize: number;
  total_count: number;
}
