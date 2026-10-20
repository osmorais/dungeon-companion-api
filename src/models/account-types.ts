/* eslint-disable @typescript-eslint/naming-convention */

export interface AccountProfile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: Date | null;
  has_password: boolean;
  google_linked: boolean;
}

export interface UpdateAccountInput {
  full_name?: string | null;
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
}
