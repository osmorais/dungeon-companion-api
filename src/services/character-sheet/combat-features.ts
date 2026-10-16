/* eslint-disable @typescript-eslint/naming-convention */
import {FinalStats} from '../../models/character-sheet-types';
import {getMod} from './calculator';

/**
 * Traços que mexem no ataque com arma (fase 2 de `docs/dungeon-companion-tracos-mecanicos.md`):
 * crítico, somas no acerto, bônus de ataque, ataque poderoso e ataque desarmado do Monge — já com
 * os números do personagem, pro modal de rolagem usar.
 */

/** Efeitos ligados pelo "USAR" e guardados no personagem até acabar (decisão do usuário). */
export const ACTIVATABLE_EFFECTS = ['Fúria', 'Arma Sagrada'] as const;
export type ActivatableEffect = (typeof ACTIVATABLE_EFFECTS)[number];

/** Habilidade de classe que liga um efeito ativo. */
export const ABILITY_ACTIVATES: Record<string, ActivatableEffect> = {
  Fúria: 'Fúria',
  'Canalizar Divindade: Arma Sagrada': 'Arma Sagrada',
};

/** Somas limitadas a 1×/turno — travadas pela vez do combate (decisão do usuário). */
export const ONCE_PER_TURN_RIDERS = [
  'Ataque Furtivo',
  'Golpe Divino',
  'Matador de Inimigos',
] as const;

export interface ActiveEffects {
  active: string[];
  /** Soma 1×/turno → chave da vez em que foi usada ("<combate>:<rodada>:<participante>"). */
  turn_uses: Record<string, string>;
}

export const EMPTY_ACTIVE_EFFECTS: ActiveEffects = {active: [], turn_uses: {}};

export interface CombatRider {
  key: string;
  name: string;
  dice: {count: number; sides: number} | null;
  flat: number;
  damage_type: string;
  /** Em que ataque vale: acuidade ou à distância (Ataque Furtivo), corpo a corpo de Força
   *  (Fúria) ou qualquer ataque com arma. */
  applies: 'finesse_or_ranged' | 'melee_str' | 'weapon';
  once_per_turn: boolean;
  /** Só com esse efeito ativo (Fúria) — e aí entra sozinho, sem marcar. */
  requires_active: ActivatableEffect | null;
}

export interface CombatFeatures {
  /** Menor resultado natural do d20 que é crítico (Campeão: 19, depois 18). */
  crit_min: number;
  /** Dados da arma a mais no crítico corpo a corpo (Crítico Brutal, Ataques Selvagens). */
  melee_crit_extra_dice: number;
  riders: CombatRider[];
  /** Bônus no ataque com arma enquanto o efeito estiver ativo (Arma Sagrada: + mod. CAR). */
  attack_bonuses: {
    key: string;
    name: string;
    bonus: number;
    requires_active: ActivatableEffect;
  }[];
  /** Talentos de −5 no ataque / +10 no dano (o jogador marca antes de rolar). */
  power_attack: {name: string; applies: 'heavy_melee' | 'ranged'}[];
  /** Ataque desarmado com o dado de Artes Marciais (Monge). */
  unarmed: {
    name: string;
    attack_bonus: number;
    dice: {count: number; sides: number};
    damage_modifier: number;
  } | null;
  active_effects: ActiveEffects;
}

const GOLPE_DIVINO_TYPE: Record<string, string> = {
  enganacao: 'veneno',
  guerra: 'da arma',
  luz: 'radiante',
  natureza: 'à escolha',
  tempestade: 'elétrico ou trovão',
  vida: 'radiante',
};

function parseDice(
  text: string | undefined,
): {count: number; sides: number} | null {
  const match = text?.match(/^(\d+)d(\d+)$/);
  return match ? {count: Number(match[1]), sides: Number(match[2])} : null;
}

