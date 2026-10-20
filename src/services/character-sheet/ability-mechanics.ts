/* eslint-disable @typescript-eslint/naming-convention */
import {SpellRoll} from '../../models/character-options-types';
import {FinalStats, StatKeyEn} from '../../models/character-sheet-types';
import {getMod} from './calculator';
import {ABILITY_ACTIVATES} from './combat-features';

/**
 * O que acontece ao "USAR" uma habilidade de classe (as de `getKnownClassAbilities`), no mesmo
 * formato da rolagem das magias (`SpellRoll`), pra reaproveitar o modal de rolagem — ver
 * `docs/dungeon-companion/conceitos/tracos-mecanicos.md` (fase 1). Sem entrada aqui, o "USAR" só gasta o
 * recurso e anuncia na mesa.
 */
export interface AbilityContext {
  level: number;
  stats: FinalStats;
  profBonus: number;
  /** CD de magia da classe (Clérigo/Paladino); `null` se a classe não conjura. */
  spellSaveDc: number | null;
}

/** Além da rolagem, o que o "USAR" faz no web. */
export interface AbilityMechanicsResult {
  roll: SpellRoll | null;
  /** Cura em que o jogador escolhe quantos pontos do recurso gastar (Curar pelo Toque). */
  variable_cost: boolean;
  /** Devolve um espaço gasto desse círculo (Criar Espaço de Magia). */
  restores_slot: number | null;
  /** Liga um efeito guardado no personagem até acabar (Fúria, Arma Sagrada). */
  activates: string | null;
  /** Abre N ataques desarmados em sequência (Rajada de Golpes). */
  unarmed_attacks: number | null;
  /** Pede pra escolher um aliado da mesa (Inspiração Bárdica). */
  targets_ally: boolean;
}

type DcSource = 'spell' | 'ki' | 'con';

interface AbilityMechanics {
  kind: 'heal' | 'save';
  /** Dados no nível atual (ex.: Retomar Fôlego 1d10). Ausente = sem dado (fixo ou só CD). */
  dice?: (level: number) => {count: number; sides: number};
  /** Valor fixo somado (ex.: + nível de guerreiro; Integridade Corporal 3 × nível). */
  bonus?: (level: number) => number;
  /** Cura fixa a distribuir entre alvos (Preservar a Vida). */
  distribute?: boolean;
  save?: {
    ability: StatKeyEn;
    dc: DcSource;
    onSuccess?: 'half' | 'none' | 'full';
    effectNote?: string;
  };
  damageType?: string;
  variableCost?: boolean;
}

const ABILITIES: Record<string, AbilityMechanics> = {
  // Guerreiro
  'Retomar o Fôlego': {
    kind: 'heal',
    dice: () => ({count: 1, sides: 10}),
    bonus: level => level,
  },
  // Monge
  'Integridade Corporal': {kind: 'heal', bonus: level => 3 * level},
  'Ataque Atordoante': {kind: 'save', save: {ability: 'CON', dc: 'ki'}},
  'Palma Vibrante': {
    kind: 'save',
    dice: () => ({count: 10, sides: 10}),
    damageType: 'concussão',
    save: {
      ability: 'CON',
      dc: 'ki',
      onSuccess: 'full',
      effectNote: 'se falhar, cai a 0 PV; se passar, sofre o dano',
    },
  },
  // Draconato (raça)
  'Arma de Sopro': {
    kind: 'save',
    dice: level => ({
      count: level >= 16 ? 5 : level >= 11 ? 4 : level >= 6 ? 3 : 2,
      sides: 6,
    }),
    damageType: 'fogo',
    save: {ability: 'DEX', dc: 'con', onSuccess: 'half'},
  },
  // Paladino
  'Curar pelo Toque (1 PV)': {kind: 'heal', variableCost: true},
  'Canalizar Divindade: Expulsar os Infiéis': {
    kind: 'save',
    save: {ability: 'WIS', dc: 'spell'},
  },
  'Canalizar Divindade: Expulsar os Ímpios': {
    kind: 'save',
    save: {ability: 'WIS', dc: 'spell'},
  },
  'Canalizar Divindade: Abjurar Inimigo': {
    kind: 'save',
    save: {ability: 'WIS', dc: 'spell'},
  },
  // Clérigo
  'Canalizar Divindade: Expulsar Mortos-Vivos': {
    kind: 'save',
    save: {ability: 'WIS', dc: 'spell'},
  },
  'Canalizar Divindade: Ler Pensamentos': {
    kind: 'save',
    save: {ability: 'WIS', dc: 'spell'},
  },
  'Canalizar Divindade: Radiação do Amanhecer': {
    kind: 'save',
    dice: () => ({count: 2, sides: 10}),
    bonus: level => level,
    damageType: 'radiante',
    save: {ability: 'CON', dc: 'spell', onSuccess: 'half'},
  },
  'Canalizar Divindade: Preservar a Vida': {
    kind: 'heal',
    bonus: level => 5 * level,
    distribute: true,
  },
};

/** "Criar Espaço de Magia (3º círculo)" → 3. */
function createdSlotLevel(name: string): number | null {
  const match = name.match(/^Criar Espaço de Magia \((\d)º círculo\)$/);
  return match ? Number(match[1]) : null;
}

export function abilityMechanicsFor(
  name: string,
  ctx: AbilityContext,
): AbilityMechanicsResult {
  const restores = createdSlotLevel(name);
  const extras = {
    activates: ABILITY_ACTIVATES[name] ?? null,
    unarmed_attacks: name === 'Rajada de Golpes' ? 2 : null,
    targets_ally: name === 'Inspiração Bárdica',
  };
  const mechanics = ABILITIES[name];
  if (!mechanics)
    return {
      roll: null,
      variable_cost: false,
      restores_slot: restores,
      ...extras,
    };

  const dc = !mechanics.save
    ? null
    : mechanics.save.dc === 'ki'
      ? 8 + ctx.profBonus + getMod(ctx.stats.WIS)
      : mechanics.save.dc === 'con'
        ? 8 + ctx.profBonus + getMod(ctx.stats.CON)
        : ctx.spellSaveDc;
  const dice = mechanics.dice?.(ctx.level) ?? {count: 0, sides: 0};
  const bonus = mechanics.bonus?.(ctx.level) ?? 0;
  const hasRoll = !mechanics.variableCost && (dice.count > 0 || bonus > 0);

  const roll: SpellRoll = {
    kind: mechanics.kind,
    attack_type: null,
    attack_bonus: null,
    damage_type: mechanics.damageType ?? null,
    save_ability: mechanics.save?.ability ?? null,
    save_dc: dc,
    save_on_success: mechanics.save?.onSuccess ?? null,
    save_effect_note: mechanics.save?.effectNote ?? null,
    heal: mechanics.kind === 'heal' ? 'hp' : null,
    heal_distribute: !!mechanics.distribute,
    maximize: false,
    rider_trigger: null,
    rider_attack: null,
    instance_label: null,
    variant: null,
    by_slot: hasRoll
      ? {
          '0': {
            instances: 1,
            dice_count: dice.count,
            dice_sides: dice.sides,
            modifier: bonus,
            extra_dice: [],
          },
        }
      : {},
  };
  return {
    roll,
    variable_cost: !!mechanics.variableCost,
    restores_slot: restores,
    ...extras,
  };
}

/** Nomes com mecânica (pros testes de integridade). */
export const ABILITY_MECHANICS_NAMES: readonly string[] =
  Object.keys(ABILITIES);
