/* eslint-disable @typescript-eslint/naming-convention */
import {PresenceVisibility} from './social-event-types';

export interface AccountProfile {
  id: string;
  email: string;
  full_name: string | null;
  /** Nome de usuário (1.9.0) — aparece pra mesa e no ranking. `null` até a pessoa escolher. */
  username: string | null;
  created_at: Date | null;
  has_password: boolean;
  google_linked: boolean;
  /** Aparece no ranking global (padrão sim; o usuário pode sair em /conta). */
  show_in_ranking: boolean;
  /** Último acesso (1.17.8), gravado no máximo uma vez por hora. `null` antes do primeiro. */
  last_access_at: Date | null;
  /** Amigos (1.18.0): aparece na busca de jogadores por parte do nome (senão, só pelo nome exato). */
  discoverable: boolean;
  /** Amigos (1.18.0): outros jogadores podem enviar solicitação de amizade. */
  accept_friend_requests: boolean;
  /** Amigos (1.18.0): 'friends' — amigos veem se está online; 'nobody' — aparece offline. */
  presence_visibility: PresenceVisibility;
  /** Amigos (1.18.0): amigos veem a última atividade quando está offline. */
  show_last_seen: boolean;
}

export interface UpdateAccountInput {
  full_name?: string | null;
  username?: string;
  show_in_ranking?: boolean;
  discoverable?: boolean;
  accept_friend_requests?: boolean;
  presence_visibility?: PresenceVisibility;
  show_last_seen?: boolean;
}

/**
 * Confirmação da exclusão: o e-mail da conta digitado de novo (sempre) + a senha atual (só pra
 * conta que tem senha — conta criada só com o Google não tem).
 */
export interface DeleteAccountInput {
  confirm_email: string;
  password?: string;
}

export interface ExportedDmSession {
  id_game_session: string;
  session_name: string;
  session_code: string;
  max_player_quantity: number;
  dm_name: string;
  created_at: Date;
  monsters: unknown[];
  /** Imagens de referência que o mestre subiu na sessão. */
  reference_images: unknown[];
  /** Anotações privadas do mestre (Quadro do Mestre). */
  dm_notes: string | null;
}

export interface ExportedParticipation {
  id_player_session: string;
  id_game_session: string;
  session_name: string;
  id_character: number | null;
  player_name: string;
  inventory: unknown[];
  /** Companheiro Animal do ranger nesta mesa (besta, nome e PV), ou `null`. */
  animal_companion: {slug: string; name: string; hp_current: number} | null;
}

export interface ExportedCatalogMonster {
  id_monster_catalog: string;
  monster_api_slug: string;
  custom_name: string | null;
  hp_max: number;
  ac: number;
  image_url: string | null;
  created_at: Date;
}

export interface ExportedRoll {
  id_game_session: string;
  id_character: number;
  actor_name: string;
  roll_type: string;
  label: string;
  dice_notation: string;
  rolls: number[];
  advantage_state: string;
  modifier: number;
  total: number;
  created_at: Date;
}

/** Tudo que o usuário forneceu ou gerou no app — portabilidade (LGPD art. 18, V). */
export interface AccountExport {
  exported_at: string;
  account: AccountProfile;
  characters: object[];
  sessions_as_dm: ExportedDmSession[];
  sessions_as_player: ExportedParticipation[];
  monster_catalog: ExportedCatalogMonster[];
  rolls: ExportedRoll[];
  /** Estatísticas do ranking dos personagens do usuário, por sessão. */
  ranking_stats: object[];
  /** Amigos (1.18.0): amizades, solicitações (enviadas e recebidas) e bloqueios do usuário. */
  social: ExportedSocial;
}

/**
 * Relações do usuário com outros jogadores. Da outra pessoa vai só o nome de usuário — que o
 * próprio usuário já vê no site —, nunca e-mail ou id.
 */
export interface ExportedSocial {
  friends: {username: string | null; friends_since: Date}[];
  friend_requests: {
    direction: 'sent' | 'received';
    username: string | null;
    status: string;
    created_at: Date;
    responded_at: Date | null;
  }[];
  blocked: {username: string | null; blocked_at: Date}[];
  notifications: {
    type: string;
    username: string | null;
    created_at: Date;
    read_at: Date | null;
  }[];
  /** Convites para mesa enviados (como mestre) e recebidos, com o recado. */
  session_invites: {
    direction: 'sent' | 'received';
    session_name: string;
    username: string | null;
    status: string;
    message: string | null;
    created_at: Date;
    responded_at: Date | null;
  }[];
}
