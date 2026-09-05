/* eslint-disable @typescript-eslint/naming-convention */
import {AvatarPreset} from './character-sheet-types';

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
}

export interface AddPlayerInput {
  session_code: string;
  player_name: string;
  id_character: number;
  user_id?: string;
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
  avatar_preset: AvatarPreset | null;
}

export interface PlayerSession {
  id_player_session: string;
  id_game_session: string;
  id_character: number;
  player_name: string;
  user_id: string | null;
  character: PlayerCharacterSummary | null;
}

export interface MonsterSession {
  id_monster_session: string;
  id_game_session: string;
  monster_api_slug: string;
  custom_name?: string;
  hp_current: number;
  hp_max: number;
  ac: number;
  data_snapshot: Record<string, unknown>;
}

export interface GameSessionCreated {
  game_session: GameSession;
  npcs: NpcSession[];
  monsters: MonsterSession[];
}

export type RollType = 'dice' | 'attack' | 'skill' | 'save' | 'spell';
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
}

export interface GameSessionDetail {
  game_session: GameSession;
  players: PlayerSession[];
  npcs: NpcSession[];
  monsters: MonsterSession[];
  recent_rolls: RollLogEntry[];
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
