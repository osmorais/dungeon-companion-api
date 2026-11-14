import {expect, sinon} from '@loopback/testlab';
import {SessionSocketGateway} from '../../../services/session-socket.gateway';
import {SessionEventsService} from '../../../services/session-events.service';
import {GameSessionService} from '../../../services/game-session.service';

describe('SessionSocketGateway — conexão na mesa', () => {
  function fakeSocket(handshake: {auth?: object; query?: object}) {
    return {
      handshake: {auth: {}, query: {}, ...handshake},
      data: {userId: 'dm'},
      join: sinon.stub().resolves(),
      disconnect: sinon.stub(),
    };
  }

  function gateway() {
    const sessions = {
      hasSessionAccess: sinon.stub().resolves(true),
      isSessionOwner: sinon.stub().resolves(true),
    };
    const gw = new SessionSocketGateway(
      new SessionEventsService(),
      sessions as unknown as GameSessionService,
    );
    const connect = (socket: unknown) =>
      (
        gw as unknown as {onConnection: (s: unknown) => Promise<void>}
      ).onConnection(socket);
    return {connect, sessions};
  }

  it('sessionId pelo auth (conexão reaproveitada, sem query): entra na mesa e na sala do mestre', async () => {
    const {connect, sessions} = gateway();
    const socket = fakeSocket({auth: {token: 't', sessionId: 'gs'}, query: {}});
    await connect(socket);
    expect(sessions.hasSessionAccess.calledWith('gs', 'dm')).to.be.true();
    expect(socket.join.args.map(a => a[0])).to.eql([
      'session:gs',
      'session:gs:user:dm',
      'session:gs:dm',
    ]);
    expect(socket.disconnect.called).to.be.false();
  });

  it('sessionId pela query (cliente antigo) continua valendo', async () => {
    const {connect} = gateway();
    const socket = fakeSocket({query: {sessionId: 'gs'}});
    await connect(socket);
    expect(socket.join.calledWith('session:gs')).to.be.true();
  });

  it('sem sessionId nenhum: desconecta', async () => {
    const {connect} = gateway();
    const socket = fakeSocket({});
    await connect(socket);
    expect(socket.disconnect.calledWith(true)).to.be.true();
    expect(socket.join.called).to.be.false();
  });
});
