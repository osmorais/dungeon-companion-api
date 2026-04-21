import {FinalStats, StatKeyEn, StatBlock, SkillBlock, WeaponAction, Trait} from '../../models/character-sheet-types';
import {RACES, SUBRACES, CLASSES, BACKGROUNDS, WEAPONS, ARMOR, SKILLS, SPELL_SLOTS, RaceRule, ClassRule, BackgroundRule, WeaponRule} from './rules';

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function resolveRace(race: string): RaceRule {
  const key = normalizeKey(race);
  const rule = RACES[key]; //TO DO: Passar o ID do banco de dados.
  if (!rule) throw new Error(`Raça não encontrada: "${race}". Raças disponíveis: ${Object.keys(RACES).join(', ')}`);
  return rule;
}

export function resolveSubrace(subrace: string | undefined) {
  if (!subrace) return null;
  const key = normalizeKey(subrace);
  return SUBRACES[key] ?? null; 
}

export function resolveClass(className: string): ClassRule {
  const key = normalizeKey(className);
  const rule = CLASSES[key]; //TO DO: Passar o ID do banco de dados.
  if (!rule) throw new Error(`Classe não encontrada: "${className}". Classes disponíveis: ${Object.keys(CLASSES).join(', ')}`);
  return rule;
}

export function resolveBackground(background: string): BackgroundRule {
  const key = normalizeKey(background);
  const rule = BACKGROUNDS[key]; //TO DO: Passar o ID do banco de dados.
  if (!rule) throw new Error(`Antecedente não encontrado: "${background}". Antecedentes disponíveis: ${Object.keys(BACKGROUNDS).join(', ')}`);
  return rule;
}

export function resolveWeapon(weaponName: string): WeaponRule | null {
  const key = normalizeKey(weaponName);
  return WEAPONS[key] ?? null; //TO DO: Passar o ID do banco de dados.
}

export function resolveArmor(armorName: string) {
  const key = normalizeKey(armorName).replace(/-/g, '').replace(/\s/g, '');
  const normalized = normalizeKey(armorName); //TO DO: Passar o ID do banco de dados.
  return ARMOR[normalized] ?? ARMOR[key] ?? ARMOR['nenhuma'];
}

