export interface AttributeType {
  id_attribute: number;
  name: string;
  full_name: string;
}

export interface Skill {
  id_skill: number;
  name: string;
  id_attribute: number;
}

export interface WeaponOption {
  name: string;
  damage: string;
  properties: string[];
  isRanged: boolean;
}

export interface WeaponRow {
  id_weapon: number;
  name: string;
  damage_die: string | null;
  damage_type: string | null;
  properties: string | null;
  weight: number;
  price_value: number;
}

export interface Race {
  id_race: number;
  name: string;
  movement: string;
}

export interface CharacterClass {
  id_class: number;
  name: string;
  starting_gold_po: number;
}

export interface Background {
  id_background: number;
  name: string;
  starting_gold_po: number;
  languages_number: number;
}

export interface Alignment {
  id_alignment: number;
  name: string;
  description: string;
}

export interface Spell {
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

export interface Armour {
  id_armour: number;
  name: string;
  armour_class_base: number | null;
  is_sum_dexterity: boolean | null;
  armour_type: string | null;
  max_dexterity_bonus: number | null;
  is_stealth_disadvantage: boolean | null;
  weight: number | null;
  price_value: number | null;
}

export interface CharacterOptions {
  attributes: AttributeType[];
  skills: Skill[];
  weapons: WeaponOption[];
  races: Race[];
  classes: CharacterClass[];
  backgrounds: Background[];
  alignments: Alignment[];
  spells: Spell[];
  armours: Armour[];
}
