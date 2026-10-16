import {injectable, BindingScope, service} from '@loopback/core';
import {CharacterOptionsRepository} from '../repositories/character-options.repository';
import {Alignment, Armour, Background, CharacterClass, CharacterOptions, Race, Spell, WeaponOption} from '../models/character-options-types';
import {RACES, SUBRACES, CLASSES, BACKGROUNDS} from './character-sheet/rules';
import {normalizeSkill} from './character-sheet/calculator';
import {kitWeapons} from './character-sheet/starting-items';

/** Mesmo mapeamento de `character.repository.ts` (STAT_TO_PT), duplicado aqui só pra formatar texto de exibição. */
const STAT_TO_PT: Record<string, string> = {
  STR: 'Força', DEX: 'Destreza', CON: 'Constituição', INT: 'Inteligência', WIS: 'Sabedoria', CHA: 'Carisma',
};

function formatBonuses(bonuses: Partial<Record<string, number>>): string {
  return Object.entries(bonuses)
    .map(([stat, value]) => `${STAT_TO_PT[stat] ?? stat} ${value! >= 0 ? '+' : ''}${value}`)
    .join(', ');
}

@injectable({scope: BindingScope.TRANSIENT})
export class CharacterOptionsService {
  constructor(
    @service(CharacterOptionsRepository)
    private repository: CharacterOptionsRepository,
  ) {}

  async getCharacterOptions(): Promise<CharacterOptions> {
    const [attributes, skills, rawRaces, rawClasses, rawBackgrounds, alignments, weapons, spells, armours] = await Promise.all([
      this.repository.findAttributes(),
      this.repository.findSkills(),
      this.repository.findRaces(),
      this.repository.findClasses(),
      this.repository.findBackgrounds(),
      this.repository.findAlignments(),
      this.repository.findWeapons(),
      this.repository.findSpells(),
      this.repository.findArmours(),
    ]);

    const races: Race[] = rawRaces.map(r => {
      const rule = RACES[r.id_race];
      const subraces = (rule?.subraces ?? []).map(key => {
        const subraceRule = SUBRACES[key];
        return {
          key,
          name: subraceRule.displayName,
          bonuses_text: formatBonuses(subraceRule.bonuses),
          traits: subraceRule.traits.map(t => ({name: t.name, description: t.description})),
        };
      });
      return {
        ...r,
        subraces,
        bonuses_text: formatBonuses(rule?.bonuses ?? {}),
        languages: rule?.languages ?? [],
        traits: (rule?.traits ?? []).map(t => ({name: t.name, description: t.description})),
        tool_proficiency_options: rule?.toolProficiencyChoice?.options,
      };
    });

    const classes: CharacterClass[] = rawClasses.map(c => {
      const rule = CLASSES[c.id_class];
      return {
        ...c,
        hit_die: rule?.hitDie ?? 0,
        saving_throws_text: (rule?.savingThrows ?? []).map(s => STAT_TO_PT[s] ?? s).join(', '),
        armor_proficiencies: rule?.armorProficiencies ?? [],
        weapon_proficiencies: rule?.weaponProficiencies ?? [],
        is_spellcaster: rule?.isSpellcaster ?? false,
        traits: (rule?.traits ?? []).map(t => ({name: t.name, description: t.description})),
        fighting_style_options: rule?.fightingStyleChoice?.options,
        fighting_style_level: rule?.fightingStyleChoice?.level,
        starting_gold_dice: rule?.startingGoldDice ?? {count: 0, sides: 1, multiplier: 0},
        starting_weapons: kitWeapons(rule?.startingEquipment ?? []),
      };
    });

    // As perícias do antecedente ficam em `rules.ts` como chave em inglês ("insight"); o wizard
    // precisa do nome e do id da tabela `skill` pra exibir e marcar como concedidas.
    const skillByKey = new Map(skills.map(s => [normalizeSkill(s.name), s]));
    const backgrounds: Background[] = rawBackgrounds.map(b => {
      const rule = BACKGROUNDS[b.id_background];
      const bgSkills = (rule?.skills ?? []).flatMap(key => {
        const skill = skillByKey.get(key);
        return skill ? [skill] : [];
      });
      return {
        ...b,
        skills: bgSkills.map(s => s.name),
        skill_ids: bgSkills.map(s => s.id_skill),
        tools: rule?.tools ?? [],
        feature: rule ? {name: rule.feature.name, description: rule.feature.description} : {name: '', description: ''},
        starting_weapons: kitWeapons(rule?.startingItems ?? []),
      };
    });

    return {attributes, skills, weapons, races, classes, backgrounds, alignments, spells, armours};
  }
}
