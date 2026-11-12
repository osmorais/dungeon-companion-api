/* eslint-disable @typescript-eslint/naming-convention */

/** Druida (Forma Selvagem a partir do nível 2). */
export const DRUID_CLASS_ID = 5;
/** Círculo da Lua: formas de combate com ND maior. */
export const MOON_SUBCLASS_ID = 'lua';
export const WILD_SHAPE_RESOURCE = 'Forma Selvagem';
/** Nível 18 (Magias da Besta): lança magias mesmo transformado. */
export const BEAST_SPELLS_LEVEL = 18;

/**
 * Forma em que o druida está: o que a ficha e a mesa usam no lugar das dele (cópia da ficha da
 * besta no bestiário, tirada ao transformar). Fica em `character.active_effects.wild_shape`.
 */
export interface WildShapeState {
  slug: string;
  name: string;
  challenge_rating: number;
  hp_current: number;
  hp_max: number;
  armor_class: number;
  strength: number;
  dexterity: number;
  constitution: number;
  /** Ex.: "terrestre 12 m, natação 9 m". */
  speed: string;
  /** Ações da besta, no formato do bestiário (o site monta as cartas de ataque). */
  actions: unknown[];
}

export interface WildShapeLimits {
  /** ND máximo da besta. */
  max_cr: number;
  swim: boolean;
  fly: boolean;
  /** Duração em horas (metade do nível do druida). */
  hours: number;
}

/**
 * O que o druida pode virar no nível (tabela Formas de Besta): nv2 ND 1/4 sem nado nem voo, nv4
 * ND 1/2 sem voo, nv8 ND 1. Círculo da Lua: ND 1 desde o nv2 e nível ÷ 3 a partir do nv6 (o
 * nado e o voo continuam pela tabela). `null` = ainda não tem Forma Selvagem.
 */
export function wildShapeLimits(
  idClass: number,
  idSubclass: string | null,
  level: number,
): WildShapeLimits | null {
  if (idClass !== DRUID_CLASS_ID || level < 2) return null;
  let maxCr = level >= 8 ? 1 : level >= 4 ? 0.5 : 0.25;
  if (idSubclass === MOON_SUBCLASS_ID)
    maxCr = Math.max(maxCr, level >= 6 ? Math.floor(level / 3) : 1);
  return {
    max_cr: maxCr,
    swim: level >= 4,
    fly: level >= 8,
    hours: Math.floor(level / 2),
  };
}

type BeastData = Record<string, unknown>;

function speedOf(data: BeastData): Record<string, string> {
  const speed = data['speed'];
  return speed && typeof speed === 'object'
    ? (speed as Record<string, string>)
    : {};
}

/** A besta serve pra este druida? Só bestas, dentro do ND e do nado/voo do nível. */
export function beastAllowed(
  beast: {challenge_rating: number; data: BeastData},
  limits: WildShapeLimits,
): boolean {
  if (beast.data['type'] !== 'besta') return false;
  if (beast.challenge_rating > limits.max_cr) return false;
  const speed = speedOf(beast.data);
  if (speed['voo'] && !limits.fly) return false;
  if (speed['natação'] && !limits.swim) return false;
  return true;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Monta a forma a partir da ficha da besta (PV cheio). */
export function buildWildShape(beast: {
  slug: string;
  name: string;
  hp_max: number;
  ac: number;
  challenge_rating: number;
  data: BeastData;
}): WildShapeState {
  const speed = Object.entries(speedOf(beast.data))
    .map(([kind, value]) => `${kind} ${value}`)
    .join(', ');
  return {
    slug: beast.slug,
    name: beast.name,
    challenge_rating: beast.challenge_rating,
    hp_current: beast.hp_max,
    hp_max: beast.hp_max,
    armor_class: beast.ac,
    strength: num(beast.data['strength'], 10),
    dexterity: num(beast.data['dexterity'], 10),
    constitution: num(beast.data['constitution'], 10),
    speed,
    actions: Array.isArray(beast.data['actions']) ? beast.data['actions'] : [],
  };
}

/**
 * PV novo pedido pra quem está transformado (o PV mostrado é o da forma). Acima de 0: só a forma
 * muda. Em 0: volta à forma normal e o dano que sobrou (`overflow`) passa pro druida.
 */
export function applyHpToWildShape(
  state: WildShapeState,
  requestedFormHp: number,
  overflow: number,
  druidHp: number,
): {form: WildShapeState | null; druidHp: number} {
  if (requestedFormHp > 0)
    return {
      form: {...state, hp_current: Math.min(requestedFormHp, state.hp_max)},
      druidHp,
    };
  return {form: null, druidHp: Math.max(0, druidHp - Math.max(0, overflow))};
}
