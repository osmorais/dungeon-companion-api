/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {UserRepository} from '../repositories/user.repository';
import {
  USERNAME_SUGGESTION_COUNT,
  usernameCandidates,
  usernameFormatError,
} from './username';

export interface UsernameCheck {
  username: string;
  available: boolean;
  /** Problema de formato (nome inválido), se houver. */
  error: string | null;
  /** Nomes livres parecidos — só quando o pedido não está disponível. */
  suggestions: string[];
}

/** Erro do Postgres pra violação de índice único (corrida entre conferir e gravar). */
const UNIQUE_VIOLATION = '23505';

/** Conferência e gravação do nome de usuário (cadastro, escolha no primeiro acesso, Minha Conta). */
@injectable({scope: BindingScope.TRANSIENT})
export class UsernameService {
  constructor(
    @inject('repositories.UserRepository')
    private userRepository: UserRepository,
  ) {}

  /** `exceptUserId`: quem está trocando o próprio nome (o nome atual dele conta como livre). */
  async check(raw: string, exceptUserId?: string): Promise<UsernameCheck> {
    const username = (raw ?? '').trim();
    const error = usernameFormatError(username);
    if (!error) {
      const taken = await this.userRepository.takenUsernames(
        [username],
        exceptUserId,
      );
      if (!taken.has(username.toLowerCase()))
        return {username, available: true, error: null, suggestions: []};
    }
    return {
      username,
      available: false,
      error,
      suggestions: await this.suggest(username, exceptUserId),
    };
  }

  /** Valida (422) e confere se está livre (409); devolve o nome aparado. */
  async assertAvailable(raw: string, exceptUserId?: string): Promise<string> {
    const result = await this.check(raw, exceptUserId);
    if (result.error) throw new HttpErrors.UnprocessableEntity(result.error);
    if (!result.available) throw takenError(result.suggestions);
    return result.username;
  }

  async setUsername(userId: string, raw: string): Promise<string> {
    const username = await this.assertAvailable(raw, userId);
    try {
      await this.userRepository.setUsername(userId, username);
    } catch (err) {
      if (isUniqueViolation(err))
        throw takenError(await this.suggest(username, userId));
      throw err;
    }
    return username;
  }

  private async suggest(raw: string, exceptUserId?: string): Promise<string[]> {
    const candidates = usernameCandidates(raw);
    const taken = await this.userRepository.takenUsernames(
      candidates,
      exceptUserId,
    );
    return candidates
      .filter(c => !taken.has(c.toLowerCase()))
      .slice(0, USERNAME_SUGGESTION_COUNT);
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return (err as {code?: string} | null)?.code === UNIQUE_VIOLATION;
}

/** 409 com as sugestões em `details`, pro web mostrar sem precisar perguntar de novo. */
export function takenError(suggestions: string[]): HttpErrors.HttpError {
  const error = new HttpErrors.Conflict('Esse nome de usuário já está em uso');
  Object.assign(error, {details: {suggestions}});
  return error;
}
