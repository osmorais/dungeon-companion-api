/* eslint-disable @typescript-eslint/naming-convention */

/** Ranger (Patrulheiro). */
export const RANGER_CLASS_ID = 12;
/** Conclave da Besta: Companheiro Animal a partir do nível 3. */
export const BEAST_MASTER_ID = 'mestre-das-feras';
export const COMPANION_MAX_CR = 0.25;
const COMPANION_SIZES = ['Minúsculo', 'Pequeno', 'Médio'];

/**
 * Cores do contorno que liga o card do companheiro ao do ranger. Sorteadas entre as que ainda não
 * estão em uso na mesa (com todas em uso, repete).
 */
export const COMPANION_COLORS = [
  '#e0b84a',
  '#5fb3d9',
  '#c96bd6',
  '#6bd68a',
  '#e07a5f',
  '#9fa8ff',
  '#f2a7c3',
  '#7fd1c7',
] as const;

/** Companheiro como a mesa vê: a besta com a proficiência do ranger já somada. */
export interface SessionCompanion {
  id_session_companion: string;
  id_game_session: string;
  id_player_session: string;
  slug: string;
  name: string;
  color: string;
  hp_current: number;
  /** O maior entre o PV da besta e 4 × o nível do ranger. */
  hp_max: number;
  /** CA da besta + proficiência do ranger. */
  armor_class: number;
  /** Somada nos ataques e no dano da besta (o site soma ao montar as cartas). */
  proficiency_bonus: number;
  /** Ataques quando o ranger manda atacar: 2 no nível 11 (Ataques Múltiplos do Companheiro). */
  attacks_per_command: number;
  speed: string;
  /** Ações no formato do bestiário. */
  actions: unknown[];
}

export function canHaveCompanion(
  idClass: number,
  idSubclass: string | null,
  level: number,
): boolean {
  return (
    idClass === RANGER_CLASS_ID && idSubclass === BEAST_MASTER_ID && level >= 3
  );
}

/** Besta de ND 1/4 ou menor, de tamanho até Médio. */
export function companionBeastAllowed(beast: {
  challenge_rating: number;
  data: Record<string, unknown>;
}): boolean {
  return (
    beast.data['type'] === 'besta' &&
    beast.challenge_rating <= COMPANION_MAX_CR &&
    COMPANION_SIZES.includes(String(beast.data['size']))
  );
}

export function companionMaxHp(beastHp: number, rangerLevel: number): number {
  return Math.max(beastHp, 4 * rangerLevel);
}

export function companionAttacksPerCommand(rangerLevel: number): number {
  return rangerLevel >= 11 ? 2 : 1;
}

export function pickCompanionColor(
  used: string[],
  random: () => number = Math.random,
): string {
  const free = COMPANION_COLORS.filter(c => !used.includes(c));
  const pool = free.length ? free : [...COMPANION_COLORS];
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Linha do banco (com o nível e a proficiência do ranger) → como a mesa vê. */
export function companionView(row: {
  id_session_companion: string;
  id_game_session: string;
  id_player_session: string;
  monster_slug: string;
  name: string;
  color: string;
  hp_current: number;
  data_snapshot: Record<string, unknown>;
  ranger_level: number;
  proficiency_bonus: number;
}): SessionCompanion {
  const data = row.data_snapshot ?? {};
  const baseHp =
    typeof data['hit_points'] === 'number' ? data['hit_points'] : 1;
  const ac = Array.isArray(data['armor_class'])
    ? Number((data['armor_class'][0] as {value?: number})?.value ?? 10)
    : 10;
  const speed =
    data['speed'] && typeof data['speed'] === 'object'
      ? Object.entries(data['speed'] as Record<string, string>)
          .map(([kind, value]) => `${kind} ${value}`)
          .join(', ')
      : '';
  return {
    id_session_companion: row.id_session_companion,
    id_game_session: row.id_game_session,
    id_player_session: row.id_player_session,
    slug: row.monster_slug,
    name: row.name,
    color: row.color,
    hp_current: row.hp_current,
    hp_max: companionMaxHp(baseHp, row.ranger_level),
    armor_class: ac + row.proficiency_bonus,
    proficiency_bonus: row.proficiency_bonus,
    attacks_per_command: companionAttacksPerCommand(row.ranger_level),
    speed,
    actions: Array.isArray(data['actions']) ? data['actions'] : [],
  };
}
