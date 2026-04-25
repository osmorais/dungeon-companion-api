/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {CharacterInput, CharacterRawData, CharacterSheet, CharacterSkillInsert} from '../models/character-sheet-types';

const STAT_TO_PT: Record<string, string> = {
  STR: 'FOR', DEX: 'DES', CON: 'CON', INT: 'INT', WIS: 'SAB', CHA: 'CAR',
};

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findAllSkills(): Promise<{id_skill: number; id_attribute: number; attribute_name: string}[]> {
    return this.db.sql`
      SELECT s.id_skill, s.id_attribute, at.name AS attribute_name
      FROM skill s
      JOIN attribute_type at ON at.id_attribute = s.id_attribute
    `;
  }

  async saveCharacter(input: CharacterInput, sheet: CharacterSheet, skills: CharacterSkillInsert[]): Promise<number> {
    const {core_build, equipment, choices, character_details} = input;
    const cs = sheet.character_sheet;

    return this.db.sql.begin(async sql => {
      const [row] = await sql<{id_character: number}[]>`
        INSERT INTO character (
          name, level, id_race, id_class, id_armour, id_alignment,
          proficiency_bonus, armour_class, initiative_value,
          current_hit_points, max_hit_points, hit_dice, passive_perception,
          xp_points, total_po
        ) VALUES (
          ${character_details?.name ?? 'Aventureiro'},
          ${core_build.level},
          ${core_build.id_race},
          ${core_build.id_class},
          ${equipment.armour?.id_armour ?? null},
          ${character_details?.id_alignment ?? null},
          ${cs.combat_stats.proficiency_bonus},
          ${cs.combat_stats.armor_class},
          ${cs.combat_stats.initiative},
          ${cs.combat_stats.hit_points.current},
          ${cs.combat_stats.hit_points.max},
          ${cs.combat_stats.hit_dice},
          ${cs.combat_stats.passive_perception},
          ${cs.header.experience_points},
          ${cs.equipment.currency.gp}
        )
        RETURNING id_character
      `;

      const idCharacter = row.id_character;

      await sql`
        INSERT INTO character_background (id_character, id_background)
        VALUES (${idCharacter}, ${core_build.id_background})
      `;

      const attrRows = await sql<{id_attribute: number; name: string}[]>`
        SELECT id_attribute, name FROM attribute_type
      `;
      const attrByName: Record<string, number> = Object.fromEntries(
        attrRows.map(r => [r.name, r.id_attribute]),
      );

      for (const [statEn, block] of Object.entries(cs.attributes_and_saves)) {
        const ptName = STAT_TO_PT[statEn];
        const idAttribute = attrByName[ptName];
        if (!idAttribute) continue;
        await sql`
          INSERT INTO character_attribute (id_character, id_attribute, bonus_value, modifier_value)
          VALUES (${idCharacter}, ${idAttribute}, ${block.score}, ${block.modifier})
        `;
      }

      for (const skill of skills) {
        await sql`
          INSERT INTO character_skill (id_character, id_skill, is_trained, trained_value, level_value, total_skill_value)
          VALUES (${idCharacter}, ${skill.id_skill}, ${skill.is_trained}, ${skill.trained_value}, ${skill.level_value}, ${skill.total_skill_value})
        `;
      }

      if (choices.spells?.length) {
        const spellcastingAbility = cs.spellcasting.spellcasting_ability;
        const spellAttrId = spellcastingAbility
          ? (attrByName[STAT_TO_PT[spellcastingAbility]] ?? null)
          : null;

        for (const spell of choices.spells) {
          await sql`
            INSERT INTO character_spell (id_character, id_spell, id_attribute)
            VALUES (${idCharacter}, ${spell.id_spell}, ${spellAttrId})
          `;
        }
      }

      if (equipment.weapons.length) {
        for (const weapon of equipment.weapons) {
          await sql`
            INSERT INTO character_weapon (id_character, id_weapon, has_proficiency)
            VALUES (${idCharacter}, ${weapon.id_weapon}, TRUE)
          `;
        }
      }

      // TO DO: ajustar para pegar pelo ID do item
      if (cs.equipment.items.length) {
        const itemRows = await sql<{id_item: number; name: string}[]>`
          SELECT id_item, name FROM item WHERE name = ANY(${cs.equipment.items})
        `;
        for (const item of itemRows) {
          await sql`
            INSERT INTO character_items (id_character, id_item)
            VALUES (${idCharacter}, ${item.id_item})
          `;
        }
      }

      return idCharacter;
    });
  }

  async findAllCharacters(): Promise<{id_character: number; name: string; level: number; race: string; class: string}[]> {
    return this.db.sql`
      SELECT
        c.id_character,
        c.name,
        c.level,
        r.name AS race,
        cl.name AS class
      FROM character c
      LEFT JOIN race  r  ON r.id_race  = c.id_race
      LEFT JOIN class cl ON cl.id_class = c.id_class
      ORDER BY c.id_character DESC
    `;
  }

  async findCharacterById(id: number): Promise<CharacterRawData | null> {
    const rows = await this.db.sql<CharacterRawData['character'][]>`
      SELECT
        c.id_character, c.name, c.level, c.id_race, c.id_class, c.id_armour, c.id_alignment,
        c.proficiency_bonus, c.armour_class, c.initiative_value,
        c.current_hit_points, c.max_hit_points, c.hit_dice, c.passive_perception,
        c.xp_points, c.total_po,
        al.name   AS alignment_name,
        cb.id_background
      FROM character c
      LEFT JOIN alignment          al ON al.id_alignment = c.id_alignment
      LEFT JOIN character_background cb ON cb.id_character = c.id_character
      WHERE c.id_character = ${id}
      LIMIT 1
    `;

    if (!rows.length) return null;

    const character = rows[0];

    const attributes = await this.db.sql<CharacterRawData['attributes'][number][]>`
      SELECT at.name AS attribute_name, ca.bonus_value AS score, ca.modifier_value AS modifier
      FROM character_attribute ca
      JOIN attribute_type at ON at.id_attribute = ca.id_attribute
      WHERE ca.id_character = ${id}
    `;

    const skills = await this.db.sql<CharacterRawData['skills'][number][]>`
      SELECT s.id_skill, s.name, s.id_attribute, s.description, cs.is_trained, cs.total_skill_value, cs.level_value
      FROM character_skill cs
      JOIN skill s ON s.id_skill = cs.id_skill
      WHERE cs.id_character = ${id}
    `;

    const spells = await this.db.sql<CharacterRawData['spells'][number][]>`
      SELECT sp.id_spell, sp.name, sp.spelllevel AS spell_level
      FROM character_spell csp
      JOIN spell sp ON sp.id_spell = csp.id_spell
      WHERE csp.id_character = ${id}
    `;

    const weapons = await this.db.sql<CharacterRawData['weapons'][number][]>`
      SELECT w.id_weapon, w.name, w.damage_die, w.damage_type, w.properties, w.weight, w.price_value, cw.has_proficiency
      FROM character_weapon cw
      JOIN weapon w ON w.id_weapon = cw.id_weapon
      WHERE cw.id_character = ${id}
    `;

    const items = await this.db.sql<CharacterRawData['items'][number][]>`
      SELECT i.name
      FROM character_items ci
      JOIN item i ON i.id_item = ci.id_item
      WHERE ci.id_character = ${id}
    `;

    return {character, attributes, skills, spells, weapons, items};
  }
}
