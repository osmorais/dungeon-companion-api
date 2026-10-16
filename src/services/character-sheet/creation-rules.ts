/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn} from '../../models/character-sheet-types';
import {
  ClassRule,
  FULL_LIST_PREPARED_CASTER_CLASS_IDS,
  KNOWN_CASTER_CLASS_IDS,
  SubraceRule,
  WIZARD_CLASS_ID,
  getWizardSpellbookSize,
} from './rules';
import {CLASS_SPELL_LISTS} from './class-spell-lists';

/**
 * Regras que a criação de personagem (nível 1) confere no backend — antes só o wizard limitava
 * perícias, magias e armadura, e um payload montado à mão passava. Tabelas espelhadas do web
 * (`constants/skill-rules.ts`, `constants/racial-cantrips.ts`, `constants/armour-rules.ts`) —
 * mudar um lado exige mudar o outro e os testes dos dois.
 */

/** Perícias que a classe escolhe no nível 1 (chaves de `normalizeSkill`; `from` vazio = qualquer). */
export const CLASS_SKILL_CHOICES: Record<
  number,
  {count: number; from: string[]}
> = {
  1: {
    count: 2,
    from: [
      'athletics',
      'animal_handling',
      'intimidation',
      'nature',
      'perception',
      'survival',
    ],
  },
  2: {count: 3, from: []},
  3: {
    count: 2,
    from: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
  },
  4: {
    count: 2,
    from: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
  },
  5: {
    count: 2,
    from: [
      'arcana',
      'animal_handling',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
  },
  6: {
    count: 2,
    from: [
      'arcana',
      'deception',
      'insight',
      'intimidation',
      'persuasion',
      'religion',
    ],
  },
  7: {
    count: 2,
    from: [
      'acrobatics',
      'animal_handling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'survival',
    ],
  },
  8: {
    count: 4,
    from: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'performance',
      'persuasion',
      'sleight_of_hand',
      'stealth',
    ],
  },
  9: {
    count: 2,
    from: [
      'arcana',
      'history',
      'insight',
      'investigation',
      'medicine',
      'religion',
    ],
  },
  10: {
    count: 2,
    from: [
      'acrobatics',
      'athletics',
      'history',
      'insight',
      'religion',
      'stealth',
    ],
  },
  11: {
    count: 2,
    from: [
      'athletics',
      'insight',
      'intimidation',
      'medicine',
      'persuasion',
      'religion',
    ],
  },
  12: {
    count: 3,
    from: [
      'animal_handling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
  },
};

/** Perícias livres extras da raça (Meio-Elfo: Habilidade Versátil, 2 quaisquer). */
export const RACE_EXTRA_SKILL_CHOICES: Record<number, number> = {6: 2};

/** Aumento de atributo à escolha da raça (Meio-Elfo: +1 em dois atributos diferentes, menos CAR). */
export const RACE_ABILITY_BONUS_CHOICE: Record<
  number,
  {count: number; amount: number; exclude: StatKeyEn[]}
> = {
  6: {count: 2, amount: 1, exclude: ['CHA']},
};

/**
 * Truque racial que entra em `choices.spells` além da cota da classe: fixo (Tiefling:
 * Taumaturgia; Gnomo da Floresta: Ilusão Menor) ou qualquer truque de mago (Alto Elfo). Espelho de
 * `racial-cantrips.ts` do web.
 */
export type RacialCantrip = {fixedSpellId?: number; spellListClassId?: number};
export const RACE_FREE_CANTRIPS: Record<number, RacialCantrip> = {
  8: {fixedSpellId: 333},
};
export const SUBRACE_FREE_CANTRIPS: Record<string, RacialCantrip> = {
  'alto-elfo': {spellListClassId: WIZARD_CLASS_ID},
  'gnomo-das-florestas': {fixedSpellId: 179},
};

/** Domínios do Clérigo (escolhidos no nível 1) com "Proficiência Adicional: armaduras pesadas". */
export const SUBCLASS_HEAVY_ARMOR: ReadonlySet<string> = new Set([
  'guerra',
  'natureza',
  'tempestade',
  'vida',
]);

const STAT_KEYS: StatKeyEn[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Valida e devolve os atributos escolhidos pro bônus da raça (`[]` se a raça não escolhe). */
export function validateAbilityBonusChoice(
  idRace: number,
  chosen: StatKeyEn[] | undefined,
): StatKeyEn[] {
  const rule = RACE_ABILITY_BONUS_CHOICE[idRace];
  const list = chosen ?? [];
  if (!rule) {
    if (list.length)
      throw new Error('Esta raça não escolhe aumento de atributo');
    return [];
  }
  if (list.length !== rule.count || new Set(list).size !== list.length) {
    throw new Error(
      `Escolha ${rule.count} atributos diferentes para o aumento racial`,
    );
  }
  for (const stat of list) {
    if (!STAT_KEYS.includes(stat) || rule.exclude.includes(stat)) {
      throw new Error(`Atributo inválido para o aumento racial: ${stat}`);
    }
  }
  return list;
}

/**
 * Perícias escolhidas (já sem as concedidas pelo antecedente/raça): no máximo a cota da classe
 * + a da raça, sem repetir, e só as da raça podem ficar fora da lista da classe.
 */
export function validateSkillChoices(
  idClass: number,
  idRace: number,
  chosenKeys: string[],
): void {
  const classRule = CLASS_SKILL_CHOICES[idClass] ?? {count: 0, from: []};
  const raceExtra = RACE_EXTRA_SKILL_CHOICES[idRace] ?? 0;
  if (new Set(chosenKeys).size !== chosenKeys.length)
    throw new Error('Perícia repetida na escolha');
  if (chosenKeys.length > classRule.count + raceExtra) {
    throw new Error(
      `Perícias demais: a escolha é de ${classRule.count + raceExtra}`,
    );
  }
  if (classRule.from.length) {
    const outside = chosenKeys.filter(k => !classRule.from.includes(k)).length;
    if (outside > raceExtra) throw new Error('Perícia fora da lista da classe');
  }
}

export type CreationSpellLimits = {
  cantrips: number;
  leveled: number;
  maxCircle: number;
  /** Lista de magias da classe (vazia pra quem não conjura). */
  classList: readonly number[];
  racial: RacialCantrip | null;
};

/** Quantos truques e magias com círculo o personagem escolhe no nível 1, e de quais listas. */
export function creationSpellLimits(
  classRule: ClassRule,
  idRace: number,
  subrace: string | null,
): CreationSpellLimits {
  const resources = classRule.featuresByLevel?.[1]?.resources;
  const count = (key: string) => {
    const n = parseInt(resources?.[key] ?? '', 10);
    return Number.isFinite(n) ? n : 0;
  };
  const racial =
    RACE_FREE_CANTRIPS[idRace] ??
    (subrace ? SUBRACE_FREE_CANTRIPS[subrace] : undefined) ??
    null;
  let leveled = 0;
  if (KNOWN_CASTER_CLASS_IDS.has(classRule.id_class))
    leveled = count('Magias Conhecidas');
  else if (classRule.id_class === WIZARD_CLASS_ID)
    leveled = getWizardSpellbookSize(1);
  else if (FULL_LIST_PREPARED_CASTER_CLASS_IDS.has(classRule.id_class))
    leveled = 0;
  return {
    cantrips:
      (classRule.isSpellcaster ? count('Truques Conhecidos') : 0) +
      (racial ? 1 : 0),
    leveled,
    maxCircle: 1,
    classList: classRule.isSpellcaster
      ? (CLASS_SPELL_LISTS[classRule.id_class] ?? [])
      : [],
    racial,
  };
}

export function validateSpellChoices(
  limits: CreationSpellLimits,
  spells: {id_spell: number; spell_level: number | null}[],
  submittedIds: number[],
): void {
  if (new Set(submittedIds).size !== submittedIds.length)
    throw new Error('Magia repetida na escolha');
  const known = new Map(spells.map(s => [s.id_spell, s.spell_level ?? 0]));
  for (const id of submittedIds) {
    if (!known.has(id)) throw new Error(`Magia inexistente: ${id}`);
    if (known.get(id)! > limits.maxCircle)
      throw new Error('Magia acima do círculo permitido no nível 1');
  }
  // Fora da lista da classe só cabe o truque racial (um).
  const classList = new Set(limits.classList);
  const isRacialOption = (id: number) =>
    !!limits.racial &&
    known.get(id) === 0 &&
    (limits.racial.fixedSpellId === id ||
      (limits.racial.spellListClassId !== undefined &&
        (CLASS_SPELL_LISTS[limits.racial.spellListClassId] ?? []).includes(
          id,
        )));
  const offList = submittedIds.filter(id => !classList.has(id));
  if (offList.some(id => !isRacialOption(id)) || offList.length > 1) {
    throw new Error('Magia fora da lista da classe');
  }
  const cantrips = submittedIds.filter(id => known.get(id) === 0).length;
  if (cantrips > limits.cantrips)
    throw new Error(`Truques demais: o limite é ${limits.cantrips}`);
  if (submittedIds.length - cantrips > limits.leveled) {
    throw new Error(`Magias demais: o limite é ${limits.leveled}`);
  }
}

/** Categorias de armadura ('Leve' | 'Média' | 'Pesada') e escudo que o personagem sabe usar. */
export function armorProficiency(
  classRule: ClassRule,
  subraceRule: SubraceRule | null,
  idSubclass: string | null | undefined,
): {types: Set<string>; shield: boolean} {
  const types = new Set<string>();
  let shield = false;
  for (const prof of [
    ...classRule.armorProficiencies,
    ...(subraceRule?.armorProficiencies ?? []),
  ]) {
    if (prof.startsWith('Todas'))
      ['Leve', 'Média', 'Pesada'].forEach(t => types.add(t));
    else if (prof.startsWith('Escudo')) shield = true;
    else if (prof.startsWith('Leve')) types.add('Leve');
    else if (prof.startsWith('Média')) types.add('Média');
    else if (prof.startsWith('Pesada')) types.add('Pesada');
  }
  if (idSubclass && SUBCLASS_HEAVY_ARMOR.has(idSubclass)) types.add('Pesada');
  return {types, shield};
}

/** `armour_type` do banco ('Armadura Leve'...) precisa estar entre as proficiências; escudo idem. */
export function validateArmourChoice(
  prof: {types: Set<string>; shield: boolean},
  armourType: string | null | undefined,
  hasShield: boolean,
): void {
  if (armourType) {
    const category = armourType.replace(/^Armadura\s+/i, '');
    if (!prof.types.has(category))
      throw new Error(`Sem proficiência em ${armourType}`);
  }
  if (hasShield && !prof.shield) throw new Error('Sem proficiência em escudo');
}
