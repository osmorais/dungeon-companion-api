/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Usos das ações de um monstro na mesa (1.11.0, fases 2 e 3): recarga, usos por dia/descanso,
 * ações lendárias, reação e covil. Gravado em `monster_session.action_state` (JSONB); a ficha
 * (`data_snapshot`, formato do bestiário) diz o limite de cada habilidade. Funções puras: o
 * service carrega, aplica e grava.
 */

export interface MonsterActionState {
  /** Usos gastos por habilidade com limite por dia ou por descanso (chave: nome da habilidade). */
  uses: Record<string, number>;
  /** Habilidades de recarga gastas — indisponíveis até o d6 do início do turno recarregar. */
  recharge: string[];
  /** Ações lendárias gastas desde o último turno do monstro. */
  legendary_used: number;
  /** Reação já usada desde o último turno do monstro. */
  reaction_used: boolean;
  /** O monstro está no covil: na contagem 20 de cada rodada o mestre recebe o lembrete. */
  in_lair: boolean;
}

export type MonsterActionOp =
  | {op: 'use'; ability: string}
  | {op: 'restore'; ability: string}
  | {op: 'legendary'; ability: string}
  | {op: 'reaction'}
  | {op: 'lair'; on: boolean}
  /** Descanso: zera usos por dia/descanso, recargas, lendárias e reação. */
  | {op: 'rest'};

type Usage =
  | {type: 'recharge'; min: number}
  | {type: 'per_day'; times: number}
  | {type: 'rest'; rest: string}
  | {type: 'cost'; actions: number}
  | {type: 'form'; desc: string};

interface Ability {
  name?: unknown;
  usage?: Usage | null;
}

const GROUPS = [
  'special_abilities',
  'actions',
  'reactions',
  'legendary_actions',
] as const;

export function emptyActionState(): MonsterActionState {
  return {
    uses: {},
    recharge: [],
    legendary_used: 0,
    reaction_used: false,
    in_lair: false,
  };
}

/** Estado gravado (pode ser null ou de versão anterior) com todos os campos. */
export function normalizeActionState(raw: unknown): MonsterActionState {
  const base = emptyActionState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<MonsterActionState>;
  return {
    uses:
      r.uses && typeof r.uses === 'object'
        ? Object.fromEntries(
            Object.entries(r.uses).filter(
              ([, v]) => Number.isInteger(v) && v > 0,
            ),
          )
        : {},
    recharge: Array.isArray(r.recharge)
      ? r.recharge.filter(x => typeof x === 'string')
      : [],
    legendary_used: Number.isInteger(r.legendary_used)
      ? Math.max(0, r.legendary_used!)
      : 0,
    reaction_used: r.reaction_used === true,
    in_lair: r.in_lair === true,
  };
}

function findAbility(
  block: Record<string, unknown>,
  name: string,
  groups: readonly (typeof GROUPS)[number][] = GROUPS,
): Ability | null {
  for (const g of groups) {
    const list = block[g];
    if (!Array.isArray(list)) continue;
    const found = (list as Ability[]).find(a => a?.name === name);
    if (found) return found;
  }
  return null;
}

/** Limite de usos (por dia ou por descanso) — 1 pro "por descanso". */
function usesLimit(usage: Usage): number | null {
  if (usage.type === 'per_day') return usage.times;
  if (usage.type === 'rest') return 1;
  return null;
}

/** Aplica a operação; `error` (sem mudar nada) quando não pode — o service responde 422. */
export function applyActionOp(
  block: Record<string, unknown>,
  current: MonsterActionState,
  op: MonsterActionOp,
): {state: MonsterActionState} | {error: string} {
  const state: MonsterActionState = {
    ...current,
    uses: {...current.uses},
    recharge: [...current.recharge],
  };
  switch (op.op) {
    case 'use': {
      const ability = findAbility(block, op.ability);
      if (!ability)
        return {error: `Habilidade "${op.ability}" não está na ficha`};
      const usage = ability.usage;
      if (usage?.type === 'recharge') {
        if (state.recharge.includes(op.ability))
          return {error: `${op.ability} ainda não recarregou`};
        state.recharge.push(op.ability);
        return {state};
      }
      const limit = usage ? usesLimit(usage) : null;
      if (limit === null) return {error: `${op.ability} não tem limite de uso`};
      const used = state.uses[op.ability] ?? 0;
      if (used >= limit) return {error: `${op.ability} já foi usada ${limit}x`};
      state.uses[op.ability] = used + 1;
      return {state};
    }
    case 'restore': {
      delete state.uses[op.ability];
      state.recharge = state.recharge.filter(a => a !== op.ability);
      return {state};
    }
    case 'legendary': {
      const max = legendaryCount(block);
      if (!max) return {error: 'Este monstro não tem ações lendárias'};
      const ability = findAbility(block, op.ability, ['legendary_actions']);
      if (!ability)
        return {error: `Ação lendária "${op.ability}" não está na ficha`};
      const cost = ability.usage?.type === 'cost' ? ability.usage.actions : 1;
      if (state.legendary_used + cost > max)
        return {
          error: `Restam ${max - state.legendary_used} ações lendárias nesta rodada`,
        };
      state.legendary_used += cost;
      return {state};
    }
    case 'reaction': {
      if (state.reaction_used)
        return {error: 'A reação já foi usada nesta rodada'};
      state.reaction_used = true;
      return {state};
    }
    case 'lair':
      state.in_lair = op.on === true;
      return {state};
    case 'rest':
      return {state: {...emptyActionState(), in_lair: state.in_lair}};
  }
}

export function legendaryCount(block: Record<string, unknown>): number {
  const n = block.legendary_count;
  const has =
    Array.isArray(block.legendary_actions) &&
    block.legendary_actions.length > 0;
  return has
    ? Number.isInteger(n) && (n as number) > 0
      ? (n as number)
      : 3
    : 0;
}

export interface RechargeRoll {
  ability: string;
  roll: number;
  min: number;
  recharged: boolean;
}

/**
 * Início do turno do monstro: rola o d6 de cada recarga gasta (recarrega com `min` ou mais) e
 * devolve as ações lendárias e a reação. `rollD6` injetável pros testes.
 */
export function startOfMonsterTurn(
  block: Record<string, unknown>,
  current: MonsterActionState,
  rollD6: () => number,
): {state: MonsterActionState; rolls: RechargeRoll[]} {
  const rolls: RechargeRoll[] = [];
  const stillSpent: string[] = [];
  for (const name of current.recharge) {
    const usage = findAbility(block, name)?.usage;
    if (usage?.type !== 'recharge') continue; // ficha mudou: some da lista
    const roll = rollD6();
    const recharged = roll >= usage.min;
    rolls.push({ability: name, roll, min: usage.min, recharged});
    if (!recharged) stillSpent.push(name);
  }
  return {
    state: {
      ...current,
      recharge: stillSpent,
      legendary_used: 0,
      reaction_used: false,
    },
    rolls,
  };
}

/** Valida o corpo da requisição (o controller aceita objeto livre). */
export function parseActionOp(body: unknown): MonsterActionOp | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const ability =
    typeof b.ability === 'string' && b.ability.trim() ? b.ability : null;
  switch (b.op) {
    case 'use':
    case 'restore':
    case 'legendary':
      return ability ? {op: b.op, ability} : null;
    case 'reaction':
    case 'rest':
      return {op: b.op};
    case 'lair':
      return typeof b.on === 'boolean' ? {op: 'lair', on: b.on} : null;
    default:
      return null;
  }
}
