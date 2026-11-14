/* eslint-disable @typescript-eslint/naming-convention */
import {FinalStats, StatKeyEn} from '../../models/character-sheet-types';
import {getMod, resolveRace, resolveSubrace} from './calculator';
import {SaveContext} from '../../models/character-options-types';
import {WildShapeState} from './wild-shape';

/**
 * Traços que mexem no ataque com arma (fase 2 de `docs/dungeon-companion/conceitos/tracos-mecanicos.md`):
 * crítico, somas no acerto, bônus de ataque, ataque poderoso e ataque desarmado do Monge — já com
 * os números do personagem, pro modal de rolagem usar.
 */

/** Efeitos ligados pelo "USAR" e guardados no personagem até acabar (decisão do usuário). */
export const ACTIVATABLE_EFFECTS = ['Fúria', 'Arma Sagrada'] as const;
export type ActivatableEffect = (typeof ACTIVATABLE_EFFECTS)[number];

/** Habilidade de classe que liga um efeito ativo. */
export const ABILITY_ACTIVATES: Record<string, ActivatableEffect> = {
  Fúria: 'Fúria',
  'Canalizar Divindade: Arma Sagrada': 'Arma Sagrada',
};

/** Somas limitadas a 1×/turno — travadas pela vez do combate (decisão do usuário). */
export const ONCE_PER_TURN_RIDERS = [
  'Ataque Furtivo',
  'Golpe Divino',
  'Matador de Inimigos',
] as const;

export interface ActiveEffects {
  active: string[];
  /** Soma 1×/turno → chave da vez em que foi usada ("<combate>:<rodada>:<participante>"). */
  turn_uses: Record<string, string>;
  /** Inspiração Bárdica recebida e ainda não usada (dado e quem deu). */
  bardic_inspiration?: {sides: number; from: string} | null;
  /** Druida transformado (Forma Selvagem): sobrevive ao fim do combate, acaba no descanso longo. */
  wild_shape?: WildShapeState | null;
  /** Arma Mágica / Arma Elemental lançada: bônus já calculado pelo círculo (concentração, uma por
   *  vez — lançar outra substitui). Acaba no fim do combate, no descanso longo ou no "Encerrar". */
  spell_weapon?: SpellWeaponEffect | null;
  /** Bênção recebida: +1d4 em toda jogada de ataque e resistência até acabar. */
  bless?: SpellBoon | null;
  /** Orientação recebida: +1d4 em um teste de habilidade (gasta ao usar). */
  guidance?: SpellBoon | null;
  /** Resistência (truque) recebida: +1d4 em um teste de resistência (gasta ao usar). */
  resistance?: SpellBoon | null;
  /** Armadura Arcana: CA base 13 + DES sem armadura (8 h: sobrevive ao fim do combate). */
  mage_armor?: SpellBoon | null;
  /** Escudo da Fé: +2 na CA. */
  shield_of_faith?: SpellBoon | null;
  /** Escudo Arcano (reação, em si): +5 na CA até o começo do próximo turno de quem lançou. */
  shield?: SpellBoon | null;
  /** Pele de Árvore: CA nunca menor que 16. */
  barkskin?: SpellBoon | null;
  /** Velocidade: +2 na CA e vantagem em resistência de Destreza. */
  haste?: SpellBoon | null;
}

/** Quem lançou a magia de apoio (aparece pro alvo no modal). */
export interface SpellBoon {
  from: string;
}

export type SpellBoonKey =
  | 'bless'
  | 'guidance'
  | 'resistance'
  | 'mage_armor'
  | 'shield_of_faith'
  | 'shield'
  | 'barkskin'
  | 'haste';

export const SPELL_BOON_KEYS: readonly SpellBoonKey[] = [
  'bless',
  'guidance',
  'resistance',
  'mage_armor',
  'shield_of_faith',
  'shield',
  'barkskin',
  'haste',
];

