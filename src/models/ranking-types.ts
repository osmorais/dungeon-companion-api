/* eslint-disable @typescript-eslint/naming-convention */

/** Um feito no ranking: personagem numa sessão. */
export interface RankingEntry {
  position: number;
  id_character: number;
  character_name: string;
  avatar_preset: unknown;
  /** Nome de jogador que ele usou naquela mesa (o apelido digitado ao entrar). */
  player_name: string;
  session_name: string;
  value: number;
}

export interface RankingCategory {
  key: string;
  title: string;
  description: string;
  unit: string;
  entries: RankingEntry[];
}

export interface RankingResponse {
  categories: RankingCategory[];
}
