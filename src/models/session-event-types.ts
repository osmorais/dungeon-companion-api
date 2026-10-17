/* eslint-disable @typescript-eslint/naming-convention */
import {CombatEncounterDetail} from './combat-types';
import {
  MonsterAbilityKey,
  MonsterSession,
  NpcSession,
  PlayerSession,
  RollLogEntry,
  SecretRollCheck,
  ShownReferenceImage,
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
  monster_defeated: {
    id_monster_session: string;
    name: string;
    image_url: string | null;
  };
  player_hp_updated: {
    id_player_session: string;
    current_hit_points: number;
    temporary_hit_points: number;
  };
  player_xp_granted: {
    id_player_session: string;
    character_name: string;
    xp_amount: number;
    xp_points: number;
    /** Esse gasto específico fez o personagem cruzar o limiar de XP do próximo nível. */
    can_level_up: boolean;
  };
  npc_xp_granted: {
    id_npc_session: string;
    character_name: string;
    xp_amount: number;
    xp_points: number;
    /** Esse gasto específico fez o personagem cruzar o limiar de XP do próximo nível. */
    can_level_up: boolean;
  };
  npc_hp_updated: {id_npc_session: string; current_hit_points: number};
  monster_hp_updated: {id_monster_session: string; hp_current: number};
  monster_stats_updated: {
    id_monster_session: string;
    custom_name: string | null;
    hp_current: number;
    hp_max: number;
    ac: number;
    abilities?: Partial<Record<MonsterAbilityKey, number>>;
  };
  monster_image_updated: {id_monster_session: string; image_url: string};
  monster_revealed: {
    id_monster_session: string;
    name: string;
    image_url: string | null;
  };
  monster_hidden: {id_monster_session: string};
  roll_added: {roll: RollLogEntry};
  /** Teste secreto pedido pelo mestre — vai só pro jogador alvo (ver `eventTargetUserId`). */
  secret_roll_requested: {
    target_user_id: string;
    request_id: string;
    id_player_session: string;
    id_character: number;
    label: string;
    check: SecretRollCheck;
  };
  spell_cast: {
    id_character: number;
    actor_name: string;
    spell_name: string;
    save_dc: number | null;
    save_ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null;
    is_ability: boolean;
  };
  /** Mestre mostra uma imagem de referência em tela cheia pra todos da sessão. */
  reference_image_shown: {image: ShownReferenceImage};
  /** Imagem fechada pra todos: o mestre fechou ou apagou a imagem que estava em exibição. */
  reference_image_hidden: {reason: 'hidden' | 'deleted'};
  combat_started: {combat: CombatEncounterDetail};
  combat_participants_added: {combat: CombatEncounterDetail};
  initiative_submitted: {combat: CombatEncounterDetail};
  turn_ended: {combat: CombatEncounterDetail};
  turn_order_changed: {combat: CombatEncounterDetail};
  turn_delayed: {combat: CombatEncounterDetail};
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
  'monster_stats_updated',
  'monster_image_updated',
]);

/**
 * Além dos tipos sempre restritos ao mestre (DM_ONLY_EVENT_TYPES), `roll_added` é DM-only só
 * quando a própria rolagem foi marcada como oculta (roll.is_hidden) — daí precisar checar o
 * payload, não só o `type`.
 */
/** Evento pra um único usuário (sala própria dele na sessão), em vez da sala de todos. */
export function eventTargetUserId(event: SessionEvent): string | null {
  return event.type === 'secret_roll_requested' ? event.target_user_id : null;
}

export function isDmOnlyEvent(event: SessionEvent): boolean {
  if (DM_ONLY_EVENT_TYPES.has(event.type)) return true;
  return event.type === 'roll_added' && event.roll.is_hidden;
}
