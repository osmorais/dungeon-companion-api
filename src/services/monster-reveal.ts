/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Dados da carta do monstro no aviso de revelação (1.11.0): tipo e tamanho da ficha e a descrição
 * (lore) do bestiário. Nada de números de combate — o aviso vai pra mesa inteira.
 */
export interface MonsterRevealCard {
  monster_type: string | null;
  size: string | null;
  lore: string | null;
}

export function monsterRevealCard(
  snapshot: unknown,
  lore: string | null | undefined,
): MonsterRevealCard {
  const s = (snapshot ?? {}) as {type?: unknown; size?: unknown};
  const text = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  return {
    monster_type: text(s.type),
    size: text(s.size),
    lore: text(lore),
  };
}
