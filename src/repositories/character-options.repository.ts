import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {Alignment, Armour, AttributeType, Background, CharacterClass, Race, Skill, Spell, WeaponRow} from '../models/character-options-types';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findAttributes(): Promise<AttributeType[]> {
    return this.db.sql<AttributeType[]>`SELECT id_attribute, name, full_name FROM attribute_type`;
  }

  async findSkills(): Promise<Skill[]> {
    return this.db.sql<Skill[]>`
      SELECT s.id_skill, s.name, s.id_attribute, at.name AS attribute_name, s.description
      FROM skill s
      JOIN attribute_type at ON at.id_attribute = s.id_attribute
    `;
  }

  async findRaces(): Promise<Race[]> {
    return this.db.sql<Race[]>`SELECT id_race, name, movement FROM race`;
  }

  async findClasses(): Promise<CharacterClass[]> {
    return this.db.sql<CharacterClass[]>`SELECT id_class, name, starting_gold_po FROM class`;
  }

  async findBackgrounds(): Promise<Background[]> {
    return this.db.sql<Background[]>`SELECT id_background, name, starting_gold_po, languages_number FROM background`;
  }

  async findAlignments(): Promise<Alignment[]> {
    return this.db.sql<Alignment[]>`SELECT id_alignment, name, description FROM alignment`;
  }

  async findWeapons(): Promise<WeaponRow[]> {
    return this.db.sql<WeaponRow[]>`SELECT id_weapon, name, damage_die, damage_type, properties, weight, price_value FROM weapon`;
  }

  async findSpells(): Promise<Spell[]> {
    return this.db.sql<Spell[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
             is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school
      FROM spell
      ORDER BY spelllevel, name
    `;
  }

  async findArmours(): Promise<Armour[]> {
    return this.db.sql<Armour[]>`
      SELECT id_armour, name, armour_class_base, is_sum_dexterity, armour_type,
             max_dexterity_bonus, is_stealth_disadvantage, weight, price_value
      FROM armour
      ORDER BY armour_type, name
    `;
  }

  async findArmourById(id: number): Promise<Armour | null> {
    const rows = await this.db.sql<Armour[]>`
      SELECT id_armour, name, armour_class_base, is_sum_dexterity, armour_type,
             max_dexterity_bonus, is_stealth_disadvantage, weight, price_value
      FROM armour
      WHERE id_armour = ${id}
    `;
    return rows[0] ?? null;
  }

  async findSpellsByLevel(spellLevel: number): Promise<Spell[]> {
    return this.db.sql<Spell[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
             is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school
      FROM spell
      WHERE spelllevel = ${spellLevel}
      ORDER BY name
    `;
  }

  /** Usado pra montar a lista completa de magias de um conjurador "de lista cheia"
   *  (Clérigo/Druida/Paladino) — filtra por círculo pra só trazer o que o nível atual permite. */
  async findSpellsByIdsUpToLevel(ids: number[], maxSpellLevel: number): Promise<Spell[]> {
    if (ids.length === 0) return [];
    return this.db.sql<Spell[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
             is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school
      FROM spell
      WHERE id_spell = ANY(${ids}) AND spelllevel BETWEEN 1 AND ${maxSpellLevel}
      ORDER BY spelllevel, name
    `;
  }

}
