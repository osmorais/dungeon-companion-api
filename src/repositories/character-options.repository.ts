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
    return this.db.sql<Skill[]>`SELECT id_skill, name, id_attribute FROM skill`;
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

  async findSpellsByLevel(spellLevel: number): Promise<Spell[]> {
    return this.db.sql<Spell[]>`
      SELECT id_spell, name, description, casting_time, range_distance, duration,
             is_verbal, is_somatic, is_material, spelllevel AS "spellLevel", school
      FROM spell
      WHERE spelllevel = ${spellLevel}
      ORDER BY name
    `;
  }

}
