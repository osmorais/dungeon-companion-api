/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {buildPrintHtml} from './character-sheet-print';
import {
  CharacterInput,
  CharacterSheet,
  CharacterSkillInsert,
  FinalStats,
  StatKeyEn,
  AvatarPreset,
  CharacterBackground,
} from '../models/character-sheet-types';
import {Spell, WeaponRow, Skill} from '../models/character-options-types';
import {CharacterRepository} from '../repositories/character.repository';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {
  resolveRace,
  resolveSubrace,
  resolveClass,
  resolveBackground,
  getMod,
  getProfBonus,
  applyRacialBonuses,
  buildAttributeBlocks,
  calcArmorClass,
  calcMaxHP,
  buildWeaponActions,
  collectTraits,
  buildSpellcasting,
  buildLanguages,
  collectProficientSkills,
  normalizeKey,
} from './character-sheet/calculator';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterSheetService {
  constructor(
    @service(CharacterRepository)
    private repository: CharacterRepository,
    @service(GameSessionRepository)
    private gameSessionRepository: GameSessionRepository,
  ) {}

  /**
   * O dono do personagem sempre pode gerenciá-lo; o mestre de uma sessão onde esse
   * personagem participa (como jogador ou NPC) também pode — mesmo padrão já usado
   * pra rolagens (canPostRollFor) e edição de HP na sessão.
   */
  private async userCanManageCharacter(
    characterOwnerId: string | null,
    idCharacter: number,
    userId: string,
  ): Promise<boolean> {
    if (characterOwnerId === userId) return true;
    return this.gameSessionRepository.isDmOfCharacter(idCharacter, userId);
  }

  build(input: CharacterInput): CharacterSheet {
    const {core_build, attributes, choices, equipment, character_details} =
      input;
    const level = core_build.level;

    const raceRule = resolveRace(core_build.id_race);
    const subraceRule = resolveSubrace(core_build.subrace);
    const classRule = resolveClass(core_build.id_class);

    // const classKey = normalizeKey(core_build.class);
    const classKey = core_build.id_class ?? 0;
    const bgRule = resolveBackground(core_build.id_background);

    const stats = applyRacialBonuses(
      attributes.base_values,
      raceRule,
      subraceRule,
    );
    const profBonus = getProfBonus(level);
    const proficientSkills = collectProficientSkills(
      choices.skills,
      bgRule,
      raceRule,
    );

    const attributeBlocks = buildAttributeBlocks(stats, classRule, profBonus);
    // const skillBlocks = buildSkillBlocks(stats, profBonus, proficientSkills);
    const ac = calcArmorClass(
      equipment.armour,
      stats,
      equipment.has_shield,
      classKey,
    );
    const maxHP = calcMaxHP(
      classRule.hitDie,
      level,
      getMod(stats.CON),
      subraceRule?.hpBonusPerLevel ?? 0,
    );
    const weaponActions = buildWeaponActions(
      equipment.weapons,
      stats,
      profBonus,
    );
    const traits = collectTraits(raceRule, subraceRule, classRule, bgRule);
    const spells = choices.spells ?? [];
    const languages = buildLanguages(raceRule, bgRule);

    const spellcastingResult = buildSpellcasting(
      classRule,
      classKey,
      level,
      spells,
      stats,
      profBonus,
    );
    const spellcastingInfo = spellcastingResult.is_spellcaster
      ? spellcastingResult
      : undefined;

    const isPerceptionProficient = proficientSkills.includes('perception');
    const passivePerception =
      10 + getMod(stats.WIS) + (isPerceptionProficient ? profBonus : 0);

    const raceDisplay = subraceRule
      ? subraceRule.displayName
      : raceRule.displayName;

    const startingItems = [
      ...classRule.startingEquipment,
      ...bgRule.startingItems,
    ];
    const equippedWeapons = equipment.weapons
      .filter(
        w =>
          !classRule.startingEquipment.some(e =>
            e.toLowerCase().includes(w.name.toLowerCase()),
          ),
      )
      .map(w => w.name);
    const allItems = [...new Set([...equippedWeapons, ...startingItems])];

    const totalGold = bgRule.startingGold;

    return {
      character_sheet: {
        header: {
          name: character_details?.name ?? 'Aventureiro',
          class_and_level: `${classRule.displayName} ${level}`,
          race: raceDisplay,
          background: bgRule.displayName,
          alignment: character_details?.alignment ?? 'Neutro',
          experience_points: 0,
        },
        combat_stats: {
          proficiency_bonus: profBonus,
          armor_class: ac,
          initiative: getMod(stats.DEX),
          speed: subraceRule?.speedOverride ?? raceRule.speed,
          hit_points: {max: maxHP, current: maxHP, temporary: 0},
          hit_dice: `${level}d${classRule.hitDie}`,
          hit_dice_total: level,
          hit_dice_spent: 0,
          hit_die_size: classRule.hitDie,
          passive_perception: passivePerception,
        },
        attributes_and_saves: attributeBlocks,
        skills: choices.skills,
        weapons: weaponActions,
        features_and_traits: traits,
        proficiencies_and_languages: {
          armor: [
            ...new Set([
              ...classRule.armorProficiencies,
              ...(subraceRule?.armorProficiencies ?? []),
            ]),
          ],
          weapons: [
            ...new Set([
              ...classRule.weaponProficiencies,
              ...(raceRule.weaponProficiencies ?? []),
              ...(subraceRule?.weaponProficiencies ?? []),
            ]),
          ],
          tools: [
            ...new Set([
              ...bgRule.tools,
              ...(subraceRule?.toolProficiencies ?? []),
            ]),
          ],
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: totalGold, pp: 0},
          items: allItems,
        },
        spellcasting_info: spellcastingInfo,
        spells,
        avatar_preset: input.avatar_preset ?? null,
      },
    };
  }

  async listCharacters(
    userId: string,
  ): Promise<
    {
      id_character: number;
      name: string;
      level: number;
      race: string;
      class: string;
    }[]
  > {
    return this.repository.findAllCharacters(userId);
  }

  async listCharactersPagedList(
    userId: string,
    pageSize: number,
    page: number,
  ): Promise<{
    CharacterPagedList: object[];
    page: number;
    pageSize: number;
    total_count: number;
  }> {
    const resultList = await this.repository.findCharactersPagedList(
      userId,
      pageSize,
      page,
    );

    return {
      CharacterPagedList: resultList,
      page,
      pageSize,
      total_count: resultList[0]?.total_count || 0,
    };
  }

  async createCharacter(
    input: CharacterInput,
    userId: string,
  ): Promise<CharacterSheet | null> {
    const {core_build} = input;
    const raceRule = resolveRace(core_build.id_race);
    if (raceRule.subraces?.length && !core_build.subrace) {
      throw new HttpErrors.UnprocessableEntity(
        'Esta raça requer seleção de sub-raça',
      );
    }
    if (
      core_build.subrace &&
      !raceRule.subraces?.includes(normalizeKey(core_build.subrace))
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'Sub-raça inválida para a raça selecionada',
      );
    }
    const sheet = this.build(input);
    const allSkills = await this.repository.findAllSkills();
    const computedSkills = this.computeSkills(allSkills, input, sheet);
    return this.loadCharacter(
      await this.repository.createCharacter(
        input,
        sheet,
        computedSkills,
        userId,
      ),
      userId,
    );
  }

  private computeSkills(
    allSkills: {
      id_skill: number;
      id_attribute: number;
      attribute_name: string;
    }[],
    input: CharacterInput,
    sheet: CharacterSheet,
  ): CharacterSkillInsert[] {
    const STAT_TO_PT: Record<string, string> = {
      STR: 'FOR',
      DEX: 'DES',
      CON: 'CON',
      INT: 'INT',
      WIS: 'SAB',
      CHA: 'CAR',
    };

    const ptToModifier: Record<string, number> = {};
    for (const [enKey, block] of Object.entries(
      sheet.character_sheet.attributes_and_saves,
    )) {
      const ptName = STAT_TO_PT[enKey];
      if (ptName) ptToModifier[ptName] = block.modifier;
    }

    const trainedIds = new Set(
      (input.choices.skills ?? []).map(s => s.id_skill),
    );
    const profBonus = sheet.character_sheet.combat_stats.proficiency_bonus;
    const level = input.core_build.level;

    return allSkills.map(skill => {
      const isTrained = trainedIds.has(skill.id_skill);
      const trained_value = isTrained ? profBonus : 0;
      const modifier = ptToModifier[skill.attribute_name] ?? 0;
      return {
        id_skill: skill.id_skill,
        is_trained: isTrained,
        trained_value,
        level_value: level,
        total_skill_value: modifier + trained_value,
      };
    });
  }

  async loadCharacter(
    id: number,
    userId: string,
  ): Promise<CharacterSheet | null> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) return null;

    if (raw.character.user_id !== userId) {
      const isDm = await this.repository.isSessionDmOfCharacter(
        raw.character.id_character,
        userId,
      );
      if (!isDm) throw new Error('Unauthorized');
    }

    const {character, attributes, skills, spells, weapons, items} = raw;

    const classRule = resolveClass(character.id_class);
    const raceRule = resolveRace(character.id_race);
    const subraceRule = resolveSubrace(character.subrace ?? undefined);
    const bgRule = resolveBackground(character.id_background ?? 1);

    const PT_TO_EN: Record<string, StatKeyEn> = {
      FOR: 'STR',
      DES: 'DEX',
      CON: 'CON',
      INT: 'INT',
      SAB: 'WIS',
      CAR: 'CHA',
    };

    const stats: FinalStats = {
      STR: 10,
      DEX: 10,
      CON: 10,
      INT: 10,
      WIS: 10,
      CHA: 10,
    };
    const modifierByKey: Partial<Record<StatKeyEn, number>> = {};

    for (const attr of attributes) {
      const enKey = PT_TO_EN[attr.attribute_name];
      if (enKey) {
        stats[enKey] = attr.score;
        modifierByKey[enKey] = attr.modifier;
      }
    }

    const profBonus = character.proficiency_bonus;

    const attributesAndSaves = (() => {
      const keys: StatKeyEn[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
      const result = {} as Record<
        StatKeyEn,
        {
          score: number;
          modifier: number;
          save: number;
          save_proficiency: boolean;
        }
      >;
      for (const key of keys) {
        const score = stats[key];
        const modifier = modifierByKey[key] ?? getMod(score);
        const hasSaveProf = classRule.savingThrows.includes(key);
        result[key] = {
          score,
          modifier,
          save: hasSaveProf ? modifier + profBonus : modifier,
          save_proficiency: hasSaveProf,
        };
      }
      return result;
    })();

    const skillsResult: Skill[] = skills.map(s => ({
      id_skill: s.id_skill,
      name: s.name,
      id_attribute: s.id_attribute,
      attribute_name: s.attribute_name,
      description: s.description,
      is_trained: s.is_trained,
      level_value: s.level_value,
      total_skill_value: s.total_skill_value,
    }));

    const weaponsForCalc: WeaponRow[] = weapons.map(w => ({
      ...w,
      attack_bonus: 0,
      isRanged: false,
    }));
    const weaponResult = buildWeaponActions(weaponsForCalc, stats, profBonus);

    const spellList: Spell[] = spells.map(s => ({
      id_spell: s.id_spell,
      name: s.name,
      spellLevel: s.spellLevel,
      description: s.description,
      casting_time: s.casting_time,
      range_distance: s.range_distance,
      duration: s.duration,
      is_verbal: s.is_verbal,
      is_somatic: s.is_somatic,
      is_material: s.is_material,
      school: s.school,
      is_prepared: s.is_prepared,
    }));

    const traits = collectTraits(raceRule, subraceRule, classRule, bgRule);
    const languages = buildLanguages(raceRule, bgRule);

    const spellcastingResult = buildSpellcasting(
      classRule,
      character.id_class,
      character.level,
      spellList,
      stats,
      profBonus,
      character.spell_slots_expended ?? {},
    );
    const spellcastingInfo = spellcastingResult.is_spellcaster
      ? spellcastingResult
      : undefined;

    return {
      character_sheet: {
        header: {
          name: character.name,
          class_and_level: `${classRule.displayName} ${character.level}`,
          race: subraceRule ? subraceRule.displayName : raceRule.displayName,
          background: bgRule.displayName,
          alignment: character.alignment_name ?? 'Neutro',
          experience_points: character.xp_points,
        },
        combat_stats: {
          proficiency_bonus: character.proficiency_bonus,
          armor_class: character.armour_class,
          initiative: character.initiative_value,
          speed: subraceRule?.speedOverride ?? raceRule.speed,
          hit_points: {
            max: character.max_hit_points,
            current: character.current_hit_points,
            temporary: 0,
          },
          hit_dice: character.hit_dice,
          hit_dice_total: character.level,
          hit_dice_spent: character.hit_dice_spent,
          hit_die_size: classRule.hitDie,
          passive_perception: Number(character.passive_perception),
        },
        attributes_and_saves: attributesAndSaves,
        skills: skillsResult,
        weapons: weaponResult,
        features_and_traits: traits,
        proficiencies_and_languages: {
          armor: [
            ...new Set([
              ...classRule.armorProficiencies,
              ...(subraceRule?.armorProficiencies ?? []),
            ]),
          ],
          weapons: [
            ...new Set([
              ...classRule.weaponProficiencies,
              ...(raceRule.weaponProficiencies ?? []),
              ...(subraceRule?.weaponProficiencies ?? []),
            ]),
          ],
          tools: [
            ...new Set([
              ...bgRule.tools,
              ...(subraceRule?.toolProficiencies ?? []),
            ]),
          ],
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: character.total_po, pp: 0},
          items: items.map(i => i.name),
        },
        spellcasting_info: spellcastingInfo,
        spells: spellList,
        avatar_preset: character.avatar_preset ?? null,
        id_character: character.id_character,
      },
    };
  }

  async getCharacterPrintHtml(id: number, userId: string): Promise<string> {
    const sheet = await this.loadCharacter(id, userId);
    if (!sheet) throw new Error('Character not found');
    return buildPrintHtml(sheet);
  }

  async updateCurrentHitPoints(
    id: number,
    currentHitPoints: number,
    userId: string,
  ): Promise<{success: boolean}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (raw.character.user_id !== userId) throw new Error('Unauthorized');
    await this.repository.updateCurrentHitPoints(id, currentHitPoints);
    return {success: true};
  }

  async updateAvatarPreset(
    id: number,
    preset: AvatarPreset,
    userId: string,
  ): Promise<{success: boolean}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (raw.character.user_id !== userId) throw new Error('Unauthorized');
    await this.repository.updateAvatarPreset(id, preset);
    return {success: true};
  }

  private statsFromRaw(
    attributes: {attribute_name: string; score: number}[],
  ): FinalStats {
    const PT_TO_EN: Record<string, StatKeyEn> = {
      FOR: 'STR',
      DES: 'DEX',
      CON: 'CON',
      INT: 'INT',
      SAB: 'WIS',
      CAR: 'CHA',
    };
    const stats: FinalStats = {
      STR: 10,
      DEX: 10,
      CON: 10,
      INT: 10,
      WIS: 10,
      CHA: 10,
    };
    for (const attr of attributes) {
      const enKey = PT_TO_EN[attr.attribute_name];
      if (enKey) stats[enKey] = attr.score;
    }
    return stats;
  }

  async expendSpellSlot(
    id: number,
    level: number,
    delta: number,
    userId: string,
  ): Promise<{slots_expended: Record<string, number>}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw)
      throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId)))
      throw new HttpErrors.Forbidden();
    if (!Number.isInteger(level) || level < 1)
      throw new HttpErrors.UnprocessableEntity('level inválido');
    if (delta !== 1 && delta !== -1)
      throw new HttpErrors.UnprocessableEntity('delta deve ser 1 ou -1');

    const classRule = resolveClass(raw.character.id_class);
    const stats = this.statsFromRaw(raw.attributes);
    const spellcasting = buildSpellcasting(
      classRule,
      raw.character.id_class,
      raw.character.level,
      [],
      stats,
      raw.character.proficiency_bonus,
      raw.character.spell_slots_expended ?? {},
    );

    const key = `level_${level}`;
    const max = spellcasting.is_spellcaster
      ? (spellcasting.slots_total?.[key] ?? 0)
      : 0;
    if (max === 0)
      throw new HttpErrors.UnprocessableEntity(
        'Este personagem não possui espaços de magia desse nível',
      );

    const current = raw.character.spell_slots_expended?.[key] ?? 0;
    const next = Math.min(max, Math.max(0, current + delta));
    const expended = {
      ...(raw.character.spell_slots_expended ?? {}),
      [key]: next,
    };

    await this.repository.updateSpellSlotsExpended(id, expended);
    return {slots_expended: expended};
  }

  async rollHitDie(
    id: number,
    userId: string,
  ): Promise<{
    roll: number;
    con_mod: number;
    healed: number;
    current_hit_points: number;
    hit_dice_spent: number;
    hit_dice_total: number;
    die_size: number;
  }> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw)
      throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId)))
      throw new HttpErrors.Forbidden();

    const classRule = resolveClass(raw.character.id_class);
    const hitDiceTotal = raw.character.level;
    const spent = raw.character.hit_dice_spent ?? 0;
    if (spent >= hitDiceTotal) {
      throw new HttpErrors.UnprocessableEntity(
        'Nenhum Dado de Vida disponível para gastar',
      );
    }
    if (raw.character.current_hit_points >= raw.character.max_hit_points) {
      throw new HttpErrors.UnprocessableEntity(
        'O personagem já está com os pontos de vida máximos',
      );
    }

    const stats = this.statsFromRaw(raw.attributes);
    const conMod = getMod(stats.CON);
    const roll = Math.floor(Math.random() * classRule.hitDie) + 1;
    const healed = Math.max(0, roll + conMod);
    const nextHp = Math.min(
      raw.character.max_hit_points,
      raw.character.current_hit_points + healed,
    );
    const nextSpent = spent + 1;

    await this.repository.updateHitDiceAndHp(id, nextSpent, nextHp);

    return {
      roll,
      con_mod: conMod,
      healed,
      current_hit_points: nextHp,
      hit_dice_spent: nextSpent,
      hit_dice_total: hitDiceTotal,
      die_size: classRule.hitDie,
    };
  }

  async longRest(
    id: number,
    userId: string,
  ): Promise<{
    slots_expended: Record<string, number>;
    current_hit_points: number;
    hit_dice_spent: number;
  }> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw)
      throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId)))
      throw new HttpErrors.Forbidden();
    if (raw.character.current_hit_points <= 0) {
      throw new HttpErrors.UnprocessableEntity(
        'O personagem precisa de pelo menos 1 ponto de vida para se beneficiar de um descanso longo',
      );
    }

    const hitDiceTotal = raw.character.level;
    const recoveredDice = Math.max(1, Math.floor(hitDiceTotal / 2));
    const nextSpent = Math.max(
      0,
      (raw.character.hit_dice_spent ?? 0) - recoveredDice,
    );

    await this.repository.updateHitDiceAndHp(
      id,
      nextSpent,
      raw.character.max_hit_points,
    );
    await this.repository.updateSpellSlotsExpended(id, {});

    return {
      slots_expended: {},
      current_hit_points: raw.character.max_hit_points,
      hit_dice_spent: nextSpent,
    };
  }

  async setSpellPrepared(
    id: number,
    idSpell: number,
    isPrepared: boolean,
    userId: string,
  ): Promise<{success: boolean}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw)
      throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId)))
      throw new HttpErrors.Forbidden();

    const classRule = resolveClass(raw.character.id_class);
    if (!classRule.preparesSpells) {
      throw new HttpErrors.UnprocessableEntity(
        'Esta classe não precisa preparar magias com antecedência',
      );
    }

    if (isPrepared) {
      const stats = this.statsFromRaw(raw.attributes);
      const abilityMod = classRule.spellcastingAbility
        ? getMod(stats[classRule.spellcastingAbility])
        : 0;
      const maxPrepared = Math.max(1, abilityMod + raw.character.level);
      const alreadyPrepared = raw.spells.some(
        s => s.id_spell === idSpell && s.is_prepared,
      );

      if (!alreadyPrepared) {
        const currentCount = await this.repository.countPreparedSpells(id);
        if (currentCount >= maxPrepared) {
          throw new HttpErrors.UnprocessableEntity(
            `Limite de magias preparadas atingido (${maxPrepared})`,
          );
        }
      }
    }

    await this.repository.setSpellPrepared(id, idSpell, isPrepared);
    return {success: true};
  }

  async getCharacterBackground(
    id: number,
    userId: string,
  ): Promise<{id_character: number; full_history: string}> {
    const raw = await this.repository.findBackgroundCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (raw.user_id !== userId) throw new Error('Unauthorized');
    return {id_character: raw.id_character, full_history: raw.full_history};
  }

  async updateCharacterBackground(
    characterBackground: CharacterBackground,
    userId: string,
  ): Promise<{success: boolean}> {
    const raw = await this.repository.findBackgroundCharacterById(
      characterBackground.id_character,
    );
    if (!raw) throw new Error('Character not found');
    if (raw.user_id !== userId) throw new Error('Unauthorized');
    await this.repository.updateCharacterBackground(
      characterBackground.id_character,
      characterBackground.full_history,
    );
    return {success: true};
  }
}
