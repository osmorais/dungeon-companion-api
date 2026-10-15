/* eslint-disable @typescript-eslint/naming-convention */
import {Armour, Skill, Spell, WeaponRow} from '../../models/character-options-types';
import {CharacterInput, CharacterRawData, FinalStats} from '../../models/character-sheet-types';

/** Atributos finais (já em inglês), todos 10 por padrão. */
export function stats(overrides: Partial<FinalStats> = {}): FinalStats {
  return {STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...overrides};
}

export function armour(type: string, base: number, maxDex: number | null = null): Armour {
  return {
    id_armour: 1,
    name: type,
    armour_class_base: base,
    is_sum_dexterity: type !== 'Armadura Pesada',
    armour_type: type,
    max_dexterity_bonus: maxDex,
    is_stealth_disadvantage: false,
    weight: 10,
    price_value: 10,
  };
}

export function weapon(name: string, properties: string | null): WeaponRow {
  return {
    id_weapon: 1,
    attack_bonus: 0,
    damage_modifier: 0,
    name,
    damage_die: '1d8',
    damage_type: 'Cortante',
    properties,
    weight: 1,
    price_value: 1,
    isRanged: false,
  };
}

export function spell(id: number, name: string, level: number, isPrepared?: boolean): Spell {
  return {
    id_spell: id,
    name,
    description: null,
    casting_time: null,
    range_distance: null,
    duration: null,
    is_verbal: true,
    is_somatic: true,
    is_material: false,
    spellLevel: level,
    school: null,
    ...(isPrepared === undefined ? {} : {is_prepared: isPrepared}),
  };
}

export function skill(id: number, name: string, trained = true, expert = false): Skill {
  return {
    id_skill: id,
    name,
    id_attribute: 1,
    attribute_name: 'SAB',
    description: '',
    is_trained: trained,
    is_expert: expert,
    level_value: 0,
    total_skill_value: 0,
  };
}

/** Entrada mínima válida de criação: Humano Guerreiro (Soldado) nível 1, estilo Defesa. */
export function characterInput(overrides: {
  core_build?: Partial<CharacterInput['core_build']>;
  base_values?: CharacterInput['attributes']['base_values'];
  choices?: Partial<CharacterInput['choices']>;
  equipment?: Partial<CharacterInput['equipment']>;
} = {}): CharacterInput {
  return {
    core_build: {
      level: 1,
      id_race: 9,
      race: 'Humano',
      id_class: 7,
      class: 'Guerreiro',
      id_background: 13,
      background: 'Soldado',
      ...overrides.core_build,
    },
    attributes: {
      generation_method: 'standard_array',
      base_values: overrides.base_values ?? {FOR: 15, DES: 14, CON: 13, INT: 12, SAB: 10, CAR: 8},
    },
    choices: {
      skills: [],
      fighting_style: 'Defesa',
      ...overrides.choices,
    },
    equipment: {
      armour: null,
      weapons: [],
      has_shield: false,
      ...overrides.equipment,
    },
    character_details: {name: 'Teste', id_alignment: 1, alignment: 'Neutro'},
  };
}

/** Personagem como vem de `CharacterRepository.findCharacterById` — Guerreiro nv1 do usuário "owner". */
export function rawCharacter(overrides: {
  character?: Partial<CharacterRawData['character']>;
  scores?: Partial<Record<'FOR' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR', number>>;
  skills?: CharacterRawData['skills'];
  spells?: CharacterRawData['spells'];
} = {}): CharacterRawData {
  const scores = {FOR: 16, DES: 14, CON: 14, INT: 10, SAB: 12, CAR: 8, ...overrides.scores};
  return {
    character: {
      id_character: 1,
      name: 'Teste',
      level: 1,
      id_race: 9,
      subrace: null,
      id_class: 7,
      id_subclass: null,
      id_armour: null,
      armour_name: null,
      armour_type: null,
      armour_class_base: null,
      max_dexterity_bonus: null,
      has_shield: false,
      id_alignment: 1,
      proficiency_bonus: 2,
      armour_class: 12,
      initiative_value: 2,
      current_hit_points: 12,
      max_hit_points: 12,
      hit_dice: '1d10',
      passive_perception: 11,
      xp_points: 0,
      total_po: 0,
      alignment_name: 'Neutro',
      id_background: 13,
      spellcasting_ability: null,
      spell_save_dc: null,
      spell_attack_bonus: null,
      spell_slots_expended: null,
      resource_uses_expended: null,
      chosen_tool_proficiency: null,
      chosen_fighting_style: 'Defesa',
      hit_dice_spent: 0,
      user_id: 'owner',
      avatar_preset: null,
      image_url: null,
      ...overrides.character,
    },
    attributes: Object.entries(scores).map(([attribute_name, score]) => ({
      attribute_name,
      score,
      modifier: Math.floor((score - 10) / 2),
    })),
    skills: overrides.skills ?? [],
    spells: overrides.spells ?? [],
    weapons: [],
    items: [],
  };
}
