import {service} from '@loopback/core';
import {get, response} from '@loopback/rest';
import {authenticate} from '@loopback/authentication';
import {RankingService} from '../services/ranking.service';
import {RankingResponse} from '../models/ranking-types';

@authenticate('jwt')
export class RankingController {
  constructor(
    @service(RankingService)
    private rankingService: RankingService,
  ) {}

  @get('/api/ranking')
  @response(200, {
    description: 'Ranking global por categoria (dano, cura, críticos...)',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getRanking(): Promise<RankingResponse> {
    return this.rankingService.getRanking();
  }
}
