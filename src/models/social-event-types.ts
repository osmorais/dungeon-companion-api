/* eslint-disable @typescript-eslint/naming-convention */
import {SocialUser} from './friend-types';

/** Presença de quem está conectado (online/ausente/ocupado) — `offline` quando não há conexão. */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';
/** O que o próprio usuário escolhe enquanto está conectado. */
export type ChosenPresenceStatus = Exclude<PresenceStatus, 'offline'>;
/** Disponibilidade pra jogar: separada da presença (dá pra estar online e não querer mesa). */
export type PlayAvailability = 'available' | 'not_available';

export const CHOSEN_PRESENCE_STATUSES: readonly ChosenPresenceStatus[] = [
  'online',
  'away',
  'busy',
];
export const PLAY_AVAILABILITIES: readonly PlayAvailability[] = [
  'available',
  'not_available',
];

/** 'friends': amigos veem a presença; 'nobody': aparece sempre offline. */
export type PresenceVisibility = 'friends' | 'nobody';
export const PRESENCE_VISIBILITIES: readonly PresenceVisibility[] = [
  'friends',
  'nobody',
];

/** Preferências de privacidade do dono da presença (colunas de `users`). */
export interface PresencePrivacy {
  presence_visibility: PresenceVisibility | string;
  show_last_seen: boolean;
  last_access_at: Date | null;
}

export interface MyPresence {
  status: ChosenPresenceStatus;
  availability: PlayAvailability;
  /** Há pelo menos uma aba/dispositivo conectado agora. */
  connected: boolean;
}

export interface UpdatePresenceInput {
  status?: ChosenPresenceStatus;
  availability?: PlayAvailability;
}

/** O que um amigo vê da presença de outro, já com as preferências de privacidade aplicadas. */
export interface FriendPresence {
  presence: PresenceStatus;
  availability: PlayAvailability | null;
  /** Última atividade — só offline e só se o amigo deixou mostrar (`show_last_seen`). */
  last_seen_at: Date | null;
}

export type NotificationType =
  | 'friend_request_received'
  | 'friend_request_accepted'
  | 'session_invite_received'
  | 'session_invite_accepted'
  | 'session_invite_rejected';

export interface NotificationView {
  id_notification: string;
  type: NotificationType;
  /** Só ids pra montar o link — o acesso é conferido de novo ao abrir. */
  payload: Record<string, string>;
  /** Quem causou a notificação (nome lido na hora). */
  actor: SocialUser | null;
  /** Solicitação de amizade que ainda dá pra responder por esta notificação; senão, null. */
  pending_friend_request_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

/**
 * Eventos em tempo real pra um usuário só (`user_id`). O REST continua sendo a fonte de verdade:
 * o site usa o evento pra atualizar contadores e recarregar listas.
 */
export type SocialEvent =
  | {
      type: 'notification_created';
      user_id: string;
      notification: NotificationView;
    }
  | {
      type: 'social_changed';
      user_id: string;
      scope: 'friends' | 'requests' | 'blocked' | 'invites';
    }
  | {
      type: 'presence_updated';
      user_id: string;
      friend: {id: string} & FriendPresence;
    };
