import {Client, expect} from '@loopback/testlab';
import {DungeonCompanionApiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('PingController', () => {
  let app: DungeonCompanionApiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('invokes GET /ping', async () => {
    const res = await client
      .get('/ping')
      .set('Authorization', 'Bearer segredo')
      .expect(200);
    expect(res.body.status).to.equal('ok');
    // Não ecoa os headers da requisição (1.17.5).
    expect(JSON.stringify(res.body)).to.not.containEql('segredo');
  });
});