export function buildCombatFeatures(ctx: {
  idClass: number;
  idSubclass: string | null;
  idRace: number;
  level: number;
  stats: FinalStats;
  profBonus: number;
  /** `class_resources` da ficha (ex.: {"Ataque Furtivo": "3d6", "Dano de Fúria": "+2"}). */
  classResources: Record<string, string> | null;
  featIds: string[];
  activeEffects: ActiveEffects | null;
}): CombatFeatures {
  const {idClass, idSubclass, level, stats, profBonus, classResources} = ctx;
  const riders: CombatRider[] = [];

  if (idClass === 8) {
    const dice = parseDice(classResources?.['Ataque Furtivo']);
    if (dice) {
      riders.push({
        key: 'Ataque Furtivo',
        name: 'Ataque Furtivo',
        dice,
        flat: 0,
        damage_type: 'da arma',
        applies: 'finesse_or_ranged',
        once_per_turn: true,
        requires_active: null,
      });
    }
  }
  if (idClass === 1) {
    const rage = Number(
      (classResources?.['Dano de Fúria'] ?? '').replace('+', ''),
    );
    if (rage > 0) {
      riders.push({
        key: 'Fúria',
        name: 'Fúria',
        dice: null,
        flat: rage,
        damage_type: 'da arma',
        applies: 'melee_str',
        once_per_turn: false,
        requires_active: 'Fúria',
      });
    }
  }
  if (
    idClass === 4 &&
    idSubclass &&
    GOLPE_DIVINO_TYPE[idSubclass] &&
    level >= 8
  ) {
    riders.push({
      key: 'Golpe Divino',
      name: 'Golpe Divino',
      dice: {count: level >= 14 ? 2 : 1, sides: 8},
      flat: 0,
      damage_type: GOLPE_DIVINO_TYPE[idSubclass],
      applies: 'weapon',
      once_per_turn: true,
      requires_active: null,
    });
  }
  if (idClass === 12 && level >= 20) {
    riders.push({
      key: 'Matador de Inimigos',
      name: 'Matador de Inimigos',
      dice: null,
      flat: getMod(stats.WIS),
      damage_type: 'da arma',
      applies: 'weapon',
      once_per_turn: true,
      requires_active: null,
    });
  }

  const attackBonuses: CombatFeatures['attack_bonuses'] = [];
  if (idClass === 11 && idSubclass === 'devocao' && level >= 3) {
    attackBonuses.push({
      key: 'Arma Sagrada',
      name: 'Arma Sagrada',
      bonus: Math.max(1, getMod(stats.CHA)),
      requires_active: 'Arma Sagrada',
    });
  }

  const powerAttack: CombatFeatures['power_attack'] = [];
  if (ctx.featIds.includes('mestre-armas-grandes')) {
    powerAttack.push({name: 'Mestre em Armas Grandes', applies: 'heavy_melee'});
  }
  if (ctx.featIds.includes('mestre-atirador')) {
    powerAttack.push({name: 'Mestre-Atirador', applies: 'ranged'});
  }

  let unarmed: CombatFeatures['unarmed'] = null;
  const martialDie =
    idClass === 10 ? parseDice(classResources?.['Artes Marciais']) : null;
  if (martialDie) {
    const mod = Math.max(getMod(stats.STR), getMod(stats.DEX));
    unarmed = {
      name: 'Ataque Desarmado',
      attack_bonus: profBonus + mod,
      dice: martialDie,
      damage_modifier: mod,
    };
  }

  const campeao = idClass === 7 && idSubclass === 'campeao';
  return {
    crit_min: campeao && level >= 15 ? 18 : campeao && level >= 3 ? 19 : 20,
    melee_crit_extra_dice:
      (idClass === 1
        ? level >= 17
          ? 3
          : level >= 13
            ? 2
            : level >= 9
              ? 1
              : 0
        : 0) + (ctx.idRace === 7 ? 1 : 0),
    riders,
    attack_bonuses: attackBonuses,
    power_attack: powerAttack,
    unarmed,
    active_effects: ctx.activeEffects ?? EMPTY_ACTIVE_EFFECTS,
  };
}
