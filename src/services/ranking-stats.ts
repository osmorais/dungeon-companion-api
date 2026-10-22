/**
 * Estatísticas do ranking (1.7.0): contadores por personagem e sessão, gravados em
 * `character_session_stats` enquanto a mesa joga. Aqui ficam só as regras puras (o que conta e
 * quanto); quem grava é o `GameSessionRepository.bumpStats`.
 */
import {AdvantageState, RollType} from '../models/game-session-types';

export const RANKING_STATS = [
  'damage_dealt',
  'damage_taken',
  'healing_done',
  'biggest_hit',
  'monsters_defeated',
  'knockouts',
  'nat20',
  'nat1',
  'd20_count',
  'd20_sum',
  'rolls_count',
  'spells_cast',
  'xp_gained',
] as const;

export type RankingStat = (typeof RANKING_STATS)[number];
export type StatDelta = Partial<Record<RankingStat, number>>;

/** Contadores que guardam o maior valor visto (não somam). */
export const MAX_STATS: readonly RankingStat[] = ['biggest_hit'];

const D20_ROLL_TYPES: readonly RollType[] = [
  'dice',
  'attack',
  'skill',
  'save',
  'spell',
  'initiative',
];

/**
 * O d20 que valeu numa rolagem (vantagem fica com o maior, desvantagem com o menor) — `null`
 * se a rolagem não é um d20 puro (dano, cura, outros dados).
 */
export function keptD20(roll: {
  roll_type: RollType;
  dice_notation: string;
  rolls: number[];
  advantage_state: AdvantageState;
}): number | null {
  if (!D20_ROLL_TYPES.includes(roll.roll_type)) return null;
  if (!/^\s*\d*d20\s*([+-]\s*\d+\s*)?$/i.test(roll.dice_notation ?? ''))
    return null;
  const rolls = (roll.rolls ?? []).filter(
    r => Number.isInteger(r) && r >= 1 && r <= 20,
  );
  if (!rolls.length) return null;
  if (roll.advantage_state === 'advantage') return Math.max(...rolls);
  if (roll.advantage_state === 'disadvantage') return Math.min(...rolls);
  return rolls[0];
}

/** O que uma rolagem soma pra quem rolou. */
export function rollStats(
  roll: Parameters<typeof keptD20>[0] & {total: number},
): StatDelta {
  const delta: StatDelta = {rolls_count: 1};
  // Dano e cura contam na rolagem, mesmo sem aplicar no alvo: o dano só é rolado depois que o
  // ataque acerta (decisão do usuário, 1.7.0).
  if (roll.roll_type === 'damage' && roll.total > 0) {
    delta.damage_dealt = roll.total;
    delta.biggest_hit = roll.total;
  }
  if (roll.roll_type === 'heal' && roll.total > 0)
    delta.healing_done = roll.total;
  const d20 = keptD20(roll);
  if (d20 === null) return delta;
  delta.d20_count = 1;
  delta.d20_sum = d20;
  if (d20 === 20) delta.nat20 = 1;
  if (d20 === 1) delta.nat1 = 1;
  return delta;
}

/** PV efetivo (atual + temporário) — o que de fato saiu ou entrou. */
const pool = (hp: {current: number; temp: number}) =>
  Math.max(0, hp.current) + Math.max(0, hp.temp);

/**
 * Dano/cura aplicado por um personagem num alvo. Dano causado, maior golpe e cura já contaram na
 * rolagem (`rollStats`); aqui entra só o que depende do alvo: golpe final em monstro pra quem
 * aplicou e, se o alvo é personagem de jogador, o dano sofrido e a queda pra quem recebeu.
 */
