import {injectable, BindingScope, service} from '@loopback/core';
import {RankingRepository} from '../repositories/ranking.repository';
import {RankingResponse} from '../models/ranking-types';
import {RANKING_CATEGORIES, RANKING_LIMIT} from './ranking-stats';

/** Ranking global (1.7.0): os maiores feitos de cada categoria, de todas as mesas. */
@injectable({scope: BindingScope.TRANSIENT})
export class RankingService {
  constructor(
    @service(RankingRepository)
    private repository: RankingRepository,
  ) {}

  async getRanking(): Promise<RankingResponse> {
    const categories = await Promise.all(
      RANKING_CATEGORIES.map(async def => ({
        key: def.key,
        title: def.title,
        description: def.description,
        unit: def.unit,
        entries: await this.repository.topFor(def, RANKING_LIMIT),
      })),
    );
    return {categories};
  }
}
