/* eslint-disable no-void */
/* eslint-disable @typescript-eslint/naming-convention */
import {FinalStats, StatKeyEn, StatBlock, SkillBlock, WeaponAction, Trait} from '../../models/character-sheet-types';
import {Armour, Skill, Spell, WeaponOption, WeaponRow} from '../../models/character-options-types';
import {RACES, SUBRACES, CLASSES, BACKGROUNDS, WEAPONS, SPELL_SLOTS, SUBCLASSES, RaceRule, ClassRule, BackgroundRule, WeaponRule, SubclassRule} from './rules';

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

export function resolveRace(id_race: number): RaceRule {
  const key = id_race ?? 0;
  const rule = RACES[key];
  if (!rule) throw new Error(`ID da raça não encontrado: "${id_race}". Raças disponíveis: ${Object.keys(RACES).join(', ')}`);
  return rule;
}

export function resolveSubrace(subrace: string | undefined) {
  if (!subrace) return null;
  const key = normalizeKey(subrace);
  return SUBRACES[key] ?? null; 
}

export function resolveClass(id_class: number): ClassRule {
  const key = id_class ?? 0;
  const rule = CLASSES[key]; 
  if (!rule) throw new Error(`ID da classe não encontrado: "${id_class}". Classes disponíveis: ${Object.keys(CLASSES).join(', ')}`);
  return rule;
}

export function resolveSubclass(id_class: number, id_subclass: string | null | undefined): SubclassRule | null {
  if (!id_subclass) return null;
  return (SUBCLASSES[id_class] ?? []).find(s => s.id_subclass === id_subclass) ?? null;
}

export function resolveBackground(id_background: number): BackgroundRule {
  const key = id_background ?? 0;
  const rule = BACKGROUNDS[key];
  if (!rule) throw new Error(`ID do antecedente não encontrado: "${id_background}". Antecedentes disponíveis: ${Object.keys(BACKGROUNDS).join(', ')}`);
  return rule;
}

export function resolveWeapon(weaponName: string): WeaponRule | null {
  const key = normalizeKey(weaponName);
  return WEAPONS[key] ?? null; //TO DO: Passar o ID do banco de dados.
}

// export function resolveArmor(armorName: string) {
//   const key = normalizeKey(armorName).replace(/-/g, '').replace(/\s/g, '');
//   const normalized = normalizeKey(armorName); //TO DO: Passar o ID do banco de dados.
//   return ARMOR[normalized] ?? ARMOR[key] ?? ARMOR['nenhuma'];
// }

