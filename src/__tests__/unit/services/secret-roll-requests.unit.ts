/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  SECRET_ROLL_TTL_MS,
  SecretRollRequestStore,
} from '../../../services/secret-roll-requests';

describe('SecretRollRequestStore', () => {
  const data = {
    id_game_session: 'gs',
    id_player_session: 'p1',
    id_character: 10,
    user_id: 'u1',
    label: 'Percepção',
  };
  const who = {id_game_session: 'gs', id_character: 10, user_id: 'u1'};

  it('usa o pedido uma vez só', () => {
    const store = new SecretRollRequestStore();
    const request = store.create(data);
    expect(store.consume(request.id, who)).to.containDeep(data);
    expect(store.consume(request.id, who)).to.be.null();
  });

  it('recusa outra sessão, personagem ou usuário (sem gastar o pedido)', () => {
    const store = new SecretRollRequestStore();
    const request = store.create(data);
    expect(
      store.consume(request.id, {...who, id_game_session: 'outra'}),
    ).to.be.null();
    expect(store.consume(request.id, {...who, id_character: 20})).to.be.null();
    expect(store.consume(request.id, {...who, user_id: 'u2'})).to.be.null();
    expect(store.consume(request.id, who)).to.not.be.null();
  });

  it('vence depois do prazo', () => {
    let now = 1_000;
    const store = new SecretRollRequestStore(() => now);
    const request = store.create(data);
    now += SECRET_ROLL_TTL_MS + 1;
    expect(store.consume(request.id, who)).to.be.null();
  });

  it('id desconhecido', () => {
    expect(new SecretRollRequestStore().consume('nada', who)).to.be.null();
  });
});
