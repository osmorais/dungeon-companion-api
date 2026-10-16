/* eslint-disable @typescript-eslint/naming-convention */
import {randomUUID} from 'crypto';

/** Pedido de teste secreto do mestre pra um jogador — vale uma vez, por um tempo limitado. */
export interface SecretRollRequest {
  id: string;
  id_game_session: string;
  id_player_session: string;
  id_character: number;
  user_id: string;
  label: string;
  created_at: number;
}

export const SECRET_ROLL_TTL_MS = 30 * 60 * 1000;

/**
 * Pedidos de teste secreto pendentes, em memória (mesma premissa do SessionEventsService: uma
 * instância só da API). Reiniciar o servidor descarta os pendentes — o mestre pede de novo. Não
 * guarda dado pessoal além do id do usuário, e cada pedido some ao ser usado ou ao vencer.
 */
export class SecretRollRequestStore {
  private requests = new Map<string, SecretRollRequest>();

  constructor(private now: () => number = () => Date.now()) {}

  create(
    data: Omit<SecretRollRequest, 'id' | 'created_at'>,
  ): SecretRollRequest {
    this.prune();
    const request = {...data, id: randomUUID(), created_at: this.now()};
    this.requests.set(request.id, request);
    return request;
  }

  /** Usa o pedido (some na hora) se ele existe, não venceu e é desse jogador/personagem/sessão. */
  consume(
    id: string,
    who: {
      id_game_session: string;
      id_character: number | null;
      user_id: string;
    },
  ): SecretRollRequest | null {
    this.prune();
    const request = this.requests.get(id);
    if (
      !request ||
      request.id_game_session !== who.id_game_session ||
      request.id_character !== who.id_character ||
      request.user_id !== who.user_id
    ) {
      return null;
    }
    this.requests.delete(id);
    return request;
  }

  private prune(): void {
    const limit = this.now() - SECRET_ROLL_TTL_MS;
    for (const [id, request] of this.requests) {
      if (request.created_at < limit) this.requests.delete(id);
    }
  }
}

/** Instância única do processo. */
export const secretRollRequests = new SecretRollRequestStore();