export function applyStats(input: {
  kind: 'damage' | 'heal' | 'temp_hp';
  targetKind: 'player' | 'npc' | 'monster';
  before: {current: number; temp: number};
  after: {current: number; temp: number};
}): {actor: StatDelta; target: StatDelta} {
  const actor: StatDelta = {};
  const target: StatDelta = {};
  if (input.kind === 'damage') {
    const lost = Math.max(0, pool(input.before) - pool(input.after));
    const dropped = input.before.current > 0 && input.after.current <= 0;
    if (input.targetKind === 'player') {
      target.damage_taken = lost;
      if (dropped) target.knockouts = 1;
    } else if (dropped && input.targetKind === 'monster') {
      actor.monsters_defeated = 1;
    }
  }
  return {actor: clean(actor), target: clean(target)};
}

/** PV alterado à mão na ficha da mesa: queda conta como dano sofrido. */
export function manualHpStats(
  before: {current: number; temp: number},
  after: {current: number; temp: number},
): StatDelta {
  const lost = pool(before) - pool(after);
  const delta: StatDelta = {};
  if (lost > 0) delta.damage_taken = lost;
  if (before.current > 0 && after.current <= 0) delta.knockouts = 1;
  return delta;
}

function clean(delta: StatDelta): StatDelta {
  const out: StatDelta = {};
  for (const [k, v] of Object.entries(delta) as [RankingStat, number][])
    if (Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}

/** Categorias do ranking: a coluna e como ordenar. */
export interface RankingCategoryDef {
  key: string;
  title: string;
  description: string;
  unit: string;
  /** Expressão SQL (só colunas de `character_session_stats`, alias `s`). */
  value: string;
  /** Linhas que entram (além do valor > 0). */
  where?: string;
}

export const RANKING_CATEGORIES: RankingCategoryDef[] = [
  {
    key: 'damage_dealt',
    title: 'DANO CAUSADO',
    description: 'Mais dano rolado (o dano só se rola depois de acertar)',
    unit: 'de dano',
    value: 's.damage_dealt',
  },
  {
    key: 'biggest_hit',
    title: 'MAIOR GOLPE',
    description: 'A maior rolagem de dano',
    unit: 'de dano',
    value: 's.biggest_hit',
  },
  {
    key: 'monsters_defeated',
    title: 'CAÇADOR',
    description: 'Mais monstros derrubados com o golpe final',
    unit: 'monstros',
    value: 's.monsters_defeated',
  },
  {
    key: 'damage_taken',
    title: 'DANO SOFRIDO',
    description: 'Quem mais apanhou e continuou de pé',
    unit: 'de dano',
    value: 's.damage_taken',
  },
  {
    key: 'healing_done',
    title: 'CURANDEIRO',
    description: 'Mais PV de cura rolados',
    unit: 'PV de cura',
    value: 's.healing_done',
  },
  {
    key: 'nat20',
    title: 'CRÍTICOS',
    description: 'Mais 20 naturais no d20',
    unit: '× 20 natural',
    value: 's.nat20',
  },
  {
    key: 'nat1',
    title: 'AZARADO',
    description: 'Mais 1 naturais no d20',
    unit: '× 1 natural',
    value: 's.nat1',
  },
  {
    key: 'luck',
    title: 'SORTUDO',
    description: 'Maior média no d20 (mínimo de 20 rolagens)',
    unit: 'de média',
    value: 'ROUND(s.d20_sum::numeric / NULLIF(s.d20_count, 0), 1)',
    where: 's.d20_count >= 20',
  },
  {
    key: 'knockouts',
    title: 'QUASE MORTO',
    description: 'Mais vezes caído a 0 PV',
    unit: 'quedas',
    value: 's.knockouts',
  },
  {
    key: 'spells_cast',
    title: 'ARQUIMAGO',
    description: 'Mais magias lançadas',
    unit: 'magias',
    value: 's.spells_cast',
  },
  {
    key: 'rolls_count',
    title: 'ROLADOR',
    description: 'Mais rolagens de dado',
    unit: 'rolagens',
    value: 's.rolls_count',
  },
  {
    key: 'xp_gained',
    title: 'VETERANO',
    description: 'Mais XP ganho numa mesa',
    unit: 'XP',
    value: 's.xp_gained',
  },
];

export const RANKING_LIMIT = 10;