/**
 * Magias de apoio lançadas em criaturas (`docs/dungeon-companion/referencias/magias.txt`): 1d4
 * (Bênção, Orientação, Resistência) ou CA (Armadura Arcana, Escudo da Fé, Escudo Arcano, Pele de
 * Árvore, Velocidade). Ficam guardadas no personagem de cada alvo, como a Inspiração Bárdica, e
 * acabam no fim do combate (menos a Armadura Arcana, de 8 h), no descanso longo, no "Encerrar" ou
 * (Orientação/Resistência) ao usar; Escudo Arcano acaba no próximo turno de quem lançou.
 * `extraTargetsPerSlot`: Bênção ganha 1 alvo por círculo acima do 1º. `selfOnly`: Escudo Arcano.
 */
export const SPELL_BOONS: Record<
  number,
  {
    key: SpellBoonKey;
    name: string;
    level: number;
    targets: number;
    extraTargetsPerSlot?: number;
    selfOnly?: boolean;
  }
> = {
  42: {
    key: 'bless',
    name: 'Bênção',
    level: 1,
    targets: 3,
    extraTargetsPerSlot: 1,
  },
  247: {key: 'guidance', name: 'Orientação', level: 0, targets: 1},
  305: {key: 'resistance', name: 'Resistência', level: 0, targets: 1},
  25: {key: 'mage_armor', name: 'Armadura Arcana', level: 1, targets: 1},
  146: {key: 'shield_of_faith', name: 'Escudo da Fé', level: 1, targets: 1},
  145: {
    key: 'shield',
    name: 'Escudo Arcano',
    level: 1,
    targets: 1,
    selfOnly: true,
  },
  261: {key: 'barkskin', name: 'Pele de Árvore', level: 2, targets: 1},
  351: {key: 'haste', name: 'Velocidade', level: 3, targets: 1},
};

/**
 * CA com as magias ativas: Armadura Arcana troca a base por 13 + DES (sem armadura, fica a maior;
 * não vale em Forma Selvagem), Escudo da Fé +2, Velocidade +2, Escudo Arcano +5 e Pele de Árvore
 * garante no mínimo 16.
 */
export function applySpellArmorClass(
  ac: number,
  effects: ActiveEffects | null | undefined,
  ctx: {
    wearingArmour: boolean;
    hasShield: boolean;
    dexMod: number;
    wildShape: boolean;
  },
): number {
  if (!effects) return ac;
  let total = ac;
  if (effects.mage_armor && !ctx.wearingArmour && !ctx.wildShape)
    total = Math.max(total, 13 + ctx.dexMod + (ctx.hasShield ? 2 : 0));
  if (effects.shield_of_faith) total += 2;
  if (effects.haste) total += 2;
  if (effects.shield) total += 5;
  if (effects.barkskin) total = Math.max(total, 16);
  return total;
}

/** Quantos alvos a magia atinge no círculo (`null` se não é dessas ou o círculo não serve). */
export function spellBoonMaxTargets(
  idSpell: number,
  slotLevel: number,
): number | null {
  const boon = SPELL_BOONS[idSpell];
  if (!boon || !Number.isInteger(slotLevel)) return null;
  if (boon.level === 0) return slotLevel === 0 ? boon.targets : null;
  if (slotLevel < boon.level || slotLevel > 9) return null;
  return (
    boon.targets + (boon.extraTargetsPerSlot ?? 0) * (slotLevel - boon.level)
  );
}

export interface SpellWeaponEffect {
  id_spell: number;
  name: string;
  slot_level: number;
  /** Somado na jogada de ataque com arma. */
  attack_bonus: number;
  /** Somado ao dano da arma (Arma Mágica). */
  damage_bonus: number;
  /** Dados extras no acerto (Arma Elemental), do tipo do elemento escolhido. */
  dice: {count: number; sides: number} | null;
  damage_type: string | null;
}

/** Elementos da Arma Elemental, como o resto do sistema escreve os tipos de dano. */
export const ELEMENTAL_WEAPON_TYPES = [
  'ácido',
  'elétrico',
  'frio',
  'fogo',
  'trovejante',
] as const;

