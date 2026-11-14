/* eslint-disable @typescript-eslint/naming-convention */
import {CombatEncounterDetail} from './combat-types';
import {SessionCompanion} from '../services/character-sheet/companion';
import {SaveContext} from './character-options-types';
import {
  MonsterAbilityKey,
  MonsterSession,
  NpcSession,
  CastStageApplied,
  CastStageTarget,
  CastStageRoll,
  PlayerSession,
  RollLogEntry,
  SecretRollCheck,
  ShownReferenceImage,
  SpellCardInfo,
  MonsterActionCardInfo,
  MonsterCastInfo,
  WeaponCardInfo,
} from './game-session-types';
import {
  MonsterActionState,
  RechargeRoll,
} from '../services/monster-action-state';
import {MonsterRevealCard} from '../services/monster-reveal';

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
  /** Companheiro Animal escolhido, trocado (`companion`) ou dispensado (`null`). */
  companion_set: {
    id_player_session: string;
    companion: SessionCompanion | null;
  };
  companion_hp_updated: {id_session_companion: string; hp_current: number};
  monster_removed: {id_monster_session: string};
  /** Com a carta (tipo e tamanho; sem lore) pra explosão no aviso de derrota (1.11.0). */
  monster_defeated: {
    id_monster_session: string;
    name: string;
    image_url: string | null;
    /** Monstro derrotado dentro de um combate em andamento: o XP acumulado dele (1.15.0). */
    combat_xp: {id_combat_encounter: string; defeated_xp: number} | null;
  } & MonsterRevealCard;
  /** Mestre apagou a sessão — quem está nela volta pro início. */
  session_deleted: Record<never, never>;
  /** Mestre declarou um descanso do grupo — só o aviso pra mesa (PV vai em *_hp_updated). */
  party_rested: {
    rest_type: 'short' | 'long';
    character_names: string[];
  };
  player_hp_updated: {
    id_player_session: string;
    current_hit_points: number;
    temporary_hit_points: number;
    /** Forma Selvagem entrou em jogo: o PV máximo mostrado e a forma (`null` = voltou ao normal). */
    max_hit_points?: number;
    wild_shape_name?: string | null;
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
  /** Usos das ações do monstro mudaram (1.11.0). `recharge_rolls`: d6 de recarga rolados no
   *  início do turno dele; `lair`: lembrete de ação de covil (contagem 20). Só o mestre recebe. */
  monster_action_state_updated: {
    id_monster_session: string;
    action_state: MonsterActionState;
    recharge_rolls?: RechargeRoll[];
  };
  /** Com tipo, tamanho e descrição pra carta do aviso (1.11.0) — ver monster-reveal.ts. */
  monster_revealed: {
    id_monster_session: string;
    name: string;
    image_url: string | null;
  } & MonsterRevealCard;
  monster_hidden: {id_monster_session: string};
  /** `cast_id`: rolagem de um lançamento de magia — a mesa mostra no aviso do lançamento. */
  roll_added: {roll: RollLogEntry & {cast_id?: string}};
  /** Mestre mudou uma opção da mesa no Quadro do Mestre (1.25.0). */
  session_settings_updated: {auto_hit_check: boolean};
  /** Resistência de monstro resolvida pelo mestre: a mesa sabe só se passou ou falhou (o total
   *  fica na rolagem oculta, 1.24.2). */
  save_resolved: {
    save_request_id: string;
    id_monster_session: string;
    name: string;
    outcome: 'success' | 'fail';
  };
  /** Teste secreto pedido pelo mestre — vai só pro jogador alvo (ver `eventTargetUserId`). */
  secret_roll_requested: {
    target_user_id: string;
    request_id: string;
    /** `null` quando o alvo é um monstro (o pedido vai pro mestre). */
    id_player_session: string | null;
    id_character: number | null;
    /** Monstro atingido e o nome dele (só nos pedidos pro mestre, 1.24.2). */
    id_monster_session?: string | null;
    monster_name?: string | null;
    /** CD — só no pedido de monstro, que vai só pro mestre (o jogador nunca recebe). */
    dc?: number | null;
    label: string;
    check: SecretRollCheck;
    /** Teste secreto (só o mestre vê) ou resistência pública contra uma magia/ação. */
    secret: boolean;
    /** Contra o que é a resistência (a CD nunca vai no evento). */
    against: SaveContext[];
  };
  spell_cast: {
    id_character: number;
    actor_name: string;
    spell_name: string;
    save_dc: number | null;
    save_ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null;
    is_ability: boolean;
  };
  /** Etapa de um lançamento de magia ou ataque com arma (aviso único da mesa: card do personagem +
   *  carta + rolagens). `user_id` = quem lançou (o próprio cliente já vê no modal de rolagem). */
  spell_cast_stage: {
    cast_id: string;
    user_id: string;
    /** `null` na ação de monstro (`monster`). */
    id_character: number | null;
    actor_name: string;
    /** Magia (1.5.0), ataque com arma (1.6.1) ou ação de monstro (1.13.0): só um não é null. */
    spell: SpellCardInfo | null;
    weapon: WeaponCardInfo | null;
    monster_action: MonsterActionCardInfo | null;
    /** Quem age na ação de monstro (só monstro revelado; nome e imagem vêm do servidor). */
    monster: MonsterCastInfo | null;
    phase: 'open' | 'done' | 'cancel';
    rolls: CastStageRoll[];
    applied: CastStageApplied[];
    /** Alvos escolhidos no começo e o resultado da resistência de cada um (1.25.0). */
    targets: CastStageTarget[];
    save_dc: number | null;
    save_ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null;
  };
  /** Alguém aplicou dano/cura de uma rolagem num alvo — só o aviso pra mesa (o PV vai no evento
   *  de PV de cada tipo; o de monstro continua só pro mestre). */
  amount_applied: {
    id_character: number;
    actor_name: string;
    target_label: string;
    amount: number;
    kind: 'damage' | 'heal' | 'temp_hp';
    /** Veio de um lançamento: a mesa mostra no aviso dele (sem aviso avulso). */
    cast_id?: string;
    /** Monstro imune/resistente/vulnerável ao dano (o `amount` já é o que entrou, 1.24.4). */
    defense?: 'immune' | 'resistant' | 'vulnerable' | null;
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
  'monster_action_state_updated',
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
