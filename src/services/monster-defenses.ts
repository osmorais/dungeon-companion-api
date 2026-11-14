/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Imunidade, resistência e vulnerabilidade de monstro ao tipo de dano (1.24.4), pela ficha do
 * bestiário (`damage_immunities` etc.). Só os tipos simples ("veneno", "fogo"): as entradas
 * compostas ("concussão, cortante e perfurante de ataques não-mágicos") dependem de a arma ser
 * mágica e ficam com o mestre.
 */
export interface MonsterDefenses {
  immunities: string[];
  resistances: string[];
  vulnerabilities: string[];
}

export type DefenseOutcome = 'immune' | 'resistant' | 'vulnerable' | null;

/** "Concussão"/"contundente" e acentos/maiúsculas não atrapalham a comparação. */
export function normalizeDamage(type: string | null | undefined): string {
  return (type ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/contundente/g, 'concussao')
    .replace(/venenos[oa]/g, 'veneno');
}

function simple(list: unknown): string[] {
  return Array.isArray(list)
    ? list
        .filter(
          (t): t is string => typeof t === 'string' && !/[,]| de /.test(t),
        )
        .map(normalizeDamage)
    : [];
}

export function monsterDefenses(
  snapshot: Record<string, unknown> | null | undefined,
): MonsterDefenses {
  const s = snapshot ?? {};
  return {
    immunities: simple(s['damage_immunities']),
    resistances: simple(s['damage_resistances']),
    vulnerabilities: simple(s['damage_vulnerabilities']),
  };
}

/** O monstro é imune ao tipo (qualquer tipo citado num dano composto "fogo + radiante"). */
export function isImmuneTo(
  defenses: MonsterDefenses,
  damageType: string | null | undefined,
): boolean {
  const type = normalizeDamage(damageType);
  return !!type && defenses.immunities.some(t => type.includes(t));
}

/** Dano depois das defesas: imune 0, resistente metade (pra baixo), vulnerável o dobro. */
export function damageAfterDefenses(
  defenses: MonsterDefenses,
  damageType: string | null | undefined,
  amount: number,
): {amount: number; outcome: DefenseOutcome} {
  const type = normalizeDamage(damageType);
  if (!type) return {amount, outcome: null};
  if (defenses.immunities.some(t => type.includes(t)))
    return {amount: 0, outcome: 'immune'};
  const resistant = defenses.resistances.some(t => type.includes(t));
  const vulnerable = defenses.vulnerabilities.some(t => type.includes(t));
  if (resistant && vulnerable) return {amount, outcome: null};
  if (resistant) return {amount: Math.floor(amount / 2), outcome: 'resistant'};
  if (vulnerable) return {amount: amount * 2, outcome: 'vulnerable'};
  return {amount, outcome: null};
}
