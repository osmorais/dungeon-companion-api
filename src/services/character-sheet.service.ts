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
  EquipmentUpdateInput,
} from '../models/character-sheet-types';
import {Armour, Spell, WeaponRow, Skill} from '../models/character-options-types';
import {
  LevelUpConfirmInput,
  LevelUpHitDieRoll,
  LevelUpPreview,
  LevelUpResult,
  LevelUpSpellChoices,
  LevelUpSubclassOption,
} from '../models/level-up-types';
import {CharacterRepository} from '../repositories/character.repository';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {CharacterOptionsRepository} from '../repositories/character-options.repository';
import {
  resolveRace,
  resolveSubrace,
  resolveClass,
  resolveSubclass,
  resolveBackground,
  getMod,
  getProfBonus,
  applyRacialBonuses,
  applyLevelBasedAttributeBonuses,
  grantsAllSavingThrowProficiency,
  calcAuraOfProtectionBonus,
  grantsExtraSavingThrowProficiency,
  calcSpeedBonusMeters,
  formatSpeedWithBonus,
  buildAttributeBlocks,
  calcArmorClass,
  calcMaxHP,
  calcRolledLevelUpHp,
  calcDraconicResilienceHpBonus,
  buildWeaponActions,
  collectTraits,
  buildSpellcasting,
  SubclassCastingOverride,
  buildLanguages,
  collectProficientSkills,
  normalizeKey,
  normalizeSkill,
} from './character-sheet/calculator';
import {
  SPELL_SLOTS,
  KNOWN_CASTER_CLASS_IDS,
  WIZARD_CLASS_ID,
  THIRD_CASTER_SLOTS,
  getWizardSpellbookSize,
  firstSubclassChoiceLevel,
  SUBCLASSES,
  ClassRule,
  SubclassRule,
  TRACKABLE_RESOURCES,
  maxTrackableResourceUses,
  RestType,
  XP_THRESHOLDS,
  xpNeededForLevel,
  getKnownChiAbilities,
} from './character-sheet/rules';
import {FEATS} from './character-sheet/feats';
import {CLASS_ARMOUR_RULES} from './character-sheet/armour-rules';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterSheetService {
  constructor(
    @service(CharacterRepository)
    private repository: CharacterRepository,
    @service(GameSessionRepository)
    private gameSessionRepository: GameSessionRepository,
    @service(CharacterOptionsRepository)
    private optionsRepository: CharacterOptionsRepository,
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

    // Temporariamente travado em nível 1 — criação em nível mais alto ainda não foi testada
    // a fundo (ex: escolhas de subclasse/estilo de combate que só aparecem depois do nível 1).
    if (level !== 1) {
      throw new Error('Character creation is currently limited to level 1');
    }

    const raceRule = resolveRace(core_build.id_race);
    const subraceRule = resolveSubrace(core_build.subrace);
    const classRule = resolveClass(core_build.id_class);

    // const classKey = normalizeKey(core_build.class);
    const classKey = core_build.id_class ?? 0;
    const bgRule = resolveBackground(core_build.id_background);

    // Bruxo/Clérigo/Feiticeiro escolhem subclasse já na criação (nível 1) — as demais escolhem
    // depois, via level-up (ver resolveSubclassForLevelUp). `subclassOptionsAtCreation` fica
    // vazio pras classes ainda sem SUBCLASSES cadastradas, então não trava a criação delas.
    const chooseLevel = firstSubclassChoiceLevel(classRule);
    const subclassOptionsAtCreation = chooseLevel !== null && level >= chooseLevel ? SUBCLASSES[classKey] ?? [] : [];
    if (subclassOptionsAtCreation.length > 0) {
      const valid = subclassOptionsAtCreation.some(s => s.id_subclass === core_build.id_subclass);
      if (!valid) throw new Error('Subclass choice required for this class');
    } else if (core_build.id_subclass) {
      throw new Error('Subclass choice not allowed for this class yet');
    }
    const subclassRule = resolveSubclass(classKey, core_build.id_subclass ?? null);

    if (raceRule.toolProficiencyChoice) {
      if (!choices.tool_proficiency || !raceRule.toolProficiencyChoice.options.includes(choices.tool_proficiency)) {
        throw new Error('Tool proficiency choice required for this race');
      }
    } else if (choices.tool_proficiency) {
      throw new Error('Tool proficiency choice not allowed for this race');
    }

    const fightingStyleAvailable = classRule.fightingStyleChoice && level >= classRule.fightingStyleChoice.level;
    if (fightingStyleAvailable) {
      if (!choices.fighting_style || !classRule.fightingStyleChoice!.options.includes(choices.fighting_style)) {
        throw new Error('Fighting style choice required for this class');
      }
    } else if (choices.fighting_style) {
      throw new Error('Fighting style choice not allowed for this class yet');
    }

    const stats = applyLevelBasedAttributeBonuses(
      applyRacialBonuses(
        attributes.base_values,
        raceRule,
        subraceRule,
      ),
      classKey,
      level,
    );
    const profBonus = getProfBonus(level);
    const proficientSkills = collectProficientSkills(
      choices.skills,
      bgRule,
      raceRule,
    );

    const auraOfProtectionBonus = calcAuraOfProtectionBonus(classKey, level, getMod(stats.CHA));
    const attributeBlocks = buildAttributeBlocks(
      stats,
      classRule,
      profBonus,
      grantsAllSavingThrowProficiency(classKey, level),
      auraOfProtectionBonus,
      grantsExtraSavingThrowProficiency(classKey, level),
    );
    // const skillBlocks = buildSkillBlocks(stats, profBonus, proficientSkills);
    const ac = calcArmorClass(
      equipment.armour,
      stats,
      equipment.has_shield,
      classKey,
      choices.fighting_style,
      subclassRule?.id_subclass,
    );
    const maxHP = calcMaxHP(
      classRule.hitDie,
      level,
      getMod(stats.CON),
      (subraceRule?.hpBonusPerLevel ?? 0) + calcDraconicResilienceHpBonus(subclassRule?.id_subclass),
    );
    const weaponActions = buildWeaponActions(
      equipment.weapons,
      stats,
      profBonus,
      choices.fighting_style,
    );
    const traits = collectTraits(raceRule, subraceRule, classRule, bgRule, level, subclassRule, choices.fighting_style, profBonus, stats);
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
          class_and_level: subclassRule
            ? `${classRule.displayName} (${subclassRule.displayName}) ${level}`
            : `${classRule.displayName} ${level}`,
          id_class: classKey,
          race: raceDisplay,
          background: bgRule.displayName,
          alignment: character_details?.alignment ?? 'Neutro',
          experience_points: 0,
          next_level_xp: xpNeededForLevel(level),
        },
        combat_stats: {
          proficiency_bonus: profBonus,
          armor_class: ac,
          initiative: getMod(stats.DEX),
          speed: formatSpeedWithBonus(
            subraceRule?.speedOverride ?? raceRule.speed,
            calcSpeedBonusMeters(classKey, level, classRule.featuresByLevel, equipment.armour?.armour_type ?? null, equipment.has_shield),
          ),
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
              ...(choices.tool_proficiency ? [choices.tool_proficiency] : []),
            ]),
          ],
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: totalGold, pp: 0},
          items: allItems,
          equipped_armour: equipment.armour
            ? {id_armour: equipment.armour.id_armour, name: equipment.armour.name, armour_type: equipment.armour.armour_type}
            : null,
          has_shield: equipment.has_shield,
        },
        spellcasting_info: spellcastingInfo,
        spells,
        avatar_preset: input.avatar_preset ?? null,
        resource_tracker: this.buildResourceTracker(classRule, level, 0),
        chi_abilities: getKnownChiAbilities(classKey, level).map(a => ({name: a.name, description: a.description, chi_cost: a.chiCost})),
        class_resources: this.buildClassResources(classRule, subclassRule, level),
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

  /** Recursos de classe/subclasse que escalam por nível (ex: "Ataque Furtivo": "2d6") — antes só existia no preview de level-up, agora também fica na ficha persistida. */
  private buildClassResources(
    classRule: ClassRule,
    subclassRule: SubclassRule | null,
    level: number,
  ): Record<string, string> | null {
    const classResources = classRule.featuresByLevel?.[level]?.resources ?? {};
    const subclassResources = subclassRule?.featuresByLevel[level]?.resources ?? {};
    const merged = {...classResources, ...subclassResources};
    return Object.keys(merged).length > 0 ? merged : null;
  }

  /** Recurso consumível rastreado na ficha (Fúria/Pontos de Chi/Canalizar Divindade) — `usedCount` vem de `resource_uses_expended[key]`, 0 pra personagem recém-criado. */
  private buildResourceTracker(
    classRule: ClassRule,
    level: number,
    usedCount: number,
  ): CharacterSheet['character_sheet']['resource_tracker'] {
    const resource = TRACKABLE_RESOURCES[classRule.id_class];
    if (!resource) return null;
    const max = maxTrackableResourceUses(classRule, level);
    if (max === null) return null;
    return {
      name: resource.key,
      max,
      used: max === 'unlimited' ? 0 : Math.min(usedCount, max),
      recharge_on: resource.rechargeOn,
    };
  }

  private computeSkills(
    allSkills: {
      id_skill: number;
      name: string;
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

    const classRule = resolveClass(input.core_build.id_class);
    const subclassRule = resolveSubclass(input.core_build.id_class, input.core_build.id_subclass ?? null);
    const expertiseGrant = subclassRule?.featuresByLevel[1]?.expertise ?? classRule.featuresByLevel?.[1]?.expertise ?? null;
    const expertiseIds = this.validateExpertiseSelection(expertiseGrant, input.choices.expertise_skill_ids, trainedIds, allSkills);

    return allSkills.map(skill => {
      const grantsProficiency = !!expertiseGrant?.pool && expertiseIds.has(skill.id_skill);
      const isTrained = trainedIds.has(skill.id_skill) || grantsProficiency;
      const isExpert = expertiseIds.has(skill.id_skill);
      const trained_value = isTrained ? profBonus : 0;
      const modifier = ptToModifier[skill.attribute_name] ?? 0;
      return {
        id_skill: skill.id_skill,
        is_trained: isTrained,
        is_expert: isExpert,
        trained_value,
        level_value: level,
        total_skill_value: modifier + trained_value + (isExpert ? profBonus : 0),
      };
    });
  }

  /**
   * Valida a escolha de Especialização/Aptidão (Ladino/Bardo, perícias já treinadas) ou Bênção
   * do Conhecimento (Clérigo, lista restrita, concede treino novo) contra o que a classe/
   * subclasse realmente concede no nível 1 — única situação em que isso é aplicado na criação
   * (as ocorrências em níveis mais altos só existem via level-up, ver `confirmLevelUp`).
   */
  private validateExpertiseSelection(
    grant: {count: number; pool?: string[]} | null,
    submitted: number[] | undefined,
    trainedIds: Set<number>,
    allSkills: {id_skill: number; name: string}[],
  ): Set<number> {
    const ids = submitted ?? [];
    if (!grant) {
      if (ids.length > 0) throw new Error('Expertise choice not allowed for this class');
      return new Set();
    }
    if (ids.length !== grant.count) throw new Error(`Expertise requires exactly ${grant.count} skill(s)`);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate skill in expertise selection');
    if (grant.pool) {
      const poolIds = new Set(
        allSkills.filter(s => grant.pool!.includes(normalizeSkill(s.name))).map(s => s.id_skill),
      );
      if (ids.some(id => !poolIds.has(id))) throw new Error('Expertise skill not in allowed pool');
    } else if (ids.some(id => !trainedIds.has(id))) {
      throw new Error('Expertise skill must already be trained');
    }
    return new Set(ids);
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
    const subclassRule = resolveSubclass(character.id_class, character.id_subclass);
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

    const rawStats: FinalStats = {
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
        rawStats[enKey] = attr.score;
        modifierByKey[enKey] = attr.modifier;
      }
    }

    const stats = applyLevelBasedAttributeBonuses(rawStats, character.id_class, character.level);

    const profBonus = character.proficiency_bonus;
    const allSavesProficient = grantsAllSavingThrowProficiency(character.id_class, character.level);
    const chaModifier = stats.CHA === rawStats.CHA ? modifierByKey.CHA ?? getMod(stats.CHA) : getMod(stats.CHA);
    const auraOfProtectionBonus = calcAuraOfProtectionBonus(character.id_class, character.level, chaModifier);
    const extraSaveProficiency = grantsExtraSavingThrowProficiency(character.id_class, character.level);

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
        // Só reaproveita o modificador persistido quando o atributo não foi alterado "ao vivo"
        // (Campeão Primitivo) — nesse caso o modificador precisa ser recalculado a partir do
        // score já ajustado, não do valor congelado no banco.
        const modifier = stats[key] === rawStats[key] ? modifierByKey[key] ?? getMod(score) : getMod(score);
        const hasSaveProf = allSavesProficient || classRule.savingThrows.includes(key) || extraSaveProficiency === key;
        result[key] = {
          score,
          modifier,
          save: (hasSaveProf ? modifier + profBonus : modifier) + auraOfProtectionBonus,
          save_proficiency: hasSaveProf,
        };
      }
      return result;
    })();

    // Bônus de perícia recalculado "ao vivo" (mesmo padrão da CA/deslocamento) a partir de
    // `is_trained`/`is_expert` (persistidos) + atributo/bônus de proficiência atuais — antes
    // ficava congelado no `total_skill_value` gravado na criação, e não acompanhava ASI nem
    // o bônus de proficiência subindo com o nível.
    const skillsResult: Skill[] = skills.map(s => {
      const modifier = attributesAndSaves[PT_TO_EN[s.attribute_name]]?.modifier ?? 0;
      const trainedValue = s.is_trained ? profBonus : 0;
      const expertValue = s.is_expert ? profBonus : 0;
      return {
        id_skill: s.id_skill,
        name: s.name,
        id_attribute: s.id_attribute,
        attribute_name: s.attribute_name,
        description: s.description,
        is_trained: s.is_trained,
        is_expert: s.is_expert,
        level_value: s.level_value,
        total_skill_value: modifier + trainedValue + expertValue,
      };
    });

    const weaponsForCalc: WeaponRow[] = weapons.map(w => ({
      ...w,
      attack_bonus: 0,
      damage_modifier: 0,
      isRanged: false,
    }));
    const weaponResult = buildWeaponActions(weaponsForCalc, stats, profBonus, character.chosen_fighting_style);

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

    const traits = collectTraits(raceRule, subraceRule, classRule, bgRule, character.level, subclassRule, character.chosen_fighting_style, profBonus, stats);
    const chosenFeats = await this.repository.findChosenFeats(character.id_character);
    let featInitiativeBonus = 0;
    let featPassivePerceptionBonus = 0;
    for (const chosen of chosenFeats) {
      const feat = FEATS[chosen.feat_id];
      traits.push({
        name: feat?.displayName ?? chosen.feat_id,
        source: `Talento (Nível ${chosen.level})`,
        description: feat?.description ?? '',
      });
      featInitiativeBonus += feat?.initiativeBonus ?? 0;
      featPassivePerceptionBonus += feat?.passivePerceptionBonus ?? 0;
    }
    const languages = buildLanguages(raceRule, bgRule);

    // CA deixou de ser congelada em `character.armour_class` — recalculada a cada carregamento
    // (mesmo padrão já usado pros slots de magia), pra refletir troca de equipamento e ASI de DEX.
    const equippedArmourRule = character.id_armour
      ? {armour_type: character.armour_type, armour_class_base: character.armour_class_base, max_dexterity_bonus: character.max_dexterity_bonus}
      : null;
    const ac = calcArmorClass(equippedArmourRule, stats, character.has_shield, character.id_class, character.chosen_fighting_style, subclassRule?.id_subclass);

    const spellcastingResult = buildSpellcasting(
      classRule,
      character.id_class,
      character.level,
      spellList,
      stats,
      profBonus,
      character.spell_slots_expended ?? {},
      this.subclassCastingOverride(subclassRule),
    );
    const spellcastingInfo = spellcastingResult.is_spellcaster
      ? spellcastingResult
      : undefined;

    return {
      character_sheet: {
        header: {
          name: character.name,
          class_and_level: subclassRule
            ? `${classRule.displayName} (${subclassRule.displayName}) ${character.level}`
            : `${classRule.displayName} ${character.level}`,
          id_class: character.id_class,
          race: subraceRule ? subraceRule.displayName : raceRule.displayName,
          background: bgRule.displayName,
          alignment: character.alignment_name ?? 'Neutro',
          experience_points: character.xp_points,
          next_level_xp: xpNeededForLevel(character.level),
        },
        combat_stats: {
          proficiency_bonus: character.proficiency_bonus,
          armor_class: ac,
          initiative: getMod(stats.DEX) + featInitiativeBonus,
          speed: formatSpeedWithBonus(
            subraceRule?.speedOverride ?? raceRule.speed,
            calcSpeedBonusMeters(character.id_class, character.level, classRule.featuresByLevel, character.armour_type, character.has_shield),
          ),
          hit_points: {
            max: character.max_hit_points,
            current: character.current_hit_points,
            temporary: 0,
          },
          hit_dice: character.hit_dice,
          hit_dice_total: character.level,
          hit_dice_spent: character.hit_dice_spent,
          hit_die_size: classRule.hitDie,
          // Percepção passiva recalculada "ao vivo" (mesmo padrão da CA/perícias) — antes ficava
          // congelada no valor gravado na criação, sem acompanhar ASI de SAB nem o talento
          // Observador escolhido depois.
          passive_perception:
            10 +
            getMod(stats.WIS) +
            (skills.find(s => normalizeSkill(s.name) === 'perception')?.is_trained ? profBonus : 0) +
            featPassivePerceptionBonus,
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
              ...(character.chosen_tool_proficiency ? [character.chosen_tool_proficiency] : []),
            ]),
          ],
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: character.total_po, pp: 0},
          items: items.map(i => i.name),
          equipped_armour: character.id_armour
            ? {id_armour: character.id_armour, name: character.armour_name ?? '', armour_type: character.armour_type}
            : null,
          has_shield: character.has_shield,
        },
        spellcasting_info: spellcastingInfo,
        spells: spellList,
        avatar_preset: character.avatar_preset ?? null,
        id_character: character.id_character,
        resource_tracker: this.buildResourceTracker(
          classRule,
          character.level,
          character.resource_uses_expended?.[TRACKABLE_RESOURCES[character.id_class]?.key ?? ''] ?? 0,
        ),
        chi_abilities: getKnownChiAbilities(character.id_class, character.level).map(a => ({name: a.name, description: a.description, chi_cost: a.chiCost})),
        class_resources: this.buildClassResources(classRule, subclassRule, character.level),
      },
    };
  }

  async getCharacterPrintHtml(id: number, userId: string): Promise<string> {
    const sheet = await this.loadCharacter(id, userId);
    if (!sheet) throw new Error('Character not found');
    return buildPrintHtml(sheet);
  }

  private static parseResourceCount(
    resources: Record<string, string> | undefined,
    key: string,
  ): number {
    const raw = resources?.[key];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Quantas magias/truques novos o personagem pode escolher neste nível — mesmo modelo do
   * wizard de criação (`hasSharedSpellPool` em character-wizard.component.ts): Bardo/Bruxo/
   * Feiticeiro/Ranger/Mago têm um pool livre distribuível entre círculos; Clérigo/Druida/
   * Paladino têm uma cota fixa por círculo (igual à contagem de espaços de magia daquele
   * círculo).
   */
  private computeSpellChoices(
    classKey: number,
    isSpellcaster: boolean,
    currentLevel: number,
    nextLevel: number,
    currentLevelData: {resources?: Record<string, string>} | undefined,
    nextLevelData: {resources?: Record<string, string>},
    knownSpellIds: number[],
    forceKnownCaster = false,
  ): LevelUpSpellChoices | null {
    if (!isSpellcaster) return null;

    const cantripsBefore = CharacterSheetService.parseResourceCount(currentLevelData?.resources, 'Truques Conhecidos');
    const cantripsAfter = CharacterSheetService.parseResourceCount(nextLevelData.resources, 'Truques Conhecidos');
    const cantripsGained = Math.max(0, cantripsAfter - cantripsBefore);

    let spellsGained = 0;
    const spellsGainedByCircle: Record<string, number> = {};

    if (forceKnownCaster || KNOWN_CASTER_CLASS_IDS.has(classKey)) {
      const before = CharacterSheetService.parseResourceCount(currentLevelData?.resources, 'Magias Conhecidas');
      const after = CharacterSheetService.parseResourceCount(nextLevelData.resources, 'Magias Conhecidas');
      spellsGained = Math.max(0, after - before);
    } else if (classKey === WIZARD_CLASS_ID) {
      spellsGained = Math.max(0, getWizardSpellbookSize(nextLevel) - getWizardSpellbookSize(currentLevel));
    } else {
      const before = SPELL_SLOTS[classKey]?.[currentLevel] ?? {};
      const after = SPELL_SLOTS[classKey]?.[nextLevel] ?? {};
      for (const [circleKey, afterCount] of Object.entries(after)) {
        const delta = afterCount - (before[circleKey] ?? 0);
        if (delta > 0) spellsGainedByCircle[circleKey] = delta;
      }
    }

    return {
      cantrips_gained: cantripsGained,
      spells_gained: spellsGained,
      spells_gained_by_circle: spellsGainedByCircle,
      already_known_spell_ids: knownSpellIds,
    };
  }

  private subclassCastingOverride(subclassRule: SubclassRule | null): SubclassCastingOverride | undefined {
    if (!subclassRule?.spellcasting) return undefined;
    return {ability: subclassRule.spellcasting.spellcastingAbility, slotsTable: THIRD_CASTER_SLOTS};
  }

  /**
   * Resolve a subclasse pro level-up: se `nextLevel` é o nível de escolha da classe e o
   * personagem ainda não tem uma, expõe as opções (`subclassOptions`) e, se `pendingSubclassId`
   * foi informado (preview especulativo ou confirm de verdade), passa a considerá-la escolhida
   * — sem gravar nada aqui, só devolve a regra resolvida pro resto do cálculo usar.
   */
  private resolveSubclassForLevelUp(
    classRule: ClassRule,
    classKey: number,
    currentIdSubclass: string | null,
    nextLevel: number,
    pendingSubclassId?: string,
  ): {subclassRule: SubclassRule | null; subclassOptions: LevelUpSubclassOption[] | null; chosenSubclassId: string | null} {
    const chooseLevel = firstSubclassChoiceLevel(classRule);
    // ">=" (não só "===") funciona como resgate: um personagem que já passou do nível de escolha
    // sem nunca ter escolhido (ex: criado antes dessa subclasse ter dados cadastrados) recebe a
    // opção no próximo level-up, em vez de ficar preso sem subclasse pra sempre.
    const isChooseLevel = chooseLevel !== null && nextLevel >= chooseLevel && !currentIdSubclass;

    const subclassOptions = isChooseLevel
      ? (SUBCLASSES[classKey] ?? []).map(s => ({
          id_subclass: s.id_subclass,
          display_name: s.displayName,
          features: (s.featuresByLevel[nextLevel]?.features ?? []).map(f => ({name: f.name, description: f.description})),
        }))
      : null;

    let chosenSubclassId = currentIdSubclass;
    if (isChooseLevel && pendingSubclassId) {
      const valid = (SUBCLASSES[classKey] ?? []).some(s => s.id_subclass === pendingSubclassId);
      if (!valid) throw new Error('Unknown subclass');
      chosenSubclassId = pendingSubclassId;
    }

    return {subclassRule: resolveSubclass(classKey, chosenSubclassId), subclassOptions, chosenSubclassId};
  }

  /** Resolução comum a preview/roll-hp/confirm: personagem, permissão, próximo nível e seus dados de classe. */
  private async resolveLevelUpContext(id: number, userId: string) {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId))) {
      throw new Error('Unauthorized');
    }
    if (raw.character.level >= 20) throw new Error('Max level reached');

    const nextLevel = raw.character.level + 1;
    const xpNeeded = XP_THRESHOLDS[nextLevel];
    if ((raw.character.xp_points ?? 0) < xpNeeded) {
      throw new Error(`Insufficient XP for next level (needs ${xpNeeded})`);
    }

    const classRule = resolveClass(raw.character.id_class);
    const levelData = classRule.featuresByLevel?.[nextLevel];
    if (!levelData) throw new Error('Level data not found');

    return {raw, classRule, nextLevel, levelData};
  }

  /** Rola o dado de vida do próximo nível — ação explícita do jogador, não grava nada (mesma
   *  convenção de `rollHitDie` no descanso curto: o servidor rola pra evitar trapaça, mas quem
   *  decide *quando* rolar é o jogador, clicando). */
  async rollLevelUpHitDie(id: number, userId: string): Promise<LevelUpHitDieRoll> {
    const {classRule} = await this.resolveLevelUpContext(id, userId);
    return {hit_die_roll: Math.floor(Math.random() * classRule.hitDie) + 1};
  }

  async getLevelUpPreview(id: number, userId: string, pendingSubclassId?: string): Promise<LevelUpPreview> {
    const {raw, classRule, nextLevel, levelData} = await this.resolveLevelUpContext(id, userId);
    const {character, attributes, spells} = raw;

    const stats = this.statsFromRaw(attributes);
    const conModifier = getMod(stats.CON);
    const subraceRule = resolveSubrace(character.subrace ?? undefined);

    const {subclassRule, subclassOptions} = this.resolveSubclassForLevelUp(
      classRule,
      character.id_class,
      character.id_subclass,
      nextLevel,
      pendingSubclassId,
    );
    const subclassLevelData = subclassRule?.featuresByLevel[nextLevel];
    const isSubclassCaster = !classRule.isSpellcaster && !!subclassRule?.spellcasting;
    const mergedResources = {...levelData.resources, ...subclassLevelData?.resources};
    const fightingStyleOptions =
      classRule.fightingStyleChoice &&
      nextLevel === classRule.fightingStyleChoice.level &&
      !character.chosen_fighting_style
        ? classRule.fightingStyleChoice.options
        : null;

    return {
      id_class: character.id_class,
      current_level: character.level,
      next_level: nextLevel,
      hit_die: classRule.hitDie,
      con_modifier: conModifier,
      hp_bonus_per_level: subraceRule?.hpBonusPerLevel ?? 0,
      proficiency_bonus: getProfBonus(nextLevel),
      is_asi_level: levelData.isAsiLevel,
      new_features: [
        ...levelData.features.map(f => ({name: f.name, description: f.description})),
        ...(subclassLevelData?.features.map(f => ({name: f.name, description: f.description})) ?? []),
      ],
      resources: Object.keys(mergedResources).length > 0 ? mergedResources : null,
      spell_slots_total: classRule.isSpellcaster
        ? SPELL_SLOTS[character.id_class]?.[nextLevel] ?? null
        : isSubclassCaster
          ? THIRD_CASTER_SLOTS[nextLevel] ?? null
          : null,
      feat_options: levelData.isAsiLevel
        ? Object.values(FEATS).map(f => ({id_feat: f.id_feat, display_name: f.displayName, description: f.description}))
        : [],
      spell_choices: this.computeSpellChoices(
        character.id_class,
        classRule.isSpellcaster || isSubclassCaster,
        character.level,
        nextLevel,
        isSubclassCaster ? subclassRule?.featuresByLevel[character.level] : classRule.featuresByLevel?.[character.level],
        isSubclassCaster ? subclassLevelData ?? {} : levelData,
        spells.map(s => s.id_spell),
        isSubclassCaster,
      ),
      subclass_options: subclassOptions,
      subclass_spellcasting: subclassRule?.spellcasting
        ? {spell_list_class_id: subclassRule.spellcasting.spellListClassId, allowed_schools: subclassRule.spellcasting.allowedSchools}
        : null,
      expertise_choice: levelData.expertise ? {count: levelData.expertise.count} : null,
      fighting_style_options: fightingStyleOptions,
    };
  }

  async confirmLevelUp(
    id: number,
    userId: string,
    input: LevelUpConfirmInput,
  ): Promise<LevelUpResult> {
    const {raw, classRule, nextLevel, levelData} = await this.resolveLevelUpContext(id, userId);
    const {character, attributes, spells, skills} = raw;

    if (
      !Number.isInteger(input.hit_die_roll) ||
      input.hit_die_roll < 1 ||
      input.hit_die_roll > classRule.hitDie
    ) {
      throw new Error('Invalid hit die roll');
    }

    const {subclassRule, subclassOptions, chosenSubclassId} = this.resolveSubclassForLevelUp(
      classRule,
      character.id_class,
      character.id_subclass,
      nextLevel,
      input.id_subclass,
    );
    if (subclassOptions && !chosenSubclassId) {
      throw new Error('Subclass choice required for this level');
    }
    if (!subclassOptions && input.id_subclass) {
      throw new Error('Subclass choice not allowed for this level');
    }

    const fightingStyleRequired =
      !!classRule.fightingStyleChoice &&
      nextLevel === classRule.fightingStyleChoice.level &&
      !character.chosen_fighting_style;
    if (fightingStyleRequired) {
      if (!input.fighting_style || !classRule.fightingStyleChoice!.options.includes(input.fighting_style)) {
        throw new Error('Fighting style choice required for this level');
      }
    } else if (input.fighting_style) {
      throw new Error('Fighting style choice not allowed for this level');
    }

    const subclassLevelData = subclassRule?.featuresByLevel[nextLevel];
    const isSubclassCaster = !classRule.isSpellcaster && !!subclassRule?.spellcasting;

    const knownSpellIds = spells.map(s => s.id_spell);
    const spellChoices = this.computeSpellChoices(
      character.id_class,
      classRule.isSpellcaster || isSubclassCaster,
      character.level,
      nextLevel,
      isSubclassCaster ? subclassRule?.featuresByLevel[character.level] : classRule.featuresByLevel?.[character.level],
      isSubclassCaster ? subclassLevelData ?? {} : levelData,
      knownSpellIds,
      isSubclassCaster,
    );
    const newSpellIds = this.validateNewSpellIds(input.new_spell_ids, spellChoices, knownSpellIds);

    let asiType: 'asi' | 'feat' | null = null;
    let asiStatIncreases: Partial<Record<StatKeyEn, number>> | null = null;
    let featId: string | null = null;

    if (levelData.isAsiLevel) {
      const choice = input.asi_or_feat;
      if (!choice) throw new Error('ASI or feat choice required for this level');
      asiType = choice.type;
      if (choice.type === 'asi') {
        asiStatIncreases = this.validateAsiIncreases(choice.increases);
      } else {
        const feat = FEATS[choice.feat_id];
        if (!feat) throw new Error('Unknown feat');
        featId = feat.id_feat;
        if (feat.abilityIncrease) {
          asiStatIncreases = {[feat.abilityIncrease.stat]: feat.abilityIncrease.amount};
        }
      }
    } else if (input.asi_or_feat) {
      throw new Error('ASI or feat choice not allowed for this level');
    }

    const expertiseSkillIds = this.validateLevelUpExpertiseSelection(levelData.expertise ?? null, input.expertise_skill_ids, skills);

    const stats = this.statsFromRaw(attributes);
    const conModifier = getMod(stats.CON);
    const subraceRule = resolveSubrace(character.subrace ?? undefined);
    const rolledHpGained = calcRolledLevelUpHp(
      input.hit_die_roll,
      conModifier,
      (subraceRule?.hpBonusPerLevel ?? 0) + calcDraconicResilienceHpBonus(subclassRule?.id_subclass),
    );

    // Talentos com PV extra por nível (ex: Duro): retroativo (bônus * nível já aplicado de uma
    // vez) no nível em que o talento é escolhido; nos níveis seguintes, some-se o bônus fixo.
    const chosenFeats = await this.repository.findChosenFeats(id);
    let featHpBonus = 0;
    for (const chosen of chosenFeats) {
      featHpBonus += FEATS[chosen.feat_id]?.hpBonusPerLevel ?? 0;
    }
    if (featId) {
      featHpBonus += (FEATS[featId]?.hpBonusPerLevel ?? 0) * nextLevel;
    }
    const hpGained = rolledHpGained + featHpBonus;

    const newMaxHitPoints = character.max_hit_points + hpGained;
    const newCurrentHitPoints = character.current_hit_points + hpGained;
    const newProficiencyBonus = getProfBonus(nextLevel);
    const newHitDice = `${nextLevel}d${classRule.hitDie}`;

    const spellcastingAbility = isSubclassCaster ? subclassRule?.spellcasting?.spellcastingAbility : classRule.spellcastingAbility;
    let newSpellSaveDc: number | null = null;
    let newSpellAttackBonus: number | null = null;
    if ((classRule.isSpellcaster || isSubclassCaster) && spellcastingAbility) {
      const increase = asiStatIncreases?.[spellcastingAbility] ?? 0;
      const newAbilityScore = stats[spellcastingAbility] + increase;
      const newAbilityMod = getMod(newAbilityScore);
      newSpellSaveDc = 8 + newProficiencyBonus + newAbilityMod;
      newSpellAttackBonus = newProficiencyBonus + newAbilityMod;
    }

    const result = await this.repository.applyLevelUp(id, {
      newLevel: nextLevel,
      hitDieRoll: input.hit_die_roll,
      conModifierAtLevel: conModifier,
      hpGained,
      newMaxHitPoints,
      newCurrentHitPoints,
      newProficiencyBonus,
      newHitDice,
      idSubclass: subclassOptions ? chosenSubclassId : null,
      fightingStyle: fightingStyleRequired ? input.fighting_style! : null,
      newSpellSaveDc,
      newSpellAttackBonus,
      asiType,
      asiStatIncreases,
      featId,
      newSpellIds,
      expertiseSkillIds,
    });

    if (result.status === 'already_applied') {
      throw new Error('Level already applied');
    }

    return {
      level: nextLevel,
      hp_gained: hpGained,
      max_hit_points: newMaxHitPoints,
      current_hit_points: newCurrentHitPoints,
      proficiency_bonus: newProficiencyBonus,
      hit_dice: newHitDice,
      spell_save_dc: newSpellSaveDc,
      spell_attack_bonus: newSpellAttackBonus,
      id_subclass: subclassOptions ? chosenSubclassId : null,
      updated_attributes: result.updatedAttributes,
    };
  }

  /**
   * Especialização/Aptidão ganha via level-up (Ladino nível 6, Bardo nível 3/10) — sempre a
   * partir de perícias já treinadas (nenhuma subclasse concede isso num nível de level-up hoje,
   * só a Bênção do Conhecimento do Clérigo, que só acontece na criação — ver `computeSkills`).
   */
  private validateLevelUpExpertiseSelection(
    grant: {count: number} | null,
    submitted: number[] | undefined,
    currentSkills: {id_skill: number; is_trained: boolean; is_expert: boolean}[],
  ): number[] {
    const ids = submitted ?? [];
    if (!grant) {
      if (ids.length > 0) throw new Error('Expertise choice not allowed for this level');
      return [];
    }
    if (ids.length !== grant.count) throw new Error(`Expertise requires exactly ${grant.count} skill(s)`);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate skill in expertise selection');
    const eligible = new Set(currentSkills.filter(s => s.is_trained && !s.is_expert).map(s => s.id_skill));
    if (ids.some(id => !eligible.has(id))) {
      throw new Error('Expertise skill must already be trained and not already an expert skill');
    }
    return ids;
  }

  /** ASI padrão de 5e: até 2 pontos no total, no máximo +2 num único atributo. */
  private validateAsiIncreases(
    increases: Partial<Record<StatKeyEn, number>>,
  ): Partial<Record<StatKeyEn, number>> {
    const entries = Object.entries(increases ?? {}).filter(([, v]) => (v ?? 0) !== 0);
    const total = entries.reduce((sum, [, v]) => sum + (v ?? 0), 0);
    if (total !== 2) throw new Error('ASI must total exactly 2 points');
    if (entries.some(([, v]) => (v ?? 0) < 0 || (v ?? 0) > 2)) {
      throw new Error('ASI increase per attribute must be between 0 and 2');
    }
    if (entries.length > 2) throw new Error('ASI can only affect up to 2 attributes');
    return Object.fromEntries(entries) as Partial<Record<StatKeyEn, number>>;
  }

  /**
   * Não valida se cada magia pertence à lista da classe nem respeita a cota por círculo
   * individualmente — mesmo nível de confiança já usado na criação de personagem (o catálogo
   * de magias por classe só existe no frontend). Só garante que o total não passa do permitido
   * e que nenhuma magia repetida (já conhecida ou duplicada na própria lista) seja inserida.
   */
  private validateNewSpellIds(
    submitted: number[] | undefined,
    spellChoices: LevelUpSpellChoices | null,
    knownSpellIds: number[],
  ): number[] {
    const ids = submitted ?? [];
    if (ids.length === 0) return [];
    if (!spellChoices) throw new Error('This level does not grant new spells');

    const maxAllowed =
      spellChoices.cantrips_gained +
      spellChoices.spells_gained +
      Object.values(spellChoices.spells_gained_by_circle).reduce((a, b) => a + b, 0);
    if (ids.length > maxAllowed) {
      throw new Error('Too many new spells for this level');
    }

    const knownSet = new Set(knownSpellIds);
    const seen = new Set<number>();
    for (const idSpell of ids) {
      if (knownSet.has(idSpell)) throw new Error('Spell already known');
      if (seen.has(idSpell)) throw new Error('Duplicate spell in selection');
      seen.add(idSpell);
    }
    return ids;
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

  /** Troca a armadura/escudo equipados — CA é recalculada na hora (não fica congelada, ver `loadCharacter`). */
  async updateEquipment(id: number, userId: string, input: EquipmentUpdateInput): Promise<{armor_class: number}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId))) {
      throw new Error('Unauthorized');
    }

    const {character, attributes} = raw;
    const classArmourRule = CLASS_ARMOUR_RULES[character.id_class] ?? {types: [], shield: false};

    let armour: Armour | null = null;
    if (input.id_armour !== null) {
      armour = await this.optionsRepository.findArmourById(input.id_armour);
      if (!armour) throw new Error('Unknown armour');
      if (!armour.armour_type || !classArmourRule.types.includes(armour.armour_type)) {
        throw new Error('Character is not proficient with this armour type');
      }
    }
    if (input.has_shield && !classArmourRule.shield) {
      throw new Error('Character is not proficient with shields');
    }

    await this.repository.updateEquipment(id, input.id_armour, input.has_shield);

    const stats = applyLevelBasedAttributeBonuses(this.statsFromRaw(attributes), character.id_class, character.level);
    const ac = calcArmorClass(armour, stats, input.has_shield, character.id_class, character.chosen_fighting_style, character.id_subclass);
    return {armor_class: ac};
  }

  async deleteCharacter(id: number, userId: string): Promise<{success: boolean}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) throw new Error('Character not found');
    if (raw.character.user_id !== userId) throw new Error('Unauthorized');
    await this.repository.deleteCharacter(id);
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

  /** Marca ou desfaz um uso do recurso consumível da classe (Fúria/Pontos de Chi/Canalizar Divindade). */
  async expendResourceUse(
    id: number,
    delta: number,
    userId: string,
  ): Promise<{resource_tracker: CharacterSheet['character_sheet']['resource_tracker']}> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw)
      throw new HttpErrors.NotFound(`Character with id ${id} not found`);
    if (!(await this.userCanManageCharacter(raw.character.user_id, id, userId)))
      throw new HttpErrors.Forbidden();
    // Positivo = gastar (uso avulso ou o custo de uma característica de chi, ex: Corpo Vazio =
    // 4/8), negativo = desfazer. O clamping abaixo garante que nunca passe do máximo/mínimo.
    if (!Number.isInteger(delta) || delta === 0)
      throw new HttpErrors.UnprocessableEntity('delta deve ser um número inteiro diferente de zero');

    const classRule = resolveClass(raw.character.id_class);
    const resource = TRACKABLE_RESOURCES[raw.character.id_class];
    const max = resource ? maxTrackableResourceUses(classRule, raw.character.level) : null;
    if (!resource || max === null) {
      throw new HttpErrors.UnprocessableEntity('Este personagem não possui recurso consumível rastreável');
    }

    const current = raw.character.resource_uses_expended?.[resource.key] ?? 0;
    const next = max === 'unlimited' ? Math.max(0, current + delta) : Math.min(max, Math.max(0, current + delta));
    const expended = {
      ...(raw.character.resource_uses_expended ?? {}),
      [resource.key]: next,
    };

    await this.repository.updateResourceUsesExpended(id, expended);
    return {resource_tracker: this.buildResourceTracker(classRule, raw.character.level, next)};
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
    resource_tracker: CharacterSheet['character_sheet']['resource_tracker'];
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
    await this.rechargeResourceOnRest(id, raw.character, 'short_rest');
    const resourceAfterShortRest = TRACKABLE_RESOURCES[raw.character.id_class]?.rechargeOn === 'short_rest'
      ? this.buildResourceTracker(classRule, raw.character.level, 0)
      : this.buildResourceTracker(classRule, raw.character.level, raw.character.resource_uses_expended?.[TRACKABLE_RESOURCES[raw.character.id_class]?.key ?? ''] ?? 0);

    return {
      roll,
      con_mod: conMod,
      healed,
      current_hit_points: nextHp,
      hit_dice_spent: nextSpent,
      hit_dice_total: hitDiceTotal,
      die_size: classRule.hitDie,
      resource_tracker: resourceAfterShortRest,
    };
  }

  /**
   * Zera o recurso consumível da classe (Fúria/Pontos de Chi/Canalizar Divindade) se o tipo de
   * descanso recarregar ele — descanso longo sempre recarrega (é um superconjunto do curto).
   */
  private async rechargeResourceOnRest(
    id: number,
    character: {id_class: number; resource_uses_expended: Record<string, number> | null},
    restType: RestType,
  ): Promise<void> {
    const resource = TRACKABLE_RESOURCES[character.id_class];
    if (!resource) return;
    if (restType === 'short_rest' && resource.rechargeOn !== 'short_rest') return;
    const expended = {...(character.resource_uses_expended ?? {})};
    delete expended[resource.key];
    await this.repository.updateResourceUsesExpended(id, expended);
  }

  async longRest(
    id: number,
    userId: string,
  ): Promise<{
    slots_expended: Record<string, number>;
    current_hit_points: number;
    hit_dice_spent: number;
    resource_tracker: CharacterSheet['character_sheet']['resource_tracker'];
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
    await this.rechargeResourceOnRest(id, raw.character, 'long_rest');
    const classRule = resolveClass(raw.character.id_class);

    return {
      slots_expended: {},
      current_hit_points: raw.character.max_hit_points,
      hit_dice_spent: nextSpent,
      resource_tracker: this.buildResourceTracker(classRule, raw.character.level, 0),
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
