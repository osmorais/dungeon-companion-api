import {BindingScope, injectable, service} from '@loopback/core';
import {UserRepository} from '../repositories/user.repository';

/** Grava no máximo uma vez por hora por usuário: basta pra contar ativos por dia/semana/mês. */
export const LAST_ACCESS_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Último acesso do usuário (`users.last_access_at`, 1.17.8), pra saber quantas pessoas usam o
 * site. Chamado a cada requisição autenticada (`JWTStrategy`); a memória de quando cada um foi
 * gravado evita um UPDATE por requisição (zera no restart: no pior caso grava uma vez a mais).
 * Falha ao gravar só vai pro log — nunca derruba a requisição.
 */
@injectable({scope: BindingScope.SINGLETON})
export class LastAccessService {
  private readonly lastWrite = new Map<string, number>();
  /** Substituível nos testes. */
  now: () => number = () => Date.now();

  constructor(
    @service(UserRepository) private userRepository: UserRepository,
  ) {}

  record(userId: string): void {
    const now = this.now();
    const last = this.lastWrite.get(userId);
    if (last !== undefined && now - last < LAST_ACCESS_INTERVAL_MS) return;
    this.lastWrite.set(userId, now);
    this.userRepository.touchLastAccess(userId).catch(err => {
      console.error(
        '[last-access] não gravou o último acesso:',
        (err as Error).message,
      );
    });
  }
}
