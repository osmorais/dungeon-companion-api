/* eslint-disable @typescript-eslint/naming-convention */

export type CombatStatus = 'rolling_initiative' | 'active' | 'finished';
export type CombatParticipantType = 'player' | 'npc' | 'monster';

export interface CombatEncounter {
  id_combat_encounter: string;
  id_game_session: string;
  status: CombatStatus;
  round_number: number;
  /** Referência estável ao participante da vez — não um índice, pra sobreviver a reordenações
   *  manuais do mestre e a atrasos de turno sem "pular" pra outro participante por engano. */
  current_turn_participant_id: string | null;
  created_at: Date;
}

export interface CombatParticipant {
  id_combat_participant: string;
  id_combat_encounter: string;
  participant_type: CombatParticipantType;
  id_player_session: string | null;
  id_npc_session: string | null;
  id_monster_session: string | null;
  initiative_roll: number | null;
  initiative_total: number | null;
  dex_modifier: number;
  /** Posição na ordem de turnos, atribuída quando o combate fica ativo e editável pelo mestre
   *  depois disso (reordenar). Nulo enquanto ainda se está rolando iniciativa. */
  turn_order: number | null;
  /** true quando esse participante atrasou o próprio turno nesta rodada — some no início da
   *  próxima rodada (ver CombatRepository.clearDelayedFlags). */
  delayed_this_round: boolean;
}

export interface StartEncounterParticipantInput {
  participant_type: CombatParticipantType;
  /** id_player_session, id_npc_session ou id_monster_session, conforme participant_type. */
  id: string;
}

export interface CombatEncounterDetail {
  encounter: CombatEncounter;
  participants: CombatParticipantDetail[];
}

export interface CombatParticipantDetail extends CombatParticipant {
  is_current_turn: boolean;
}

export interface SubmitInitiativeInput {
  rolls: number[];
  modifier: number;
  total: number;
}

export interface MoveParticipantInput {
  id_combat_participant: string;
  direction: 'up' | 'down';
}