/**
 * Magias que encantam a arma do conjurador (`docs/dungeon-companion/referencias/magias.txt`).
 * Simplificação: vale pra todas as armas de quem lançou (no livro, uma arma tocada — que pode ser
 * de um aliado).
 */
export const SPELL_WEAPON_SPELLS: Record<
  number,
  {name: string; level: number}
> = {
  24: {name: 'Arma Mágica', level: 2},
  22: {name: 'Arma Elemental', level: 3},
};

/**
 * Efeito no círculo do espaço gasto. Arma Mágica: +1 no ataque e no dano (+2 no 4º, +3 no 6º).
 * Arma Elemental: +1 no ataque e 1d4 do elemento (+2/2d4 no 5º e 6º, +3/3d4 no 7º+).
 * `null` se a magia não é dessas, o círculo é menor que o da magia ou o elemento é inválido.
 */
export function buildSpellWeaponEffect(
  idSpell: number,
  slotLevel: number,
  element?: string | null,
): SpellWeaponEffect | null {
  const spell = SPELL_WEAPON_SPELLS[idSpell];
  if (
    !spell ||
    !Number.isInteger(slotLevel) ||
    slotLevel < spell.level ||
    slotLevel > 9
  )
    return null;
  const base = {id_spell: idSpell, name: spell.name, slot_level: slotLevel};
  if (idSpell === 24) {
    const bonus = slotLevel >= 6 ? 3 : slotLevel >= 4 ? 2 : 1;
    return {
      ...base,
      attack_bonus: bonus,
      damage_bonus: bonus,
      dice: null,
      damage_type: null,
    };
  }
  if (
    !element ||
    !(ELEMENTAL_WEAPON_TYPES as readonly string[]).includes(element)
  )
    return null;
  const step = slotLevel >= 7 ? 3 : slotLevel >= 5 ? 2 : 1;
  return {
    ...base,
    name: `${spell.name} (${element})`,
    attack_bonus: step,
    damage_bonus: 0,
    dice: {count: step, sides: 4},
    damage_type: element,
  };
}

/** Dado de Inspiração Bárdica pelo nível do bardo: d6, d8 (5), d10 (10), d12 (15). */
export function bardicInspirationSides(level: number): number {
  if (level >= 15) return 12;
  if (level >= 10) return 10;
  if (level >= 5) return 8;
  return 6;
}

export type {SaveContext};
export const SAVE_CONTEXTS: readonly SaveContext[] = [
  'poison',
  'charm',
  'fear',
  'magic',
  'visible',
];

/**
 * Vantagem num d20. Com `against`, só vale quando a rolagem é contra isso: se quem pede sabe o
 * contexto, a vantagem entra sozinha; sem contexto, vira lembrete. `against: null` vale sempre
 * (Fúria nos testes de Força).
 */
export interface D20Reminder {
  applies: 'save' | 'check';
  /** Atributos em que vale; `null` = qualquer um. */
  abilities: StatKeyEn[] | null;
  against: SaveContext | null;
  text: string;
}

/** Defesas de quem recebe dano (usadas ao "aplicar no alvo" na sessão). */
export interface DamageDefenses {
  /** Tipos de dano com resistência (minúsculo, sem variação: "fogo", "veneno", "contundente"…). */
  resistances: string[];
  /** Ladino nv5: reação pra receber metade do dano de um ataque. */
  uncanny_dodge: boolean;
  /** Ladino/Monge nv7: resistência de DES de metade → nada se passar, metade se falhar. */
  evasion: boolean;
}

/**
 * Quantos ataques a ação de Atacar dá (Ataque Extra): o traço de maior número entre os da ficha.
 * "Ataque Extra" = 2, "Ataque Extra (2)" = 3, "Ataque Extra (3)" = 4.
 */
export function attacksPerAction(traits: {name: string}[]): number {
  let attacks = 1;
  for (const {name} of traits) {
    const match = name.match(/^Ataque Extra(?: \((\d)\))?$/);
    if (match) attacks = Math.max(attacks, match[1] ? Number(match[1]) + 1 : 2);
  }
  return attacks;
}

