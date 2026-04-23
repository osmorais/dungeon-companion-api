import {injectable, BindingScope} from '@loopback/core';
import {CharacterInput, CharacterSheet} from '../models/character-sheet-types';
import {
  normalizeKey,
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
}
