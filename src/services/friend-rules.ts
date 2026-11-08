/* eslint-disable @typescript-eslint/naming-convention */
import {HttpErrors} from '@loopback/rest';
import {PagedList} from '../models/friend-types';
import {USERNAME_MAX_LENGTH} from './username';

/** Depois de uma recusa, o mesmo remetente espera isso pra mandar outra solicitação (anti-spam). */
export const FRIEND_REQUEST_COOLDOWN_DAYS = 30;
export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const SOCIAL_DEFAULT_PAGE_SIZE = 20;
export const SOCIAL_MAX_PAGE_SIZE = 50;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id malformado nunca chega no Postgres (lá viraria erro 500 de conversão pra UUID). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function resolvePaging(
  page?: number,
  pageSize?: number,
): {page: number; pageSize: number} {
  const p = Number.isInteger(page) && page! > 0 ? page! : 1;
  const size =
    Number.isInteger(pageSize) && pageSize! > 0
      ? Math.min(pageSize!, SOCIAL_MAX_PAGE_SIZE)
      : SOCIAL_DEFAULT_PAGE_SIZE;
  return {page: p, pageSize: size};
}

export function toPagedList<T>(
  rows: (T & {total_count: string | number})[],
  page: number,
  pageSize: number,
): PagedList<T> {
  return {
    items: rows.map(({total_count: _total, ...rest}) => rest as unknown as T),
    page,
    pageSize,
    total_count: rows.length ? Number(rows[0].total_count) : 0,
  };
}

/** Termo opcional de filtro (lista de amigos): aparado, cortado no tamanho de um nome. */
export function normalizeFilter(raw: string | undefined | null): string | null {
  const term = (raw ?? '').trim().slice(0, USERNAME_MAX_LENGTH);
  return term.length ? term : null;
}

/** Termo obrigatório da busca de jogadores. */
export function searchTerm(raw: string | undefined | null): string {
  const term = (raw ?? '').trim();
  if (term.length < PLAYER_SEARCH_MIN_LENGTH)
    throw new HttpErrors.UnprocessableEntity(
      `Digite pelo menos ${PLAYER_SEARCH_MIN_LENGTH} letras para buscar`,
    );
  if (term.length > USERNAME_MAX_LENGTH)
    throw new HttpErrors.UnprocessableEntity(
      `A busca pode ter no máximo ${USERNAME_MAX_LENGTH} letras`,
    );
  return term;
}