/** Alcance da visão no escuro (metros) pelos traços da raça e da sub-raça; `null` se não tem. */
export function darkvisionFor(ctx: {
  idRace: number;
  subrace: string | null;
}): number | null {
  const traits = [
    ...(resolveRace(ctx.idRace)?.traits ?? []),
    ...(resolveSubrace(ctx.subrace ?? undefined)?.traits ?? []),
  ];
  let meters: number | null = null;
  for (const trait of traits) {
    if (!trait.name.startsWith('Visão no Escuro')) continue;
    const match = trait.description.match(/(\d+)\s*metros/);
    if (match) meters = Math.max(meters ?? 0, Number(match[1]));
  }
  return meters;
}

export function damageDefensesFor(ctx: {
  idRace: number;
  subrace: string | null;
  idClass: number;
  level: number;
  activeEffects: ActiveEffects | null;
}): DamageDefenses {
  const resistances = new Set<string>();
  if (ctx.idRace === 1 || ctx.subrace === 'halfling-robusto')
    resistances.add('veneno');
  // Tiefling (Resistência Infernal) e Draconato (ancestral fixo de fogo neste app).
  if (ctx.idRace === 8 || ctx.idRace === 4) resistances.add('fogo');
  if (ctx.idClass === 1 && ctx.activeEffects?.active.includes('Fúria')) {
    for (const t of ['contundente', 'cortante', 'perfurante'])
      resistances.add(t);
  }
  return {
    resistances: [...resistances],
    uncanny_dodge: ctx.idClass === 8 && ctx.level >= 5,
    evasion: (ctx.idClass === 8 || ctx.idClass === 10) && ctx.level >= 7,
  };
}

function d20RemindersFor(ctx: {
  idRace: number;
  subrace: string | null;
  idClass: number;
  level: number;
  active: string[];
  haste?: boolean;
}): D20Reminder[] {
  const reminders: D20Reminder[] = [];
  if (ctx.idRace === 1) {
    reminders.push({
      applies: 'save',
      abilities: null,
      against: 'poison',
      text: 'Vantagem contra veneno (Resistência Anã)',
    });
  }
  if (ctx.subrace === 'halfling-robusto') {
    reminders.push({
      applies: 'save',
      abilities: null,
      against: 'poison',
      text: 'Vantagem contra veneno (Resistência Robusto)',
    });
  }
  if (ctx.idRace === 2 || ctx.idRace === 6) {
    reminders.push({
      applies: 'save',
      abilities: null,
      against: 'charm',
      text: 'Vantagem contra ser enfeitiçado (Ancestralidade Feérica)',
    });
  }
  if (ctx.idRace === 3) {
    reminders.push({
      applies: 'save',
      abilities: null,
      against: 'fear',
      text: 'Vantagem contra medo (Bravura)',
    });
  }
  if (ctx.idRace === 5) {
    reminders.push({
      applies: 'save',
      abilities: ['INT', 'WIS', 'CHA'],
      against: 'magic',
      text: 'Vantagem contra magia (Esperteza Gnômica)',
    });
  }
  if (ctx.idClass === 1 && ctx.level >= 2) {
    reminders.push({
      applies: 'save',
      abilities: ['DEX'],
      against: 'visible',
      text: 'Vantagem contra efeitos que você vê, como armadilhas e magias (Sentido de Perigo)',
    });
  }
  if (ctx.active.includes('Fúria')) {
    reminders.push({
      applies: 'save',
      abilities: ['STR'],
      against: null,
      text: 'Vantagem (Fúria)',
    });
    reminders.push({
      applies: 'check',
      abilities: ['STR'],
      against: null,
      text: 'Vantagem (Fúria)',
    });
  }
  if (ctx.haste) {
    reminders.push({
      applies: 'save',
      abilities: ['DEX'],
      against: null,
      text: 'Vantagem (Velocidade)',
    });
  }
  return reminders;
}

export const EMPTY_ACTIVE_EFFECTS: ActiveEffects = {active: [], turn_uses: {}};

