export interface AttributeType {
  id_attribute: number;
  name: string;
  full_name: string;
}

export interface Skill {
  id_skill: number;
  name: string;
  id_attribute: number;
  attribute_name: string;
  description: string;
  is_trained: boolean;
  /** Especialização/Aptidão/Bênção do Conhecimento: bônus de proficiência dobrado nessa perícia. */
  is_expert: boolean;
  level_value: number;
  total_skill_value: number;
}

export interface WeaponOption {
  name: string;
  damage: string;
  properties: string[];
  isRanged: boolean;
}

export interface WeaponRow {
  id_weapon: number;
  attack_bonus: number;
  /** Modificador de habilidade (FOR/DES) aplicado à rolagem de dano — sem a proficiência, que só entra no ataque. */
  damage_modifier: number;
  name: string;
  damage_die: string | null;
  damage_type: string | null;
  properties: string | null;
  weight: number;
  price_value: number;
  isRanged: boolean;
}

/** Texto explicativo genérico (nome + descrição) reaproveitado nas explicações de escolha do wizard de criação. */
export interface TraitInfo {
  name: string;
  description: string;
}

export interface Subrace {
  key: string;
  name: string;
  /** Bônus de atributo já formatado em português (ex: "Destreza +1") — vazio se não houver. */
  bonuses_text: string;
  traits: TraitInfo[];
}

export interface Race {
  id_race: number;
  name: string;
  movement: string;
  subraces: Subrace[];
  bonuses_text: string;
  languages: string[];
  traits: TraitInfo[];
  /** Opções de ferramenta pra escolher 1 (ex: Anão) — vazio/ausente se a raça não tiver essa escolha. */
  tool_proficiency_options?: string[];
}

export interface CharacterClass {
  id_class: number;
  name: string;
  starting_gold_po: number;
  hit_die: number;
  saving_throws_text: string;
  armor_proficiencies: string[];
  weapon_proficiencies: string[];
  is_spellcaster: boolean;
  traits: TraitInfo[];
  /** Opções de Estilo de Combate no nível 1 (hoje só o Guerreiro) — vazio/ausente se a classe não tiver essa escolha. */
  fighting_style_options?: string[];
}

export interface Background {
  id_background: number;
  name: string;
  starting_gold_po: number;
  languages_number: number;
  skills: string[];
  tools: string[];
  feature: TraitInfo;
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
  /** Só presente na ficha de um personagem já criado (não no catálogo de opções). */
  is_prepared?: boolean;
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
  weapons: WeaponRow[];
  races: Race[];
  classes: CharacterClass[];
  backgrounds: Background[];
  alignments: Alignment[];
  spells: Spell[];
  armours: Armour[];
}
