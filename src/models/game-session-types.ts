/* eslint-disable @typescript-eslint/naming-convention */
import {AvatarPreset} from './character-sheet-types';
import {CombatEncounterDetail} from './combat-types';

export interface GameSession {
  id_game_session: string;
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  user_id: string | null;
  created_at?: Date;
}

export interface NpcSessionInput {
  id_character: number;
}

export interface MonsterSessionInput {
  monster_api_slug: string;
  custom_name?: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
  image_url?: string | null;
}

/**
 * Adiciona um monstro a uma sessão em andamento — ou a partir de um monstro já catalogado
 * (`id_monster_catalog`) ou catalogando um novo na hora (`monster_api_slug`), exatamente um
 * dos dois deve ser informado.
 */
export interface AddMonsterToSessionInput {
  id_monster_catalog?: string;
  monster_api_slug?: string;
  custom_name?: string;
}

export interface AddPlayerInput {
  session_code: string;
  player_name: string;
  id_character: number;
  user_id?: string;
}

export interface GrantXpInput {
  xp_amount: number;
  /** Cada jogador/NPC listado recebe o valor cheio de `xp_amount` (não é dividido entre eles). */
  id_player_sessions?: string[];
  id_npc_sessions?: string[];
}

export interface GrantXpResult {
  participant_type: 'player' | 'npc';
  /** Setado quando participant_type === 'player'. */
  id_player_session?: string;
  /** Setado quando participant_type === 'npc'. */
  id_npc_session?: string;
  id_character: number;
  character_name: string;
  xp_points: number;
  level: number;
}

export interface CreateGameSessionInput {
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  npcs?: NpcSessionInput[];
  monsters?: MonsterSessionInput[];
}

export interface NpcSession {
  id_npc_session: string;
  id_game_session: string;
  id_character: number;
  character: PlayerCharacterSummary | null;
}

export interface PlayerCharacterSummary {
  name: string;
  class: string;
  race: string;
  level: number;
  max_hit_points: number;
  current_hit_points: number;
  /** Amortecedor de dano à parte do PV normal — pode deixar o total acima do máximo (regra do
   *  livro: nunca acumula com uma vida temporária existente, cura nunca a restaura). */
  temporary_hit_points: number;
  experience_points: number;
  avatar_preset: AvatarPreset | null;
  /** Foto de verdade (via Supabase Storage), à parte do avatar_preset — usada como fundo do
   *  toast de rolagem na sessão. */
  image_url: string | null;
}

export interface PlayerSession {
  id_player_session: string;
  id_game_session: string;
  id_character: number;
  player_name: string;
  user_id: string | null;
  character: PlayerCharacterSummary | null;
}

/** Chaves de atributo dentro de `MonsterSession.data_snapshot` (formato do SRD, em inglês). */
export type MonsterAbilityKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export interface MonsterSession {
  id_monster_session: string;
  id_game_session: string;
  monster_api_slug: string;
  custom_name?: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
  is_revealed: boolean;
  image_url: string | null;
}

/** Versão pública de um monstro revelado — só o que os jogadores podem ver: nome, sem status/PV. */
export interface RevealedMonster {
  id_monster_session: string;
  name: string;
  image_url: string | null;
}

export interface GameSessionCreated {
  game_session: GameSession;
  npcs: NpcSession[];
  monsters: MonsterSession[];
}

export type RollType =
  | 'dice'
  | 'attack'
  | 'damage'
  | 'skill'
  | 'save'
  | 'spell'
  | 'initiative';
export type AdvantageState = 'normal' | 'advantage' | 'disadvantage';

export interface RollLogEntry {
  id_roll: string;
  id_game_session: string;
  id_character: number | null;
  actor_name: string;
  roll_type: RollType;
  label: string;
  dice_notation: string;
  rolls: number[];
  advantage_state: AdvantageState;
  modifier: number;
  total: number;
  created_at: Date;
  /** Rolagem oculta do mestre — não aparece pros jogadores (nem no log, nem no toast/socket). */
  is_hidden: boolean;
}

export interface RollLogInput {
  id_character: number | null;
  actor_name: string;
  roll_type: RollType;
  label: string;
  dice_notation: string;
  rolls: number[];
  advantage_state: AdvantageState;
  modifier: number;
  total: number;
  /** Só o mestre pode marcar como oculta — o service ignora esse campo pra quem não é dono da sessão. */
  is_hidden?: boolean;
}

export interface GameSessionDetail {
  game_session: GameSession;
  players: PlayerSession[];
  npcs: NpcSession[];
  /** Só preenchido para o mestre — jogadores recebem sempre um array vazio aqui. */
  monsters: MonsterSession[];
  /** Monstros revelados pelo mestre — visível para todos, sem status/PV. */
  revealed_monsters: RevealedMonster[];
  recent_rolls: RollLogEntry[];
  combat: CombatEncounterDetail | null;
}

export interface GameSessionSummary {
  id_game_session: string;
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  user_id: string | null;
  created_at: Date;
  total_count: number;
}

export interface GameSessionPagedList {
  GameSessionPagedList: GameSessionSummary[];
  page: number;
  pageSize: number;
  total_count: number;
}
