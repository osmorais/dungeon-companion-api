/**
 * Conta do PV ao aplicar dano/cura/PV temporários vindos de uma rolagem — a mesma regra que o
 * painel da sessão usa no dano/cura em lote:
 * - dano consome primeiro os PV temporários e não deixa o PV abaixo de 0;
 * - cura vai só até o PV máximo (não vira PV temporário);
 * - PV temporários não acumulam: fica o maior.
 */
export type ApplyKind = 'damage' | 'heal' | 'temp_hp';

export interface HpState {
  current: number;
  max: number;
  temp: number;
}

export function applyHpAmount(
  state: HpState,
  amount: number,
  kind: ApplyKind,
): {current: number; temp: number} {
  if (kind === 'damage') {
    const absorbed = Math.min(state.temp, amount);
    return {
      current: Math.max(0, state.current - (amount - absorbed)),
      temp: state.temp - absorbed,
    };
  }
  if (kind === 'heal') {
    return {
      current: Math.min(state.max, Math.max(state.current, 0) + amount),
      temp: state.temp,
    };
  }
  return {current: state.current, temp: Math.max(state.temp, amount)};
}
