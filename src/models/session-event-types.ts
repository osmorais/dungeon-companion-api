/* eslint-disable @typescript-eslint/naming-convention */
import {CombatEncounterDetail} from './combat-types';
import {
  MonsterSession,
  NpcSession,
  PlayerSession,
  RollLogEntry,
} from './game-session-types';

/**
 * Um tipo por chave = payload da mutação; SessionEvent é derivado como union discriminada
 * por `type`. Adicionar uma mutação nova = adicionar uma linha aqui + um `publish(...)` no
 * service correspondente — nada mais muda na camada de transporte (SessionSocketGateway).
 */
export interface SessionEventPayloadMap {
  player_added: {player: PlayerSession};
  player_removed: {id_player_session: string};
  npc_added: {npc: NpcSession};
  npc_removed: {id_npc_session: string};
  monster_added: {monster: MonsterSession};
  monster_removed: {id_monster_session: string};
  monster_defeated: {id_monster_session: string; name: string};
  player_hp_updated: {id_player_session: string; current_hit_points: number};
  npc_hp_updated: {id_npc_session: string; current_hit_points: number};
  monster_hp_updated: {id_monster_session: string; hp_current: number};
  monster_revealed: {id_monster_session: string; name: string};
  monster_hidden: {id_monster_session: string};
  roll_added: {roll: RollLogEntry};
  combat_started: {combat: CombatEncounterDetail};
  initiative_submitted: {combat: CombatEncounterDetail};
  turn_ended: {combat: CombatEncounterDetail};
  combat_ended: {id_combat_encounter: string; hidden_monster_ids: string[]};
}

export type SessionEventType = keyof SessionEventPayloadMap;

export type SessionEvent = {
  [K in SessionEventType]: {
    type: K;
    id_game_session: string;
  } & SessionEventPayloadMap[K];
}[SessionEventType];

/**
 * Eventos cujo payload só pode ir para a sala do mestre — carregam dado que o REST já
 * esconde de jogadores (GameSessionService.getSession: `monsters: isDm ? session.monsters : []`).
 */
export const DM_ONLY_EVENT_TYPES: ReadonlySet<SessionEventType> = new Set([
  'monster_added',
  'monster_hp_updated',
]);
