/* eslint-disable @typescript-eslint/naming-convention */
import {
  Armour,
  Skill,
  Spell,
  WeaponRow,
} from '../../models/character-options-types';
import {
  CharacterInput,
  CharacterRawData,
  CharacterSheet,
  CharacterSkillInsert,
  FinalStats,
} from '../../models/character-sheet-types';

/** Atributos finais (já em inglês), todos 10 por padrão. */
export function stats(overrides: Partial<FinalStats> = {}): FinalStats {
  return {STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10, ...overrides};
}

export function armour(
  type: string,
  base: number,
  maxDex: number | null = null,
): Armour {
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

/** Círculo de cada magia criada por `spell()` — o stub de `findSpellLevelsByIds` lê daqui. */
export const SPELL_LEVELS = new Map<number, number>();

export function spell(
  id: number,
  name: string,
  level: number,
  isPrepared?: boolean,
): Spell {
  SPELL_LEVELS.set(id, level);
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

export function skill(
  id: number,
  name: string,
  trained = true,
  expert = false,
): Skill {
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
export function characterInput(
  overrides: {
    core_build?: Partial<CharacterInput['core_build']>;
    base_values?: CharacterInput['attributes']['base_values'];
    choices?: Partial<CharacterInput['choices']>;
    equipment?: Partial<CharacterInput['equipment']>;
  } = {},
): CharacterInput {
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
      base_values: overrides.base_values ?? {
        FOR: 15,
        DES: 14,
        CON: 13,
        INT: 12,
        SAB: 10,
        CAR: 8,
      },
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

/** Tabela `skill` como está no banco (`docs/database/database_inserts.sql`), com o atributo já resolvido. */
export const DB_SKILLS: {
  id_skill: number;
  name: string;
  id_attribute: number;
  attribute_name: string;
}[] = [
  ['Atletismo', 'FOR'],
  ['Acrobacia', 'DES'],
  ['Furtividade', 'DES'],
  ['Prestidigitação', 'DES'],
  ['Arcanismo', 'INT'],
  ['História', 'INT'],
  ['Investigação', 'INT'],
  ['Natureza', 'INT'],
  ['Religião', 'INT'],
  ['Adestrar Animais', 'SAB'],
  ['Intuição', 'SAB'],
  ['Medicina', 'SAB'],
  ['Percepção', 'SAB'],
  ['Sobrevivência', 'SAB'],
  ['Atuação', 'CAR'],
  ['Enganação', 'CAR'],
  ['Intimidação', 'CAR'],
  ['Persuasão', 'CAR'],
].map(([name, attribute_name], i) => ({
  id_skill: i + 1,
  name,
  id_attribute:
    ['FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'].indexOf(attribute_name) + 1,
  attribute_name,
}));

/** Perícia do banco no formato que o wizard manda em `choices.skills`. */
export function dbSkill(idSkill: number): Skill {
  const row = DB_SKILLS.find(s => s.id_skill === idSkill)!;
  return {
    ...row,
    description: '',
    is_trained: true,
    is_expert: false,
    level_value: 1,
    total_skill_value: 0,
  };
}

/**
 * O que `CharacterRepository.findCharacterById` devolveria depois de
 * `CharacterRepository.createCharacter(input, sheet, skills, userId)` — espelha os INSERTs da
 * criação sem banco. Simplificação: todo item de `sheet.equipment.items` existe na tabela `item`
 * (o repositório descarta em silêncio os nomes que não existem).
 */
export function persistedFromCreation(
  input: CharacterInput,
  sheet: CharacterSheet,
  skills: CharacterSkillInsert[],
  userId: string,
  idCharacter = 1,
): CharacterRawData {
  const cs = sheet.character_sheet;
  const {core_build, equipment, choices, character_details} = input;
  const enToPt: Record<string, string> = {
    STR: 'FOR',
    DEX: 'DES',
    CON: 'CON',
    INT: 'INT',
    WIS: 'SAB',
    CHA: 'CAR',
  };
  return {
    character: {
      id_character: idCharacter,
      name: character_details?.name ?? 'Aventureiro',
      level: core_build.level,
      id_race: core_build.id_race,
      subrace: core_build.subrace ?? null,
      id_class: core_build.id_class,
      id_subclass: core_build.id_subclass ?? null,
      id_armour: equipment.armour?.id_armour ?? null,
      armour_name: equipment.armour?.name ?? null,
      armour_type: equipment.armour?.armour_type ?? null,
      armour_class_base: equipment.armour?.armour_class_base ?? null,
      max_dexterity_bonus: equipment.armour?.max_dexterity_bonus ?? null,
      has_shield: equipment.has_shield,
      id_alignment: character_details?.id_alignment ?? null,
      proficiency_bonus: cs.combat_stats.proficiency_bonus,
      armour_class: cs.combat_stats.armor_class,
      initiative_value: cs.combat_stats.initiative,
      current_hit_points: cs.combat_stats.hit_points.current,
      max_hit_points: cs.combat_stats.hit_points.max,
      hit_dice: cs.combat_stats.hit_dice,
      passive_perception: cs.combat_stats.passive_perception,
      xp_points: cs.header.experience_points,
      total_po: cs.equipment.currency.gp,
      alignment_name: character_details?.alignment ?? null,
      id_background: core_build.id_background,
      spellcasting_ability: cs.spellcasting_info?.spellcasting_ability ?? null,
      spell_save_dc: cs.spellcasting_info?.spell_save_dc ?? null,
      spell_attack_bonus: cs.spellcasting_info?.spell_attack_bonus ?? null,
      spell_slots_expended: null,
      resource_uses_expended: null,
      active_effects: null,
      chosen_tool_proficiency: choices.tool_proficiency ?? null,
      chosen_fighting_style: choices.fighting_style ?? null,
      hit_dice_spent: 0,
      user_id: userId,
      avatar_preset: input.avatar_preset ?? null,
      image_url: null,
    },
    attributes: Object.entries(cs.attributes_and_saves).map(([en, block]) => ({
      attribute_name: enToPt[en],
      score: block.score,
      modifier: block.modifier,
    })),
    skills: skills.map(s => {
      const row = DB_SKILLS.find(d => d.id_skill === s.id_skill)!;
      return {
        ...row,
        description: '',
        is_trained: s.is_trained,
        is_expert: s.is_expert,
        level_value: s.level_value,
        total_skill_value: s.total_skill_value,
      };
    }),
    spells: (choices.spells ?? []).map(s => ({
      id_spell: s.id_spell,
      name: s.name,
      description: s.description,
      casting_time: s.casting_time,
      range_distance: s.range_distance,
      duration: s.duration,
      is_verbal: s.is_verbal,
      is_somatic: s.is_somatic,
      is_material: s.is_material,
      spellLevel: s.spellLevel,
      school: s.school,
      is_prepared: false,
    })),
    weapons: equipment.weapons.map(w => ({
      id_weapon: w.id_weapon,
      name: w.name,
      has_proficiency: true,
      damage_die: w.damage_die,
      damage_type: w.damage_type,
      properties: w.properties,
      weight: w.weight,
      price_value: w.price_value,
    })),
    items: cs.equipment.items.map(name => ({name})),
  };
}

/** Personagem como vem de `CharacterRepository.findCharacterById` — Guerreiro nv1 do usuário "owner". */
export function rawCharacter(
  overrides: {
    character?: Partial<CharacterRawData['character']>;
    scores?: Partial<
      Record<'FOR' | 'DES' | 'CON' | 'INT' | 'SAB' | 'CAR', number>
    >;
    skills?: CharacterRawData['skills'];
    spells?: CharacterRawData['spells'];
  } = {},
): CharacterRawData {
  const scores = {
    FOR: 16,
    DES: 14,
    CON: 14,
    INT: 10,
    SAB: 12,
    CAR: 8,
    ...overrides.scores,
  };
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
      active_effects: null,
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
