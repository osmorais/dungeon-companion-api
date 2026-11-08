/* eslint-disable @typescript-eslint/naming-convention */
import {FriendPresence} from './social-event-types';

export type FriendRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

export interface FriendRequest {
  id_friend_request: string;
  sender_id: string;
  receiver_id: string;
  status: FriendRequestStatus;
  created_at: Date;
  responded_at: Date | null;
}

/**
 * O que um usuário pode ver de outro: só o id e o nome de usuário. Nunca e-mail ou outro dado da
 * conta.
 */
export interface SocialUser {
  id: string;
  username: string;
}

/** Amigo como a API devolve: presença já filtrada pelas preferências de privacidade dele. */
export interface Friend extends SocialUser, FriendPresence {
  friends_since: Date;
}

/** Linha do banco antes de aplicar a presença (o service monta o `Friend`). */
export interface FriendRow extends SocialUser {
  friends_since: Date;
  presence_visibility: string;
  show_last_seen: boolean;
  last_access_at: Date | null;
}

/** Solicitação vista por um dos lados — `user` é a outra pessoa (remetente ou destinatário). */
export interface FriendRequestView {
  id_friend_request: string;
  created_at: Date;
  user: SocialUser;
}

export interface BlockedUser extends SocialUser {
  blocked_at: Date;
}

/**
 * Relação de quem busca com o jogador encontrado. `blocked` só aparece quando foi quem busca
 * que bloqueou — quem foi bloqueado nem acha quem o bloqueou.
 */
export type PlayerRelationship =
  | 'none'
  | 'friend'
  | 'request_sent'
  | 'request_received'
  | 'blocked';

export interface PlayerSearchResult extends SocialUser {
  relationship: PlayerRelationship;
  /** A solicitação pendente entre os dois, quando `relationship` é `request_*`. */
  id_friend_request: string | null;
}

export interface PagedList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total_count: number;
}

export interface SendFriendRequestInput {
  receiver_id: string;
}

/**
 * `pending`: solicitação criada. `accepted`: já havia uma solicitação do outro lado — enviar
 * vira aceitar a existente, e a amizade nasce na hora.
 */
export interface SendFriendRequestResult {
  status: 'pending' | 'accepted';
  request: FriendRequest;
}

export interface FriendRequestCounts {
  received: number;
  sent: number;
}
