/**
 * Espelha `dungeon-companion-web/src/app/constants/armour-rules.ts` — o frontend usa isso só pra
 * filtrar a UI, mas a validação de verdade (boundary do servidor) precisa da mesma regra aqui.
 * `types` usa os valores de `armour_type` como vêm da tabela `armour` no banco.
 */
export interface ClassArmourRule {
  types: string[];
  shield: boolean;
}

export const CLASS_ARMOUR_RULES: Record<number, ClassArmourRule> = {
  1: {types: ['Armadura Leve', 'Armadura Média'], shield: true}, // Bárbaro
  2: {types: ['Armadura Leve'], shield: false}, // Bardo
  3: {types: ['Armadura Leve'], shield: false}, // Bruxo
  4: {types: ['Armadura Leve', 'Armadura Média'], shield: true}, // Clérigo
  5: {types: ['Armadura Leve', 'Armadura Média'], shield: true}, // Druida
  6: {types: [], shield: false}, // Feiticeiro
  7: {
    types: ['Armadura Leve', 'Armadura Média', 'Armadura Pesada'],
    shield: true,
  }, // Guerreiro
  8: {types: ['Armadura Leve'], shield: false}, // Ladino
  9: {types: [], shield: false}, // Mago
  10: {types: [], shield: false}, // Monge
  11: {
    types: ['Armadura Leve', 'Armadura Média', 'Armadura Pesada'],
    shield: true,
  }, // Paladino
  12: {types: ['Armadura Leve', 'Armadura Média'], shield: true}, // Patrulheiro
};
