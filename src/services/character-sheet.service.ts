/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {CharacterInput, CharacterRawData, CharacterSheet, FinalStats, StatKeyEn} from '../models/character-sheet-types';
import {Spell, WeaponOption} from '../models/character-options-types';
import {CharacterRepository} from '../repositories/character.repository';
import {
  normalizeKey,
  normalizeSkill,
  resolveRace,
  resolveSubrace,
  resolveClass,
  resolveBackground,
  getMod,
  getProfBonus,
  applyRacialBonuses,
  buildAttributeBlocks,
  buildSkillBlocks,
  calcArmorClass,
  calcMaxHP,
  buildWeaponActions,
  collectTraits,
  buildSpellcasting,
  buildLanguages,
  collectProficientSkills,
} from './character-sheet/calculator';

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterSheetService {
  constructor(
    @service(CharacterRepository)
    private repository: CharacterRepository,
  ) {}

  build(input: CharacterInput): CharacterSheet {
    const {core_build, attributes, choices, equipment, character_details} = input;
    const level = core_build.level;

    const raceRule = resolveRace(core_build.id_race);
    const subraceRule = resolveSubrace(core_build.subrace);
    const classRule = resolveClass(core_build.id_class);
    // const classKey = normalizeKey(core_build.class);
    const classKey = core_build.id_class ?? 0;
    const bgRule = resolveBackground(core_build.id_background);

    const stats = applyRacialBonuses(attributes.base_values, raceRule, subraceRule);
    const profBonus = getProfBonus(level);
    const proficientSkills = collectProficientSkills(choices.skills, bgRule, raceRule);

    const attributeBlocks = buildAttributeBlocks(stats, classRule, profBonus);
    const skillBlocks = buildSkillBlocks(stats, profBonus, proficientSkills);
    const ac = calcArmorClass(equipment.armour?.name ?? 'Nenhuma', stats, equipment.has_shield, classKey);
    const maxHP = calcMaxHP(classRule.hitDie, level, getMod(stats.CON));
    const weaponActions = buildWeaponActions(equipment.weapons, stats, profBonus);
    const traits = collectTraits(raceRule, subraceRule, classRule, bgRule);
    const spellcasting = buildSpellcasting(classRule, classKey, level, choices.spells ?? [], stats, profBonus);
    const languages = buildLanguages(raceRule, bgRule);

    const isPerceptionProficient = proficientSkills.includes('perception');
    const passivePerception = 10 + getMod(stats.WIS) + (isPerceptionProficient ? profBonus : 0);

    const raceDisplay = core_build.subrace ?? raceRule.displayName;

    const startingItems = [...classRule.startingEquipment, ...bgRule.startingItems];
    const equippedWeapons = equipment.weapons
      .filter(w => !classRule.startingEquipment.some(e => e.toLowerCase().includes(w.name.toLowerCase())))
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
          speed: raceRule.speed,
          hit_points: {max: maxHP, current: maxHP, temporary: 0},
          hit_dice: `${level}d${classRule.hitDie}`,
          passive_perception: passivePerception,
        },
        attributes_and_saves: attributeBlocks,
        skills: skillBlocks,
        combat_actions: {weapons: weaponActions},
        features_and_traits: traits,
        proficiencies_and_languages: {
          armor: classRule.armorProficiencies,
          weapons: classRule.weaponProficiencies,
          tools: bgRule.tools,
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: totalGold, pp: 0},
          items: allItems,
        },
        spellcasting,
      },
    };
  }

  async saveCharacter(input: CharacterInput): Promise<CharacterSheet | null>  {
    const sheet = this.build(input);
    return this.loadCharacter(await this.repository.saveCharacter(input, sheet));
  }

  async loadCharacter(id: number): Promise<CharacterSheet | null> {
    const raw = await this.repository.findCharacterById(id);
    if (!raw) return null;

    const {character, attributes, skills, spells, weapons, items} = raw;

    const classRule = resolveClass(character.id_class);
    const raceRule = resolveRace(character.id_race);
    const bgRule = resolveBackground(character.id_background ?? 1);

    const PT_TO_EN: Record<string, StatKeyEn> = {
      FOR: 'STR', DES: 'DEX', CON: 'CON', INT: 'INT', SAB: 'WIS', CAR: 'CHA',
    };

    const stats: FinalStats = {STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10};
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
      const result = {} as Record<StatKeyEn, {score: number; modifier: number; save: number; save_proficiency: boolean}>;
      for (const key of keys) {
        const score = stats[key];
        const modifier = modifierByKey[key] ?? getMod(score);
        const hasSaveProf = classRule.savingThrows.includes(key);
        result[key] = {score, modifier, save: hasSaveProf ? modifier + profBonus : modifier, save_proficiency: hasSaveProf};
      }
      return result;
    })();

    const proficientSkillKeys = skills
      .filter(s => s.is_trained)
      .map(s => normalizeSkill(s.skill_name));

    const skillBlocks = buildSkillBlocks(stats, profBonus, proficientSkillKeys);

    const weaponOptions: WeaponOption[] = weapons.map(w => ({
      name: w.name,
      damage: '',
      properties: [],
      isRanged: false,
    }));
    const weaponActions = buildWeaponActions(weaponOptions, stats, profBonus);

    const spellList: Spell[] = spells.map(s => ({
      id_spell: s.id_spell,
      name: s.name,
      spellLevel: s.spell_level,
      description: null,
      casting_time: null,
      range_distance: null,
      duration: null,
      is_verbal: false,
      is_somatic: false,
      is_material: false,
      school: null,
    }));
    const spellcasting = buildSpellcasting(classRule, character.id_class, character.level, spellList, stats, profBonus);

    const traits = collectTraits(raceRule, null, classRule, bgRule);
    const languages = buildLanguages(raceRule, bgRule);

    return {
      character_sheet: {
        header: {
          name: character.name,
          class_and_level: `${classRule.displayName} ${character.level}`,
          race: raceRule.displayName,
          background: bgRule.displayName,
          alignment: character.alignment_name ?? 'Neutro',
          experience_points: character.xp_points,
        },
        combat_stats: {
          proficiency_bonus: character.proficiency_bonus,
          armor_class: character.armour_class,
          initiative: character.initiative_value,
          speed: raceRule.speed,
          hit_points: {
            max: character.max_hit_points,
            current: character.current_hit_points,
            temporary: 0,
          },
          hit_dice: character.hit_dice,
          passive_perception: Number(character.passive_perception),
        },
        attributes_and_saves: attributesAndSaves,
        skills: skillBlocks,
        combat_actions: {weapons: weaponActions},
        features_and_traits: traits,
        proficiencies_and_languages: {
          armor: classRule.armorProficiencies,
          weapons: classRule.weaponProficiencies,
          tools: bgRule.tools,
          languages,
        },
        equipment: {
          currency: {cp: 0, sp: 0, ep: 0, gp: character.total_po, pp: 0},
          items: items.map(i => i.name),
        },
        spellcasting,
      },
    };
  }
}