export interface CombatRider {
  key: string;
  name: string;
  dice: {count: number; sides: number} | null;
  flat: number;
  damage_type: string;
  /** Em que ataque vale: acuidade ou à distância (Ataque Furtivo), corpo a corpo de Força
   *  (Fúria) ou qualquer ataque com arma. */
  applies: 'finesse_or_ranged' | 'melee_str' | 'weapon';
  once_per_turn: boolean;
  /** Só com esse efeito ativo (Fúria) — e aí entra sozinho, sem marcar. */
  requires_active: ActivatableEffect | null;
}

export interface CombatFeatures {
  /** Menor resultado natural do d20 que é crítico (Campeão: 19, depois 18). */
  crit_min: number;
  /** Dados da arma a mais no crítico corpo a corpo (Crítico Brutal, Ataques Selvagens). */
  melee_crit_extra_dice: number;
  riders: CombatRider[];
  /** Bônus no ataque com arma enquanto o efeito estiver ativo (Arma Sagrada: + mod. CAR). */
  attack_bonuses: {
    key: string;
    name: string;
    bonus: number;
    requires_active: ActivatableEffect;
  }[];
  /** Talentos de −5 no ataque / +10 no dano (o jogador marca antes de rolar). */
  power_attack: {name: string; applies: 'heavy_melee' | 'ranged'}[];
  /** Ataque desarmado com o dado de Artes Marciais (Monge). */
  unarmed: {
    name: string;
    attack_bonus: number;
    dice: {count: number; sides: number};
    damage_modifier: number;
  } | null;
  active_effects: ActiveEffects;
  /** Halfling (Sortudo): 1 natural no d20 pode ser rolado de novo. */
  halfling_lucky: boolean;
  /** Lembretes de vantagem nos testes de resistência/perícia. */
  d20_reminders: D20Reminder[];
  /** Ataques por ação de Atacar (Ataque Extra): 1, 2, 3 ou 4. */
  attacks_per_action: number;
  /** Ladino nv2 (Ação Ardilosa): ação bônus pra Disparar, Desengajar ou Esconder. */
  cunning_action: boolean;
  /** Ranger do Conclave da Besta (nv3): tem Companheiro Animal na mesa. */
  animal_companion: boolean;
  /** Alcance da visão no escuro, em metros; `null` se não tem. */
  darkvision_m: number | null;
  /** Druida transformado: a forma, o PV dele guardado e se as magias estão travadas. */
  wild_shape?: WildShapeView | null;
}

export interface WildShapeView extends WildShapeState {
  druid_hit_points: {current: number; max: number};
  /** Sem Magias da Besta (nv18), não lança magias transformado. */
  spells_blocked: boolean;
  hours: number;
}

const GOLPE_DIVINO_TYPE: Record<string, string> = {
  enganacao: 'veneno',
  guerra: 'da arma',
  luz: 'radiante',
  natureza: 'à escolha',
  tempestade: 'elétrico ou trovão',
  vida: 'radiante',
};

function parseDice(
  text: string | undefined,
): {count: number; sides: number} | null {
  const match = text?.match(/^(\d+)d(\d+)$/);
  return match ? {count: Number(match[1]), sides: Number(match[2])} : null;
}

