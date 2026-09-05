/* eslint-disable @typescript-eslint/naming-convention */

export type CombatStatus = 'rolling_initiative' | 'active' | 'finished';
export type CombatParticipantType = 'player' | 'npc';

export interface CombatEncounter {
  id_combat_encounter: string;
  id_game_session: string;
  status: CombatStatus;
  round_number: number;
  current_turn_index: number;
  created_at: Date;
}

export interface CombatParticipant {
  id_combat_participant: string;
  id_combat_encounter: string;
  participant_type: CombatParticipantType;
  id_player_session: string | null;
  id_npc_session: string | null;
  initiative_roll: number | null;
  initiative_total: number | null;
  dex_modifier: number;
}

export interface StartEncounterParticipantInput {
  participant_type: CombatParticipantType;
  /** id_player_session (jogador) ou id_npc_session (NPC), conforme participant_type. */
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