export function normalizeSkill(skillName: string): string {
  const map: Record<string, string> = { //TO DO: Utilizar listagem de pericias do banco de dados e passar ID da skill no parametro
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

/**
 * Aumento de atributo concedido automaticamente por uma feature de nível alto (ex: Campeão
 * Primitivo do Bárbaro no nível 20: FOR e CON +4, máximo 24). Aplicado sempre "ao vivo" sobre
 * os atributos já persistidos (mesmo padrão da CA), nunca gravado como um novo valor de base —
 * assim não precisa de migração nem risco de aplicar em dobro.
 */
export function applyLevelBasedAttributeBonuses(
  stats: FinalStats,
  classKey: number,
  level: number,
): FinalStats {
  if (classKey === CLASSES[1].id_class && level >= 20) { // Bárbaro: Campeão Primitivo
    return {
      ...stats,
      STR: Math.min(24, stats.STR + 4),
      CON: Math.min(24, stats.CON + 4),
    };
  }
  return stats;
}

/** Alma de Diamante (Monge, nível 14): proficiência em todos os testes de resistência. */
export function grantsAllSavingThrowProficiency(classKey: number, level: number): boolean {
  return classKey === CLASSES[10].id_class && level >= 14;
}

/**
 * Aura de Proteção (Paladino, nível 6): bônus no próprio teste de resistência igual ao
 * modificador de Carisma (mínimo +1) — só a parte "a si mesmo" é automatizada aqui; o alcance de
 * 3m/9m pra aliados próximos continua narrativo, já que exige rastrear posição em combate.
 */
export function calcAuraOfProtectionBonus(classKey: number, level: number, chaModifier: number): number {
  if (classKey !== CLASSES[11].id_class || level < 6) return 0;
  return Math.max(1, chaModifier);
}

/** Mente Escorregadia (Ladino, nível 15): proficiência extra em salvaguardas de Sabedoria. */
export function grantsExtraSavingThrowProficiency(classKey: number, level: number): StatKeyEn | null {
  if (classKey === CLASSES[8].id_class && level >= 15) return 'WIS';
  return null;
}

export function buildAttributeBlocks(
  stats: FinalStats,
  classRule: ClassRule,
  profBonus: number,
  allSavesProficient = false,
  auraOfProtectionBonus = 0,
  extraSaveProficiency: StatKeyEn | null = null,
): Record<StatKeyEn, StatBlock> {
  const keys: StatKeyEn[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const result = {} as Record<StatKeyEn, StatBlock>;
  for (const key of keys) {
    const score = stats[key];
    const modifier = getMod(score);
    const hasSaveProf = allSavesProficient || classRule.savingThrows.includes(key) || extraSaveProficiency === key;
    const baseSave = hasSaveProf ? modifier + profBonus : modifier;
    result[key] = {
      score,
      modifier,
      save: baseSave + auraOfProtectionBonus,
      save_proficiency: hasSaveProf,
    };
  }
  return result;
}

/**
 * Bônus de deslocamento concedido por nível (Movimento Rápido do Bárbaro, Deslocamento sem
 * Armadura do Monge) — condicionado ao equipamento atual, igual à CA. Reaproveita os valores já
 * tabelados em `featuresByLevel[n].resources` do Monge em vez de duplicar uma segunda tabela.
 */
export function calcSpeedBonusMeters(
  classKey: number,
  level: number,
  featuresByLevel: ClassRule['featuresByLevel'],
  armourType: string | null,
  hasShield: boolean,
): number {
  if (classKey === CLASSES[1].id_class) { // Bárbaro: Movimento Rápido
    if (level >= 5 && armourType !== 'Armadura Pesada') return 3;
    return 0;
  }
  if (classKey === CLASSES[10].id_class) { // Monge: Deslocamento sem Armadura
    if (armourType != null || hasShield) return 0;
    const raw = featuresByLevel?.[level]?.resources?.['Deslocamento sem Armadura'];
    if (!raw || raw === '–') return 0;
    return parseFloat(raw.replace(',', '.').replace('+', '').replace('m', ''));
  }
  return 0;
}

/** Soma um bônus de deslocamento (em metros) a um texto de velocidade base (ex: "9m", "7,5m"). */
export function formatSpeedWithBonus(baseSpeedText: string, bonusMeters: number): string {
  if (bonusMeters <= 0) return baseSpeedText;
  const base = parseFloat(baseSpeedText.replace(',', '.').replace('m', ''));
  const total = base + bonusMeters;
  const formatted = Number.isInteger(total) ? `${total}` : total.toFixed(1).replace('.', ',');
  return `${formatted}m`;
}

// export function buildSkillBlocks(
//   stats: FinalStats,
//   profBonus: number,
//   proficientSkills: string[],
// ): Record<string, SkillBlock> {
//   const result: Record<string, SkillBlock> = {};
//   for (const [skill, stat] of Object.entries(SKILLS)) {
//     const mod = getMod(stats[stat]);
//     const isProficient = proficientSkills.includes(skill);
//     result[skill] = {
//       stat,
//       bonus: isProficient ? mod + profBonus : mod,
//       proficient: isProficient,
//     };
//   }
//   return result;
// }

export function calcArmorClass(
  armor: Pick<Armour, 'armour_type' | 'armour_class_base' | 'max_dexterity_bonus'> | null,
  stats: FinalStats,
  hasShield: boolean,
  classKey: number,
  fightingStyle?: string | null,
  idSubclass?: string | null,
): number {
  // const armor = resolveArmor(armorName);
  const dexMod = getMod(stats.DEX);

  let ac: number;
  if (armor?.armour_type == null) {
    if (classKey === CLASSES[1].id_class) { // Bárbaro
      ac = 10 + dexMod + getMod(stats.CON);
    } else if (classKey === CLASSES[10].id_class) { // Monge
      ac = 10 + dexMod + getMod(stats.WIS);
    } else if (classKey === CLASSES[6].id_class && idSubclass === 'linhagem-draconica') { // Feiticeiro, Resiliência Dracônica
      ac = 13 + dexMod;
    } else {
      ac = 10 + dexMod;
    }
  } else if (armor.armour_type === 'Armadura Leve') {
    ac = (armor.armour_class_base ?? 10) + dexMod;
  } else if (armor.armour_type === 'Armadura Média') {
    const cappedDex = Math.min(dexMod, armor.max_dexterity_bonus ?? 2);
    ac = (armor.armour_class_base ?? 10) + cappedDex;
  } else {
    ac = armor.armour_class_base ?? 10;
  }

  // Estilo de Combate "Defesa" (Guerreiro): +1 CA enquanto estiver usando armadura.
  if (armor?.armour_type != null && fightingStyle === 'Defesa') ac += 1;

  return hasShield ? ac + 2 : ac;
}

/** Resiliência Dracônica (Feiticeiro, Linhagem Dracônica): +1 PV máximo por nível, desde o nível 1. */
export function calcDraconicResilienceHpBonus(idSubclass: string | null | undefined): number {
  return idSubclass === 'linhagem-draconica' ? 1 : 0;
}

export function calcMaxHP(hitDie: number, level: number, conMod: number, hpBonusPerLevel = 0): number {
  const levelOneHP = hitDie + conMod + hpBonusPerLevel;
  if (level === 1) return Math.max(1, levelOneHP);
  const higherLevels = (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod + hpBonusPerLevel);
  return Math.max(1, levelOneHP + higherLevels);
}

/**
 * HP ganho ao subir UM nível com o dado rolado (em vez da média fixa de calcMaxHP) — usado só
 * pelo fluxo de level-up. `conMod` é o modificador de Constituição do personagem no momento do
 * level-up (não retroage a níveis anteriores).
 */
export function calcRolledLevelUpHp(hitDieRoll: number, conMod: number, hpBonusPerLevel = 0): number {
  return Math.max(1, hitDieRoll + conMod + hpBonusPerLevel);
}

export function buildWeaponActions(
  weapons: WeaponRow[],
  stats: FinalStats,
  profBonus: number,
  fightingStyle?: string | null,
): WeaponRow[] {

  const weaponsVerified : WeaponRow[] = weapons.map(w => {
  const props = w.properties ? w.properties.split(', ') : [];
  return {
    id_weapon: w.id_weapon,
    attack_bonus: w.attack_bonus,
    damage_modifier: w.damage_modifier,
    name: w.name,
    damage_die: w.damage_die,
    damage_type: w.damage_type,
    weight: w.weight,
    price_value: w.price_value,
    properties: w.properties,
    isRanged: props.some(p => p.toLowerCase().startsWith('munição'))
  };
});


  return weaponsVerified.flatMap(w => {
    const props = w.properties ? w.properties.split(', ') : [];
    const isFinesse = props.some(p => p.toLowerCase().startsWith('acuidade'));
    const isTwoHanded = props.some(p => p.toLowerCase().startsWith('duas mãos'));

    const strMod = getMod(stats.STR);
    const dexMod = getMod(stats.DEX);
    let abilityMod: number;

    if (w.isRanged) {
      abilityMod = dexMod;
    } else if (isFinesse) {
      abilityMod = Math.max(strMod, dexMod);
    } else {
      abilityMod = strMod;
    }

    w.attack_bonus = profBonus + abilityMod;
    w.damage_modifier = abilityMod;

    // Estilo de Combate (Guerreiro): Arqueria (+2 ataque à distância) e Duelo (+2 dano com uma
    // única arma corpo a corpo de uma mão só, sem outra arma empunhada — aproximação: só se
    // esse for o único item na lista de armas).
    if (fightingStyle === 'Arqueria' && w.isRanged) {
      w.attack_bonus += 2;
    }
    if (fightingStyle === 'Duelo' && !w.isRanged && !isTwoHanded && weapons.length === 1) {
      w.damage_modifier += 2;
    }

    return w;
  });
}

/** Nível 1 já está coberto por `classRule.traits`; aqui só agregamos o que foi ganho a partir do 2. */
function collectLeveledClassFeatures(classRule: ClassRule, level: number): Trait[] {
  const result: Trait[] = [];
  for (let lvl = 2; lvl <= level; lvl++) {
    const levelData = classRule.featuresByLevel?.[lvl];
    if (!levelData) continue;
    for (const feature of levelData.features) {
      result.push({name: feature.name, source: `Classe (Nível ${lvl})`, description: feature.description});
    }
  }
  return result;
}

function collectLeveledSubclassFeatures(subclassRule: SubclassRule | null, level: number): Trait[] {
  if (!subclassRule) return [];
  const result: Trait[] = [];
  for (let lvl = 1; lvl <= level; lvl++) {
    const levelData = subclassRule.featuresByLevel[lvl];
    if (!levelData) continue;
    for (const feature of levelData.features) {
      result.push({name: feature.name, source: `${subclassRule.displayName} (Nível ${lvl})`, description: feature.description});
    }
  }
  return result;
}

export function collectTraits(
  raceRule: RaceRule,
  subraceRule: ReturnType<typeof resolveSubrace>,
  classRule: ClassRule,
  bgRule: BackgroundRule,
  level: number,
  subclassRule: SubclassRule | null = null,
  fightingStyle?: string | null,
  profBonus?: number,
  stats?: FinalStats,
): Trait[] {
  const traits = [
    ...raceRule.traits,
    ...(subraceRule?.traits ?? []),
    ...classRule.traits,
    ...collectLeveledSubclassFeatures(subclassRule, level),
    ...collectLeveledClassFeatures(classRule, level),
    bgRule.feature,
  ];

  // CD de conjuração da própria classe (paladino/mago) — usada só pra preencher os textos de
  // "CD de magia"/"CD de suas magias de paladino" abaixo, não é o mesmo cálculo completo de
  // `buildSpellcasting` (que também lida com subclasse conjuradora).
  const spellSaveDc =
    profBonus != null && stats != null && classRule.spellcastingAbility
      ? 8 + profBonus + getMod(stats[classRule.spellcastingAbility])
      : null;

  return traits.map(t => {
    if (fightingStyle && t.name === 'Estilo de Combate') {
      return {...t, description: `Escolhido: ${fightingStyle}. ${t.description}`};
    }
    // CDs fixas informativas: preenche o valor calculado no lugar da fórmula genérica do texto.
    if (t.name === 'Presença Intimidante' && profBonus != null && stats != null) {
      const dc = 8 + profBonus + getMod(stats.CHA);
      return {...t, description: t.description.replace('CD 8 + bônus de proficiência + modificador de Carisma', `CD ${dc}`)};
    }
    if (t.name === 'Tranquilidade' && profBonus != null && stats != null) {
      const dc = 8 + profBonus + getMod(stats.WIS);
      return {...t, description: t.description.replace('CD 8 + modificador de Sabedoria + bônus de proficiência', `CD ${dc}`)};
    }
    if (t.name === 'Canalizar Divindade: Abjurar Inimigo' && spellSaveDc != null) {
      return {...t, description: t.description.replace('CD de suas magias de paladino', `CD ${spellSaveDc}`)};
    }
    if (t.name === 'Encantamento Hipnotizante' && spellSaveDc != null) {
      return {...t, description: t.description.replace('CD de magia', `CD ${spellSaveDc}`)};
    }
    return t;
  });
}

export type SpellcastingResult =
  | {is_spellcaster: false}
  | {
      is_spellcaster: true;
      spellcasting_ability: StatKeyEn;
      spell_save_dc: number;
      spell_attack_bonus: number;
      slots_total?: Record<string, number>;
      slots_expended?: Record<string, number>;
      spells_known?: Record<string, string[]>;
      prepares_spells: boolean;
      max_prepared_spells?: number;
    };

/** Conjuração concedida por uma subclasse (ex: Cavaleiro Arcano) em vez da classe base. */
export interface SubclassCastingOverride {
  ability: StatKeyEn;
  slotsTable: Record<number, Record<string, number>>;
}

export function buildSpellcasting(
  classRule: ClassRule,
  classKey: number,
  level: number,
  spells: Spell[],
  stats: FinalStats,
  profBonus: number,
  expendedSlots: Record<string, number> = {},
  subclassCasting?: SubclassCastingOverride,
): SpellcastingResult {
  if (!subclassCasting && (!classRule.isSpellcaster || !classRule.spellcastingAbility)) {
    return {is_spellcaster: false};
  }

  const ability = subclassCasting?.ability ?? classRule.spellcastingAbility!;
  const abilityMod = getMod(stats[ability]);
  const spellSaveDC = 8 + profBonus + abilityMod;
  const spellAttackBonus = profBonus + abilityMod;

  const levelSlots = subclassCasting
    ? (subclassCasting.slotsTable[level] ?? {})
    : (SPELL_SLOTS[classKey]?.[level] ?? (classRule.spellSlotsLevel1 > 0 ? {level_1: classRule.spellSlotsLevel1} : {}));
  const slots = Object.fromEntries(
    Object.entries(levelSlots).filter(([, v]) => (v as number) > 0),
  );

  const cantrips = spells.filter(s => s.spellLevel === 0).map(s => s.name);
  const leveledSpellsByCircle: Record<string, string[]> = {};
  for (const spell of spells) {
    if (spell.spellLevel <= 0) continue;
    const key = `level_${spell.spellLevel}`;
    (leveledSpellsByCircle[key] ??= []).push(spell.name);
  }

  return {
    is_spellcaster: true,
    spellcasting_ability: ability,
    spell_save_dc: spellSaveDC,
    spell_attack_bonus: spellAttackBonus,
    slots_total: Object.keys(slots).length > 0 ? slots : undefined,
    slots_expended: Object.keys(slots).length > 0
      ? Object.fromEntries(Object.keys(slots).map(k => [k, expendedSlots[k] ?? 0]))
      : undefined,
    spells_known:
      spells.length > 0
        ? {cantrips, ...leveledSpellsByCircle}
        : undefined,
    prepares_spells: subclassCasting ? false : classRule.preparesSpells,
    max_prepared_spells: !subclassCasting && classRule.preparesSpells ? Math.max(1, abilityMod + level) : undefined,
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
  chosenSkills: Skill[],
  bgRule: BackgroundRule,
  raceRule: RaceRule,
): string[] {
  const normalized = chosenSkills.map(s => normalizeSkill(s.name));
  return [...new Set([...normalized, ...bgRule.skills, ...(raceRule.skillProficiencies ?? [])])];
}
