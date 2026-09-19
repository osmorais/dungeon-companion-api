/* eslint-disable @typescript-eslint/naming-convention */
import {Armour, Skill, Spell, WeaponRow} from './character-options-types';

export type StatKeyPt = 'FOR' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR';
export type StatKeyEn = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export interface AvatarPreset {
  race: string;
  classKey: string;
  skinColor: string;
  hairStyle: string | null;
  hairColor: string;
  beardStyle: string | null;
  beardColor: string | null;
}

export interface EquipmentUpdateInput {
  id_armour: number | null;
  has_shield: boolean;
}

export interface UploadImageResult {
  image_url: string;
}

export interface CharacterBackground {
  id_character_background: number;
  id_character: number;
  full_history: string;
}

export interface CharacterInput {
  core_build: {
    level: number;
    id_race: number;
    race: string;
    subrace?: string;
    id_class: number;
    class: string;
    /** Só pra classes que escolhem subclasse já no nível 1 (Bruxo, Clérigo, Feiticeiro). */
    id_subclass?: string;
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
    /**
     * Perícias escolhidas pra Especialização/Aptidão (Ladino/Bardo, bônus dobrado em perícias
     * já treinadas) ou Bênção do Conhecimento (Clérigo, concede treino novo + bônus dobrado numa
     * lista restrita) — só relevante se a classe/subclasse concede isso já no nível 1.
     */
    expertise_skill_ids?: number[];
    /** Só relevante se `raceRule.toolProficiencyChoice` existir (hoje só o Anão). */
    tool_proficiency?: string;
    /** Só relevante se `classRule.fightingStyleChoice` existir (hoje só o Guerreiro). */
    fighting_style?: string;
  };
  equipment: {
    armour: Armour | null;
    weapons: WeaponRow[];
    has_shield: boolean;
    /** Riqueza inicial rolada pelo jogador (dado da classe, já multiplicado) em PO — somado ao dinheiro fixo do antecedente. `undefined`/0 se não rolou nada. */
    starting_gold?: number;
  };
  character_details?: {
    name?: string;
    id_alignment: number;
    alignment?: string;
    age?: number;
    height?: string;
    weight?: string;
  };
  avatar_preset?: AvatarPreset;
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

export interface CharacterSkillInsert {
  id_skill: number;
  is_trained: boolean;
  is_expert: boolean;
  trained_value: number;
  level_value: number;
  total_skill_value: number;
}

export interface CharacterRawData {
  character: {
    id_character: number;
    name: string;
    level: number;
    id_race: number;
    subrace: string | null;
    id_class: number;
    id_subclass: string | null;
    id_armour: number | null;
    armour_name: string | null;
    armour_type: string | null;
    armour_class_base: number | null;
    max_dexterity_bonus: number | null;
    has_shield: boolean;
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
    spellcasting_ability: string | null;
    spell_save_dc: number | null;
    spell_attack_bonus: number | null;
    spell_slots_expended: Record<string, number> | null;
    resource_uses_expended: Record<string, number> | null;
    chosen_tool_proficiency: string | null;
    chosen_fighting_style: string | null;
    hit_dice_spent: number;
    user_id: string;
    avatar_preset: AvatarPreset | null;
    /** Foto de verdade (via Supabase Storage), à parte do avatar_preset (ícone de estoque). */
    image_url: string | null;
  };
  attributes: Array<{attribute_name: string; score: number; modifier: number}>;
  skills: Array<{id_skill: number; name: string; id_attribute: number; attribute_name: string; description: string; is_trained: boolean; is_expert: boolean; level_value: number; total_skill_value: number}>;
  spells: Array<{
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
    is_prepared: boolean;
  }>;
  weapons: Array<{id_weapon: number; name: string; has_proficiency: boolean; damage_die: string | null; damage_type: string | null; properties: string | null; weight: number; price_value: number}>;
  items: Array<{name: string}>;
}

export interface CharacterSheet {
  character_sheet: {
    id_character?: number;
    header: {
      name: string;
      class_and_level: string;
      id_class: number;
      race: string;
      background: string;
      alignment: string;
      experience_points: number;
      /** XP mínimo pro próximo nível (tabela do PHB); `null` se já estiver no nível 20. */
      next_level_xp: number | null;
    };
    combat_stats: {
      proficiency_bonus: number;
      armor_class: number;
      initiative: number;
      speed: string;
      hit_points: {max: number; current: number; temporary: number};
      hit_dice: string;
      hit_dice_total: number;
      hit_dice_spent: number;
      hit_die_size: number;
      passive_perception: number;
    };
    attributes_and_saves: Record<StatKeyEn, StatBlock>;
    skills: Skill[];
    weapons: WeaponRow[];
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
      equipped_armour: {
        id_armour: number;
        name: string;
        armour_type: string | null;
      } | null;
      has_shield: boolean;
    };
    spellcasting_info?: {
      spellcasting_ability: string;
      spell_save_dc: number;
      spell_attack_bonus: number;
      slots_total?: Record<string, number>;
      slots_expended?: Record<string, number>;
      spells_known?: Record<string, string[]>;
      prepares_spells?: boolean;
      max_prepared_spells?: number;
    };
    spells: Spell[];
    avatar_preset?: AvatarPreset | null;
    image_url?: string | null;
    in_active_combat?: boolean;
    /** Recursos consumíveis rastreados (Fúria/Pontos de Chi/Canalizar Divindade/Surto de Ação/...) — vazio se a classe não tiver nenhum neste nível. Uma classe pode ter mais de um ao mesmo tempo. */
    resource_trackers: {
      name: string;
      max: number | 'unlimited';
      used: number;
      recharge_on: 'short_rest' | 'long_rest';
    }[];
    /** Características ativáveis gastando um dos `resource_trackers` (Canalizar Divindade, Fúria, Pontos de Chi, Forma Selvagem, etc.) — vazio se não houver nenhuma neste nível. */
    class_abilities: {name: string; description: string; cost: number; resource_key: string}[];
    /** Recursos de classe/subclasse que escalam por nível (ex: "Ataque Furtivo": "2d6") — informativo, `null` se não houver nenhum neste nível. */
    class_resources: Record<string, string> | null;
  };
}