export function buildCombatFeatures(ctx: {
  idClass: number;
  idSubclass: string | null;
  idRace: number;
  subrace?: string | null;
  level: number;
  stats: FinalStats;
  profBonus: number;
  /** `class_resources` da ficha (ex.: {"Ataque Furtivo": "3d6", "Dano de Fúria": "+2"}). */
  classResources: Record<string, string> | null;
  featIds: string[];
  activeEffects: ActiveEffects | null;
  /** Traços da ficha (raça, classe, subclasse) — Ataque Extra e Ação Ardilosa vêm daqui. */
  traits?: {name: string}[];
}): CombatFeatures {
  const {idClass, idSubclass, level, stats, profBonus, classResources} = ctx;
  const riders: CombatRider[] = [];

  if (idClass === 8) {
    const dice = parseDice(classResources?.['Ataque Furtivo']);
    if (dice) {
      riders.push({
        key: 'Ataque Furtivo',
        name: 'Ataque Furtivo',
        dice,
        flat: 0,
        damage_type: 'da arma',
        applies: 'finesse_or_ranged',
        once_per_turn: true,
        requires_active: null,
      });
    }
  }
  if (idClass === 1) {
    const rage = Number(
      (classResources?.['Dano de Fúria'] ?? '').replace('+', ''),
    );
    if (rage > 0) {
      riders.push({
        key: 'Fúria',
        name: 'Fúria',
        dice: null,
        flat: rage,
        damage_type: 'da arma',
        applies: 'melee_str',
        once_per_turn: false,
        requires_active: 'Fúria',
      });
    }
  }
  if (
    idClass === 4 &&
    idSubclass &&
    GOLPE_DIVINO_TYPE[idSubclass] &&
    level >= 8
  ) {
    riders.push({
      key: 'Golpe Divino',
      name: 'Golpe Divino',
      dice: {count: level >= 14 ? 2 : 1, sides: 8},
      flat: 0,
      damage_type: GOLPE_DIVINO_TYPE[idSubclass],
      applies: 'weapon',
      once_per_turn: true,
      requires_active: null,
    });
  }
  if (idClass === 12 && level >= 20) {
    riders.push({
      key: 'Matador de Inimigos',
      name: 'Matador de Inimigos',
      dice: null,
      flat: getMod(stats.WIS),
      damage_type: 'da arma',
      applies: 'weapon',
      once_per_turn: true,
      requires_active: null,
    });
  }

  const attackBonuses: CombatFeatures['attack_bonuses'] = [];
  if (idClass === 11 && idSubclass === 'devocao' && level >= 3) {
    attackBonuses.push({
      key: 'Arma Sagrada',
      name: 'Arma Sagrada',
      bonus: Math.max(1, getMod(stats.CHA)),
      requires_active: 'Arma Sagrada',
    });
  }

  const powerAttack: CombatFeatures['power_attack'] = [];
  if (ctx.featIds.includes('mestre-armas-grandes')) {
    powerAttack.push({name: 'Mestre em Armas Grandes', applies: 'heavy_melee'});
  }
  if (ctx.featIds.includes('mestre-atirador')) {
    powerAttack.push({name: 'Mestre-Atirador', applies: 'ranged'});
  }

  let unarmed: CombatFeatures['unarmed'] = null;
  const martialDie =
    idClass === 10 ? parseDice(classResources?.['Artes Marciais']) : null;
  if (martialDie) {
    const mod = Math.max(getMod(stats.STR), getMod(stats.DEX));
    unarmed = {
      name: 'Ataque Desarmado',
      attack_bonus: profBonus + mod,
      dice: martialDie,
      damage_modifier: mod,
    };
  }

  const campeao = idClass === 7 && idSubclass === 'campeao';
  return {
    crit_min: campeao && level >= 15 ? 18 : campeao && level >= 3 ? 19 : 20,
    melee_crit_extra_dice:
      (idClass === 1
        ? level >= 17
          ? 3
          : level >= 13
            ? 2
            : level >= 9
              ? 1
              : 0
        : 0) + (ctx.idRace === 7 ? 1 : 0),
    riders,
    attack_bonuses: attackBonuses,
    power_attack: powerAttack,
    unarmed,
    active_effects: ctx.activeEffects ?? EMPTY_ACTIVE_EFFECTS,
    halfling_lucky: ctx.idRace === 3,
    d20_reminders: d20RemindersFor({
      idRace: ctx.idRace,
      subrace: ctx.subrace ?? null,
      idClass,
      level,
      active: ctx.activeEffects?.active ?? [],
      haste: !!ctx.activeEffects?.haste,
    }),
    attacks_per_action: attacksPerAction(ctx.traits ?? []),
    cunning_action: (ctx.traits ?? []).some(t => t.name === 'Ação Ardilosa'),
    animal_companion: (ctx.traits ?? []).some(
      t => t.name === 'Companheiro Animal',
    ),
    darkvision_m: darkvisionFor({
      idRace: ctx.idRace,
      subrace: ctx.subrace ?? null,
    }),
  };
}
