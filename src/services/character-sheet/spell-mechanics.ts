/* eslint-disable @typescript-eslint/naming-convention */
import {SpellRoll} from '../../models/character-options-types';

/**
 * Mecânica de rolagem das magias — o que o modal de rolagem precisa pra lançar a magia sem o
 * jogador montar os dados na mão (ver `docs/dungeon-companion-magias-mecanicas.md`). A tabela
 * `spell` do banco guarda só o texto; a regra fica aqui, igual a `rules.ts`/`feats.ts`.
 *
 * Fase 1: magias de **ataque mágico** e de **acerto automático**. Efeitos além do dano imediato
 * (ex.: metade do dano ao errar na Flecha Ácida, cura do Toque Vampírico, dano repetido do Raio
 * de Bruxa) continuam só na descrição — o mestre aplica.
 */
export interface SpellMechanics {
  /** Nome como está na tabela `spell` — só pra leitura e pros testes; a chave é o `id_spell`. */
  name: string;
  kind: 'attack' | 'auto';
  /** Só `kind: 'attack'`. */
  attack?: 'melee' | 'ranged';
  /** Dano no círculo base (truque: no nível 1 do personagem), por raio/dardo. */
  damage: {count: number; sides: number; type: string};
  /** Soma o modificador do atributo de conjuração ao dano (ex.: Arma Espiritual). */
  addCastingMod?: boolean;
  /** Bônus fixo no dano de cada raio/dardo (Mísseis Mágicos: +1). */
  bonus?: number;
  /** Mais de uma rolagem por conjuração (raios, feixes, dardos). */
  instances?: {
    base: number;
    /** +N a cada círculo acima do base (Raio Ardente, Mísseis Mágicos). */
    perSlotAbove?: number;
    /** 1/2/3/4 nos níveis 1/5/11/17 do personagem (Rajada Mística). */
    byCharacterLevel?: boolean;
    label: string;
  };
  /** "Em Níveis Superiores": +`count` dados a cada `every` círculos acima do base (padrão 1). */
  upcast?: {count: number; every?: number};
  /** Truque: dados ×2/×3/×4 nos níveis 5/11/17 do personagem. */
  cantripScaling?: boolean;
  /** Qual opção da magia o modal rola, quando ela tem várias (Mão de Bigby). */
  variant?: string;
}

export const SPELL_MECHANICS: Record<number, SpellMechanics> = {
  // Truques
  59: {
    name: 'Chicote de Espinhos',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 6, type: 'perfurante'},
    cantripScaling: true,
  },
  101: {
    name: 'Criar Chamas',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'fogo'},
    cantripScaling: true,
  },
  287: {
    name: 'Raio de Fogo',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 10, type: 'fogo'},
    cantripScaling: true,
  },
  288: {
    name: 'Raio de Gelo',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'frio'},
    cantripScaling: true,
  },
  294: {
    name: 'Rajada Mística',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 10, type: 'energia'},
    instances: {base: 1, byCharacterLevel: true, label: 'feixe'},
  },
  345: {
    name: 'Toque Arrepiante',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'necrótico'},
    cantripScaling: true,
  },
  346: {
    name: 'Toque Chocante',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 8, type: 'elétrico'},
    cantripScaling: true,
  },

  // 1º círculo
  185: {
    name: 'Infligir Ferimentos',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 10, type: 'necrótico'},
    upcast: {count: 1},
  },
  222: {
    name: 'Mísseis Mágicos',
    kind: 'auto',
    damage: {count: 1, sides: 4, type: 'energia'},
    bonus: 1,
    instances: {base: 3, perSlotAbove: 1, label: 'dardo'},
  },
  246: {
    name: 'Orbe Cromática',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 3, sides: 8, type: 'à escolha'},
    upcast: {count: 1},
  },
  284: {
    name: 'Raio Adoecente',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 2, sides: 8, type: 'veneno'},
    upcast: {count: 1},
  },
  286: {
    name: 'Raio de Bruxa',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 12, type: 'elétrico'},
    upcast: {count: 1},
  },
  290: {
    name: 'Raio Guiador',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 4, sides: 6, type: 'radiante'},
    upcast: {count: 1},
  },

  // 2º círculo
  23: {
    name: 'Arma Espiritual',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 8, type: 'energia'},
    addCastingMod: true,
    upcast: {count: 1, every: 2},
  },
  162: {
    name: 'Flecha Ácida de Melf',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 4, sides: 4, type: 'ácido'},
    upcast: {count: 1},
  },
  285: {
    name: 'Raio Ardente',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 2, sides: 6, type: 'fogo'},
    instances: {base: 3, perSlotAbove: 1, label: 'raio'},
  },

  // 3º círculo em diante
  347: {
    name: 'Toque Vampírico',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 6, type: 'necrótico'},
    upcast: {count: 1},
  },
  209: {
    name: 'Mão de Bigby',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 4, sides: 8, type: 'energia'},
    upcast: {count: 2},
    variant: 'Punho Cerrado',
  },
  152: {
    name: 'Espada de Mordenkainen',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 10, type: 'energia'},
  },
};

