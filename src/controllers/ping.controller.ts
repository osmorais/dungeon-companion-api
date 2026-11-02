import {get, response, ResponseObject} from '@loopback/rest';

/**
 * OpenAPI response for ping()
 */
const PING_RESPONSE: ResponseObject = {
  description: 'Ping Response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        title: 'PingResponse',
        properties: {
          status: {type: 'string'},
          date: {type: 'string'},
        },
      },
    },
  },
};

/**
 * Teste de vida da api (deploy, monitoramento, manual do servidor). Até a 1.17.4 devolvia também
 * a url e todos os headers da requisição — inclusive Cookie e Authorization, que um script no site
 * conseguiria ler por aqui.
 */
export class PingController {
  @get('/ping')
  @response(200, PING_RESPONSE)
  ping(): object {
    return {status: 'ok', date: new Date()};
  }
}