export function normalizeSkill(skillName: string): string {
  const map: Record<string, string> = {
    acrobacia: 'acrobatics',
    'adestrar-animais': 'animal_handling',
    adestraranimais: 'animal_handling',
    arcanismo: 'arcana',
    atletismo: 'athletics',
    enganacao: 'deception',
    historia: 'history',
    intuicao: 'insight',
    intimidacao: 'intimidation',
    investigacao: 'investigation',
    medicina: 'medicine',
    natureza: 'nature',
    percepcao: 'perception',
    performance: 'performance',
    persuasao: 'persuasion',
    religiao: 'religion',
    prestidigitacao: 'sleight_of_hand',
    furtividade: 'stealth',
    sobrevivencia: 'survival',
  };
  const key = normalizeKey(skillName).replace(/-/g, '');
  return map[key] ?? skillName.toLowerCase().replace(/\s+/g, '_');
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

export function getMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getProfBonus(level: number): number {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

export function applyRacialBonuses(
  base: Record<string, number>,
  raceRule: RaceRule,
  subraceRule: ReturnType<typeof resolveSubrace>,
): FinalStats {
  const ptToEn: Record<string, StatKeyEn> = {
    FOR: 'STR', DES: 'DEX', CON: 'CON', INT: 'INT', SAB: 'WIS', CAR: 'CHA',
  };
  const stats: FinalStats = {
    STR: base['FOR'] ?? 8,
    DEX: base['DES'] ?? 8,
    CON: base['CON'] ?? 8,
    INT: base['INT'] ?? 8,
    WIS: base['SAB'] ?? 8,
    CHA: base['CAR'] ?? 8,
  };

  for (const [stat, bonus] of Object.entries(raceRule.bonuses)) {
    stats[stat as StatKeyEn] += bonus;
  }
  if (subraceRule) {
    for (const [stat, bonus] of Object.entries(subraceRule.bonuses)) {
      stats[stat as StatKeyEn] += bonus;
    }
  }

  // Suppress unused variable warning — ptToEn kept for clarity but TypeScript
  void ptToEn;
  return stats;
}

export function buildAttributeBlocks(
  stats: FinalStats,
  classRule: ClassRule,
  profBonus: number,
): Record<StatKeyEn, StatBlock> {
  const keys: StatKeyEn[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const result = {} as Record<StatKeyEn, StatBlock>;
  for (const key of keys) {
    const score = stats[key];
    const modifier = getMod(score);
    const hasSaveProf = classRule.savingThrows.includes(key);
    result[key] = {
      score,
      modifier,
      save: hasSaveProf ? modifier + profBonus : modifier,
      save_proficiency: hasSaveProf,
    };
  }
  return result;
}

export function buildSkillBlocks(
  stats: FinalStats,
  profBonus: number,
  proficientSkills: string[],
): Record<string, SkillBlock> {
  const result: Record<string, SkillBlock> = {};
  for (const [skill, stat] of Object.entries(SKILLS)) {
    const mod = getMod(stats[stat]);
    const isProficient = proficientSkills.includes(skill);
    result[skill] = {
      stat,
      bonus: isProficient ? mod + profBonus : mod,
      proficient: isProficient,
    };
  }
  return result;
}

export function calcArmorClass(
  armorName: string,
  stats: FinalStats,
  hasShield: boolean,
  classKey: string,
): number {
  const armor = resolveArmor(armorName);
  const dexMod = getMod(stats.DEX);

  let ac: number;
  if (armor.armorType === 'none') {
    if (classKey === 'barbaro') {
      ac = 10 + dexMod + getMod(stats.CON);
    } else if (classKey === 'monge') {
      ac = 10 + dexMod + getMod(stats.WIS);
    } else {
      ac = 10 + dexMod;
    }
  } else if (armor.armorType === 'light') {
    ac = armor.baseAC + dexMod;
  } else if (armor.armorType === 'medium') {
    const cappedDex = Math.min(dexMod, armor.maxDexBonus ?? 2);
    ac = armor.baseAC + cappedDex;
  } else {
    ac = armor.baseAC;
  }

  return hasShield ? ac + 2 : ac;
}

export function calcMaxHP(hitDie: number, level: number, conMod: number): number {
  const levelOneHP = hitDie + conMod;
  if (level === 1) return Math.max(1, levelOneHP);
  const higherLevels = (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod);
  return Math.max(1, levelOneHP + higherLevels);
}

export function buildWeaponActions(
  weaponNames: string[],
  stats: FinalStats,
  profBonus: number,
): WeaponAction[] {
  return weaponNames.flatMap(name => {
    const rule = resolveWeapon(name);
    if (!rule) return [];

    const strMod = getMod(stats.STR);
    const dexMod = getMod(stats.DEX);
    let abilityMod: number;

    if (rule.isRanged) {
      abilityMod = dexMod;
    } else if (rule.isFinesse) {
      abilityMod = Math.max(strMod, dexMod);
    } else {
      abilityMod = strMod;
    }

    return [{
      name: rule.displayName,
      attack_bonus: profBonus + abilityMod,
      damage: `${rule.damageDie} + ${abilityMod}`,
      damage_type: rule.damageType,
      properties: rule.properties,
    }];
  });
}

export function collectTraits(
  raceRule: RaceRule,
  subraceRule: ReturnType<typeof resolveSubrace>,
  classRule: ClassRule,
  bgRule: BackgroundRule,
): Trait[] {
  return [
    ...raceRule.traits,
    ...(subraceRule?.traits ?? []),
    ...classRule.traits,
    bgRule.feature,
  ];
}

export function buildSpellcasting(
  classRule: ClassRule,
  classKey: string,
  level: number,
  spells: string[],
  stats: FinalStats,
  profBonus: number,
) {
  if (!classRule.isSpellcaster || !classRule.spellcastingAbility) {
    return {is_spellcaster: false};
  }

  const ability = classRule.spellcastingAbility;
  const abilityMod = getMod(stats[ability]);
  const spellSaveDC = 8 + profBonus + abilityMod;
  const spellAttackBonus = profBonus + abilityMod;

  const classSlots = SPELL_SLOTS[classKey];
  const levelSlots = classSlots?.[level] ?? (classRule.spellSlotsLevel1 > 0 ? {level_1: classRule.spellSlotsLevel1} : {});
  const slots = Object.fromEntries(
    Object.entries(levelSlots).filter(([, v]) => (v as number) > 0),
  );

  const cantrips = spells.filter(s => !s.includes('Mísseis') && !s.includes('Curar') && !s.includes('Escudo') && !s.includes('Armadura') && !s.includes('Detectar') && !s.includes('Identificar') && !s.includes('Sono'));
  const leveledSpells = spells.filter(s => !cantrips.includes(s));

  return {
    is_spellcaster: true,
    spellcasting_ability: ability,
    spell_save_dc: spellSaveDC,
    spell_attack_bonus: spellAttackBonus,
    slots_total: Object.keys(slots).length > 0 ? slots : undefined,
    slots_expended: Object.keys(slots).length > 0
      ? Object.fromEntries(Object.keys(slots).map(k => [k, 0]))
      : undefined,
    spells_known:
      spells.length > 0
        ? {cantrips, level_1: leveledSpells}
        : undefined,
  };
}

export function buildLanguages(
  raceRule: RaceRule,
  bgRule: BackgroundRule,
): string[] {
  const langs = [...raceRule.languages];
  // Add placeholder bonus languages from background
  for (let i = 0; i < bgRule.languages; i++) {
    langs.push(`Idioma à escolha ${i + 1}`);
  }
  return [...new Set(langs)];
}

export function collectProficientSkills(
  chosenSkills: string[],
  bgRule: BackgroundRule,
  raceRule: RaceRule,
): string[] {
  const normalized = chosenSkills.map(normalizeSkill);
  return [...new Set([...normalized, ...bgRule.skills, ...(raceRule.skillProficiencies ?? [])])];
}
