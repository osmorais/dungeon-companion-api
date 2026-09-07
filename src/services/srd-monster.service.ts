import {injectable, BindingScope} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';

const SRD_BASE_URL = 'https://www.dnd5eapi.co/api/2014';
const SLUG_PATTERN = /^[a-z0-9-]+$/;

export interface SrdMonsterSummary {
  index: string;
  name: string;
}

/**
 * Fala com a API pública do SRD de D&D 5e (dnd5eapi.co) — a única camada que faz essa chamada
 * externa. O frontend nunca acessa o SRD diretamente, só via nossos endpoints de monster-catalog.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SrdMonsterService {
  async listMonsters(): Promise<SrdMonsterSummary[]> {
    const res = await fetch(`${SRD_BASE_URL}/monsters`);
    if (!res.ok) {
      throw new HttpErrors.BadGateway('Não foi possível consultar o catálogo de monstros do SRD');
    }
    const body = (await res.json()) as {results: {index: string; name: string}[]};
    return body.results.map(r => ({index: r.index, name: r.name}));
  }

  async getMonster(slug: string): Promise<Record<string, unknown>> {
    if (!SLUG_PATTERN.test(slug)) {
      throw new HttpErrors.BadRequest('Identificador de monstro inválido');
    }
    const res = await fetch(`${SRD_BASE_URL}/monsters/${slug}`);
    if (res.status === 404) {
      throw new HttpErrors.NotFound(`Monstro "${slug}" não encontrado no SRD`);
    }
    if (!res.ok) {
      throw new HttpErrors.BadGateway('Não foi possível consultar o SRD');
    }
    return (await res.json()) as Record<string, unknown>;
  }
}
