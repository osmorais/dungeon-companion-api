/* eslint-disable @typescript-eslint/naming-convention */
import {Armour, Skill, Spell, WeaponOption} from './character-options-types';

export type StatKeyPt = 'FOR' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR';
export type StatKeyEn = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export interface CharacterInput {
  core_build: {
    level: number;
    id_race: number;
    race: string;
    subrace?: string;
    id_class: number;
    class: string;
    id_background: number;
    background: string;
  };
  attributes: {
    generation_method: 'standard_array' | 'point_buy' | 'manual';
    base_values: Record<StatKeyPt, number>;
  };
  choices: {
    skills: Skill[];
    spells?: Spell[];
    feats?: string[];
  };
  equipment: {
    armour: Armour | null;
    weapons: WeaponOption[];
    has_shield: boolean;
  };
  character_details?: {
    name?: string;
    id_alignment: number;
    alignment?: string;
    age?: number;
    height?: string;
    weight?: string;
  };
}

export interface FinalStats {
  STR: number;
  DEX: number;
  CON: number;
  INT: number;
  WIS: number;
  CHA: number;
}

export interface StatBlock {
  score: number;
  modifier: number;
  save: number;
  save_proficiency: boolean;
}

export interface SkillBlock {
  stat: StatKeyEn;
  bonus: number;
  proficient: boolean;
}

export interface WeaponAction {
  name: string;
  attack_bonus: number;
  damage: string;
  damage_type: string;
  properties: string[];
}

export interface Trait {
  name: string;
  source: string;
  description: string;
}

export interface CharacterRawData {
  character: {
    id_character: number;
    name: string;
    level: number;
    id_race: number;
    id_class: number;
    id_armour: number | null;
    id_alignment: number | null;
    proficiency_bonus: number;
    armour_class: number;
    initiative_value: number;
    current_hit_points: number;
    max_hit_points: number;
    hit_dice: string;
    passive_perception: string | number;
    xp_points: number;
    total_po: number;
    alignment_name: string | null;
    id_background: number | null;
  };
  attributes: Array<{attribute_name: string; score: number; modifier: number}>;
  skills: Array<{skill_name: string; is_trained: boolean}>;
  spells: Array<{id_spell: number; name: string; spell_level: number}>;
  weapons: Array<{name: string; has_proficiency: boolean}>;
  items: Array<{name: string}>;
}

export interface CharacterSheet {
  character_sheet: {
    header: {
      name: string;
      class_and_level: string;
      race: string;
      background: string;
      alignment: string;
      experience_points: number;
    };
    combat_stats: {
      proficiency_bonus: number;
      armor_class: number;
      initiative: number;
      speed: string;
      hit_points: {max: number; current: number; temporary: number};
      hit_dice: string;
      passive_perception: number;
    };
    attributes_and_saves: Record<StatKeyEn, StatBlock>;
    skills: Record<string, SkillBlock>;
    combat_actions: {weapons: WeaponAction[]};
    features_and_traits: Trait[];
    proficiencies_and_languages: {
      armor: string[];
      weapons: string[];
      tools: string[];
      languages: string[];
    };
    equipment: {
      currency: {cp: number; sp: number; ep: number; gp: number; pp: number};
      items: string[];
    };
    spellcasting: {
      is_spellcaster: boolean;
      spellcasting_ability?: StatKeyEn;
      spell_save_dc?: number;
      spell_attack_bonus?: number;
      slots_total?: Record<string, number>;
      slots_expended?: Record<string, number>;
      spells_known?: {cantrips: string[]; [key: string]: string[]};
    };
  };
}
