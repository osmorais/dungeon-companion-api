/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {AvatarPreset, CharacterInput, CharacterRawData, CharacterSheet, CharacterSkillInsert, StatKeyEn} from '../models/character-sheet-types';

const STAT_TO_PT: Record<string, string> = {
  STR: 'FOR', DEX: 'DES', CON: 'CON', INT: 'INT', WIS: 'SAB', CHA: 'CAR',
};

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findAllSkills(): Promise<{id_skill: number; name: string; id_attribute: number; attribute_name: string}[]> {
    return this.db.sql`
      SELECT s.id_skill, s.name, s.id_attribute, at.name AS attribute_name
      FROM skill s
      JOIN attribute_type at ON at.id_attribute = s.id_attribute
    `;
  }

  async createCharacter(input: CharacterInput, sheet: CharacterSheet, skills: CharacterSkillInsert[], userId: string): Promise<number> {
    const {core_build, equipment, choices, character_details} = input;
    const cs = sheet.character_sheet;

    return this.db.sql.begin(async sql => {
      const [row] = await sql<{id_character: number}[]>`
        INSERT INTO character (
          name, level, id_race, subrace, id_class, id_subclass, id_armour, has_shield, id_alignment,
          proficiency_bonus, armour_class, initiative_value,
          current_hit_points, max_hit_points, hit_dice, passive_perception,
          xp_points, total_po,
          spellcasting_ability, spell_save_dc, spell_attack_bonus,
          avatar_preset,
          chosen_tool_proficiency, chosen_fighting_style,
          user_id
        ) VALUES (
          ${character_details?.name ?? 'Aventureiro'},
          ${core_build.level},
          ${core_build.id_race},
          ${core_build.subrace ?? null},
          ${core_build.id_class},
          ${core_build.id_subclass ?? null},
          ${equipment.armour?.id_armour ?? null},
          ${equipment.has_shield},
          ${character_details?.id_alignment ?? null},
          ${cs.combat_stats.proficiency_bonus},
          ${cs.combat_stats.armor_class},
          ${cs.combat_stats.initiative},
          ${cs.combat_stats.hit_points.current},
          ${cs.combat_stats.hit_points.max},
          ${cs.combat_stats.hit_dice},
          ${cs.combat_stats.passive_perception},
          ${cs.header.experience_points},
          ${cs.equipment.currency.gp},
          ${cs.spellcasting_info?.spellcasting_ability ?? null},
          ${cs.spellcasting_info?.spell_save_dc ?? null},
          ${cs.spellcasting_info?.spell_attack_bonus ?? null},
          ${input.avatar_preset ? sql.json(input.avatar_preset as any) : null},
          ${choices.tool_proficiency ?? null},
          ${choices.fighting_style ?? null},
          ${userId}
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
          INSERT INTO character_skill (id_character, id_skill, is_trained, is_expert, trained_value, level_value, total_skill_value)
          VALUES (${idCharacter}, ${skill.id_skill}, ${skill.is_trained}, ${skill.is_expert}, ${skill.trained_value}, ${skill.level_value}, ${skill.total_skill_value})
        `;
      }

      if (choices.spells?.length) {
        for (const spell of choices.spells) {
          await sql`
            INSERT INTO character_spell (id_character, id_spell, id_attribute)
            VALUES (${idCharacter}, ${spell.id_spell}, ${null})
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

  async isSessionDmOfCharacter(idCharacter: number, userId: string): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1
        FROM player_session ps
        JOIN game_session gs ON gs.id_game_session = ps.id_game_session
        WHERE ps.id_character = ${idCharacter}
          AND gs.user_id = ${userId}
      ) AS found
    `;
    return rows[0].found;
  }

  async updateCurrentHitPoints(id: number, currentHitPoints: number): Promise<void> {
    await this.db.sql`
      UPDATE character SET current_hit_points = ${currentHitPoints} WHERE id_character = ${id}
    `;
  }

  async updateEquipment(id: number, idArmour: number | null, hasShield: boolean): Promise<void> {
    await this.db.sql`
      UPDATE character SET id_armour = ${idArmour}, has_shield = ${hasShield} WHERE id_character = ${id}
    `;
  }

  async updateSpellSlotsExpended(id: number, expended: Record<string, number>): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET spell_slots_expended = ${this.db.sql.json(expended)}
      WHERE id_character = ${id}
    `;
  }

  async updateResourceUsesExpended(id: number, expended: Record<string, number>): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET resource_uses_expended = ${this.db.sql.json(expended)}
      WHERE id_character = ${id}
    `;
  }

  async updateHitDiceAndHp(id: number, hitDiceSpent: number, currentHitPoints: number): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET hit_dice_spent = ${hitDiceSpent}, current_hit_points = ${currentHitPoints}
      WHERE id_character = ${id}
    `;
  }

  /** Grau de desafio: 1 = a UNIQUE (id_character, level) em character_level_history já barra reaplicar o mesmo nível. */
  async applyLevelUp(
    idCharacter: number,
    input: {
      newLevel: number;
      hitDieRoll: number;
      conModifierAtLevel: number;
      hpGained: number;
      newMaxHitPoints: number;
      newCurrentHitPoints: number;
      newProficiencyBonus: number;
      newHitDice: string;
      newSpellSaveDc: number | null;
      newSpellAttackBonus: number | null;
      asiType: 'asi' | 'feat' | null;
      asiStatIncreases: Partial<Record<StatKeyEn, number>> | null;
      featId: string | null;
      newSpellIds: number[];
      /** Especialização/Aptidão ganha neste nível — dobra o bônus de proficiência nessas perícias, já treinadas. */
      expertiseSkillIds: number[];
      /** Só setado quando esse é o nível de escolha de subclasse; nos demais fica `null` e o
       *  COALESCE abaixo mantém a subclasse já escolhida antes intacta. */
      idSubclass: string | null;
    },
  ): Promise<{status: 'ok' | 'already_applied'; updatedAttributes: Partial<Record<StatKeyEn, {score: number; modifier: number}>>}> {
    const updatedAttributes: Partial<Record<StatKeyEn, {score: number; modifier: number}>> = {};

    try {
      await this.db.sql.begin(async sql => {
        await sql`
          UPDATE character SET
            level = ${input.newLevel},
            max_hit_points = ${input.newMaxHitPoints},
            current_hit_points = ${input.newCurrentHitPoints},
            proficiency_bonus = ${input.newProficiencyBonus},
            hit_dice = ${input.newHitDice},
            spell_save_dc = ${input.newSpellSaveDc},
            spell_attack_bonus = ${input.newSpellAttackBonus},
            id_subclass = COALESCE(id_subclass, ${input.idSubclass})
          WHERE id_character = ${idCharacter}
        `;

        if (input.asiStatIncreases && Object.keys(input.asiStatIncreases).length) {
          const attrRows = await sql<{id_attribute: number; name: string}[]>`
            SELECT id_attribute, name FROM attribute_type
          `;
          const attrByName: Record<string, number> = Object.fromEntries(
            attrRows.map(r => [r.name, r.id_attribute]),
          );

          for (const [statEn, amount] of Object.entries(input.asiStatIncreases)) {
            if (!amount) continue;
            const ptName = STAT_TO_PT[statEn];
            const idAttribute = attrByName[ptName];
            if (!idAttribute) continue;

            const [current] = await sql<{bonus_value: number}[]>`
              SELECT bonus_value FROM character_attribute
              WHERE id_character = ${idCharacter} AND id_attribute = ${idAttribute}
            `;
            const newScore = (current?.bonus_value ?? 10) + amount;
            const newModifier = Math.floor((newScore - 10) / 2);

            await sql`
              UPDATE character_attribute
              SET bonus_value = ${newScore}, modifier_value = ${newModifier}
              WHERE id_character = ${idCharacter} AND id_attribute = ${idAttribute}
            `;
            updatedAttributes[statEn as StatKeyEn] = {score: newScore, modifier: newModifier};
          }
        }

        await sql`
          INSERT INTO character_level_history (
            id_character, level, hit_die_roll, con_modifier_at_level, hp_gained,
            asi_type, asi_stat_increases, feat_id, id_subclass
          ) VALUES (
            ${idCharacter}, ${input.newLevel}, ${input.hitDieRoll}, ${input.conModifierAtLevel}, ${input.hpGained},
            ${input.asiType}, ${input.asiStatIncreases ? sql.json(input.asiStatIncreases) : null}, ${input.featId}, ${input.idSubclass}
          )
        `;

        for (const idSpell of input.newSpellIds) {
          await sql`
            INSERT INTO character_spell (id_character, id_spell, id_attribute)
            VALUES (${idCharacter}, ${idSpell}, ${null})
          `;
        }

        for (const idSkill of input.expertiseSkillIds) {
          await sql`
            UPDATE character_skill
            SET is_expert = TRUE, total_skill_value = total_skill_value + ${input.newProficiencyBonus}
            WHERE id_character = ${idCharacter} AND id_skill = ${idSkill}
          `;
        }
      });
      return {status: 'ok', updatedAttributes};
    } catch (err) {
      // unique_violation na constraint uq_character_level — esse nível já tinha sido aplicado.
      if ((err as {code?: string})?.code === '23505') {
        return {status: 'already_applied', updatedAttributes: {}};
      }
      throw err;
    }
  }

  async hasLevelHistoryEntry(idCharacter: number, level: number): Promise<boolean> {
    const rows = await this.db.sql<{id_character_level_history: number}[]>`
      SELECT id_character_level_history FROM character_level_history
      WHERE id_character = ${idCharacter} AND level = ${level}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /** Talentos escolhidos em vez de ASI ao longo dos level-ups — pra reexibir na ficha (ver collectTraits). */
  async findChosenFeats(idCharacter: number): Promise<{level: number; feat_id: string}[]> {
    return this.db.sql<{level: number; feat_id: string}[]>`
      SELECT level, feat_id FROM character_level_history
      WHERE id_character = ${idCharacter} AND feat_id IS NOT NULL
      ORDER BY level ASC
    `;
  }

  async countPreparedSpells(id: number): Promise<number> {
    const rows = await this.db.sql<{count: string}[]>`
      SELECT COUNT(*) AS count
      FROM character_spell
      WHERE id_character = ${id} AND is_prepared = TRUE
    `;
    return parseInt(rows[0].count, 10);
  }

  async setSpellPrepared(id: number, idSpell: number, isPrepared: boolean): Promise<void> {
    await this.db.sql`
      UPDATE character_spell
      SET is_prepared = ${isPrepared}
      WHERE id_character = ${id} AND id_spell = ${idSpell}
    `;
  }

  async updateAvatarPreset(id: number, preset: AvatarPreset): Promise<void> {
    await this.db.sql`
      UPDATE character
      SET avatar_preset = ${this.db.sql.json(preset as any)}
      WHERE id_character = ${id}
    `;
  }

  /**
   * Remove o personagem. As tabelas filhas (atributos, perícias, magias, armas,
   * itens, histórico) e os vínculos de sessão (player_session/npc_session) têm
   * ON DELETE CASCADE, e session_roll_log.id_character vira NULL — o registro de
   * rolagens da sessão é preservado mesmo depois do personagem removido.
   */
  async deleteCharacter(id: number): Promise<void> {
    await this.db.sql`
      DELETE FROM character WHERE id_character = ${id}
    `;
  }

  async findAllCharacters(userId: string): Promise<{id_character: number; name: string; level: number; race: string; class: string}[]> {
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
      WHERE c.user_id = ${userId}
      ORDER BY c.id_character DESC
    `;
  }

  
  async findCharactersPagedList(userId: string, pageSize: number, page: number): 
    Promise<{id_character: number; name: string; level: number; race: string; class: string, total_count: number}[]> {
    return this.db.sql`
      SELECT
          c.id_character,
          c.name,
          c.level,
          r.name AS race,
          cl.name AS class,
          COUNT(*) OVER() AS total_count
      FROM character c
      LEFT JOIN race  r  ON r.id_race  = c.id_race
      LEFT JOIN class cl ON cl.id_class = c.id_class
      WHERE c.user_id = ${userId}
      ORDER BY c.id_character
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize};
    `;
  }

  async findCharacterById(id: number): Promise<CharacterRawData | null> {
    const rows = await this.db.sql<CharacterRawData['character'][]>`
      SELECT
        c.id_character, c.name, c.level, c.id_race, c.subrace, c.id_class, c.id_subclass, c.id_armour, c.id_alignment,
        a.name AS armour_name, a.armour_type, a.armour_class_base, a.max_dexterity_bonus,
        c.has_shield,
        c.proficiency_bonus, c.armour_class, c.initiative_value,
        c.current_hit_points, c.max_hit_points, c.hit_dice, c.passive_perception,
        c.xp_points, c.total_po,
        c.spellcasting_ability, c.spell_save_dc, c.spell_attack_bonus, c.spell_slots_expended,
        c.resource_uses_expended,
        c.chosen_tool_proficiency, c.chosen_fighting_style,
        c.hit_dice_spent, c.user_id,
        c.avatar_preset,
        al.name   AS alignment_name,
        cb.id_background
      FROM character c
      LEFT JOIN alignment          al ON al.id_alignment = c.id_alignment
      LEFT JOIN armour             a  ON a.id_armour = c.id_armour
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
      SELECT s.id_skill, s.name, s.id_attribute, at.name AS attribute_name, s.description, cs.is_trained, cs.is_expert, cs.total_skill_value, cs.level_value
      FROM character_skill cs
      JOIN skill s ON s.id_skill = cs.id_skill
      JOIN attribute_type at ON at.id_attribute = s.id_attribute
      WHERE cs.id_character = ${id}
    `;

    const spells = await this.db.sql<CharacterRawData['spells'][number][]>`
      SELECT sp.id_spell, sp.name, sp.description, sp.casting_time, sp.range_distance,
             sp.duration, sp.is_verbal, sp.is_somatic, sp.is_material,
             sp.spelllevel AS "spellLevel", sp.school, csp.is_prepared
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

  
  async findBackgroundCharacterById(id_character: number):
    Promise<{id_character: number; user_id: string; full_history: string} | null> {
    const rows = await this.db.sql<{id_character: number; user_id: string; full_history: string}[]>`
      SELECT
          c.id_character,
          c.user_id,
          cb.full_history
      FROM character_background cb
      LEFT JOIN character c ON c.id_character = cb.id_character
      WHERE c.id_character = ${id_character}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async updateCharacterBackground(id_character: number, full_history: string): Promise<void> {
    await this.db.sql`
      UPDATE character_background
      SET full_history = ${full_history}
      WHERE id_character = ${id_character}
    `;
  }
}