/** Multiplicador de truque pelo nível do personagem: 1/2/3/4 nos níveis 1/5/11/17. */
export function cantripTier(characterLevel: number): number {
  if (characterLevel >= 17) return 4;
  if (characterLevel >= 11) return 3;
  if (characterLevel >= 5) return 2;
  return 1;
}

/** Rolagem de uma conjuração num círculo específico (`slotLevel`; truque usa o próprio nível 0). */
export function resolveSpellRollAtSlot(
  mechanics: SpellMechanics,
  spellLevel: number,
  slotLevel: number,
  characterLevel: number,
  castingMod: number,
): SpellRoll['by_slot'][string] {
  const above = Math.max(0, slotLevel - spellLevel);
  const tier = cantripTier(characterLevel);
  let diceCount = mechanics.damage.count;
  if (mechanics.upcast)
    diceCount +=
      mechanics.upcast.count *
      Math.floor(above / (mechanics.upcast.every ?? 1));
  if (mechanics.cantripScaling) diceCount *= tier;

  const inst = mechanics.instances;
  const instances = !inst
    ? 1
    : inst.byCharacterLevel
      ? tier
      : inst.base + (inst.perSlotAbove ?? 0) * above;

  return {
    instances,
    dice_count: diceCount,
    dice_sides: mechanics.damage.sides,
    modifier:
      (mechanics.addCastingMod ? castingMod : 0) + (mechanics.bonus ?? 0),
  };
}

/**
 * Rolagem pronta pra ficha: bônus de ataque do personagem e os dados por círculo em que a magia
 * pode ser lançada (truque: só a chave "0", já escalado pelo nível). `null` se a magia não tem
 * mecânica cadastrada.
 */
export function buildSpellRoll(
  idSpell: number,
  spellLevel: number,
  characterLevel: number,
  castingMod: number,
  spellAttackBonus: number,
): SpellRoll | null {
  const mechanics = SPELL_MECHANICS[idSpell];
  if (!mechanics) return null;
  const slotLevels =
    spellLevel === 0
      ? [0]
      : Array.from({length: 10 - spellLevel}, (_, i) => spellLevel + i);
  return {
    kind: mechanics.kind,
    attack_type: mechanics.attack ?? null,
    attack_bonus: mechanics.kind === 'attack' ? spellAttackBonus : null,
    damage_type: mechanics.damage.type,
    instance_label: mechanics.instances?.label ?? null,
    variant: mechanics.variant ?? null,
    by_slot: Object.fromEntries(
      slotLevels.map(slot => [
        String(slot),
        resolveSpellRollAtSlot(
          mechanics,
          spellLevel,
          slot,
          characterLevel,
          castingMod,
        ),
      ]),
    ),
  };
}
