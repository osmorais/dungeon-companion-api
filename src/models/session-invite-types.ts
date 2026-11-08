/* eslint-disable @typescript-eslint/naming-convention */
import {SocialUser} from './friend-types';
import {PlayerSession} from './game-session-types';

export type SessionInviteStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface SessionInvite {
  id_session_invite: string;
  id_game_session: string;
  sender_id: string;
  receiver_id: string;
  status: SessionInviteStatus;
  message: string | null;
  created_at: Date;
  expires_at: Date;
  responded_at: Date | null;
}

/** Convite visto por um dos lados — `user` é a outra pessoa (mestre ou convidado). */
export interface SessionInviteView {
  id_session_invite: string;
  id_game_session: string;
  session_name: string;
  message: string | null;
  created_at: Date;
  expires_at: Date;
  user: SocialUser;
}

/** O que o convite precisa saber da mesa (sem dados dos jogadores). */
export interface InviteTargetSession {
  id_game_session: string;
  session_name: string;
  session_code: string;
  user_id: string;
  max_player_quantity: number;
  player_count: number;
}

export interface SendSessionInviteInput {
  id_game_session: string;
  receiver_id: string;
  message?: string | null;
}

export interface AcceptSessionInviteInput {
  id_character: number;
}

export interface AcceptSessionInviteResult {
  id_game_session: string;
  player: PlayerSession;
}
