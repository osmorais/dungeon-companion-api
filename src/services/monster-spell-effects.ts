/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Penalidades de magia guardadas no monstro da sessão (`monster_session.spell_effects`), 1.26.0.
 * Os números seguem o livro (`docs/dungeon-companion/referencias/magias.txt`):
 * - `bane` (Perdição): −1d4 nas jogadas de ataque e resistências do monstro;
 * - `faerie_fire` (Fogo das Fadas): ataques contra ele têm vantagem;
 * - `guiding_bolt` (Raio Guiador): o próximo ataque contra ele tem vantagem (gasta ao usar);
 * - `vicious_mockery` (Zombaria Viciosa): desvantagem no próximo ataque dele (gasta ao usar);
 * - `enfeebled` (Raio do Enfraquecimento): metade do dano nos ataques com arma de Força
 *   (lembrete pro mestre — a ficha do monstro não diz o atributo do ataque).
 * Acabam no fim do combate, no "Tirar" do mestre ou (as de uso único) ao usar.
 */
export type MonsterSpellEffectKey =
  | 'bane'
  | 'faerie_fire'
  | 'guiding_bolt'
  | 'vicious_mockery'
  | 'enfeebled';

export const MONSTER_SPELL_EFFECT_KEYS: readonly MonsterSpellEffectKey[] = [
  'bane',
  'faerie_fire',
  'guiding_bolt',
  'vicious_mockery',
  'enfeebled',
];

export type MonsterSpellEffects = Partial<
  Record<MonsterSpellEffectKey, {from: string}>
>;

/** Magia → penalidade que fica no monstro que falhar na resistência (ou for atingido). */
export const SPELL_MONSTER_EFFECT: Record<number, MonsterSpellEffectKey> = {
  264: 'bane', // Perdição
  164: 'faerie_fire', // Fogo das Fadas
  290: 'guiding_bolt', // Raio Guiador (ao acertar)
  361: 'vicious_mockery', // Zombaria Viciosa
  289: 'enfeebled', // Raio do Enfraquecimento
};

export function isMonsterSpellEffectKey(
  key: unknown,
): key is MonsterSpellEffectKey {
  return (
    typeof key === 'string' &&
    (MONSTER_SPELL_EFFECT_KEYS as readonly string[]).includes(key)
  );
}

/** Só as chaves conhecidas, com `from` texto curto; `{}` pra coluna nula ou lixo. */
export function normalizeMonsterSpellEffects(
  raw: unknown,
): MonsterSpellEffects {
  if (!raw || typeof raw !== 'object') return {};
  const result: MonsterSpellEffects = {};
  for (const key of MONSTER_SPELL_EFFECT_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    const from = (value as {from?: unknown} | null)?.from;
    if (typeof from === 'string') result[key] = {from: from.slice(0, 60)};
  }
  return result;
}

/** Liga (com quem lançou) ou desliga uma penalidade, sem mexer nas outras. */
export function withMonsterSpellEffect(
  current: MonsterSpellEffects,
  key: MonsterSpellEffectKey,
  from: string | null,
): MonsterSpellEffects {
  const next = {...current};
  if (from === null) delete next[key];
  else next[key] = {from: from.slice(0, 60)};
  return next;
}
