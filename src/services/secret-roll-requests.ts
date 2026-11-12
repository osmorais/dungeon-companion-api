/* eslint-disable @typescript-eslint/naming-convention */
import {randomUUID} from 'crypto';

/**
 * Pedido de rolagem pra um jogador: teste secreto do mestre ou resistência contra uma magia/ação
 * (quem lançou marca os atingidos). Vale por um tempo limitado.
 */
export interface SecretRollRequest {
  id: string;
  id_game_session: string;
  id_player_session: string;
  id_character: number;
  user_id: string;
  label: string;
  /** CD da resistência: fica só aqui — o jogador recebe só se passou ou falhou. */
  dc: number | null;
  /** Teste secreto (rolagem oculta, só o mestre vê) ou resistência pública. */
  secret: boolean;
  /** Rolagens já registradas pra este pedido. */
  answers: number;
  created_at: number;
}

export const SECRET_ROLL_TTL_MS = 30 * 60 * 1000;
/** A rolagem e até duas de novo pelo mesmo pedido (Sortudo, Ponto de Sorte, Indomável). */
export const MAX_ANSWERS_PER_REQUEST = 3;

/**
 * Pedidos de teste secreto pendentes, em memória (mesma premissa do SessionEventsService: uma
 * instância só da API). Reiniciar o servidor descarta os pendentes — o mestre pede de novo. Não
 * guarda dado pessoal além do id do usuário, e cada pedido some ao ser usado ou ao vencer.
 */
export class SecretRollRequestStore {
  private requests = new Map<string, SecretRollRequest>();

  constructor(private now: () => number = () => Date.now()) {}

  create(
    data: Omit<SecretRollRequest, 'id' | 'created_at' | 'answers'>,
  ): SecretRollRequest {
    this.prune();
    const request = {
      ...data,
      id: randomUUID(),
      answers: 0,
      created_at: this.now(),
    };
    this.requests.set(request.id, request);
    return request;
  }

  /**
   * Registra uma rolagem do pedido se ele existe, não venceu, é desse jogador/personagem/sessão e
   * ainda cabe rolar de novo (some ao chegar no limite).
   */
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
    request.answers += 1;
    if (request.answers >= MAX_ANSWERS_PER_REQUEST) this.requests.delete(id);
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
