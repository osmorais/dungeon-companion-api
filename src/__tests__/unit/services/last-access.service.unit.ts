import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {Request} from '@loopback/rest';
import jwt from 'jsonwebtoken';
import {UserRepository} from '../../../repositories/user.repository';
import {
  LAST_ACCESS_INTERVAL_MS,
  LastAccessService,
} from '../../../services/last-access.service';
import {JWTStrategy} from '../../../strategies/jwt.strategy';

describe('LastAccessService (último acesso, 1.17.8)', () => {
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let service: LastAccessService;
  let clock: number;

  beforeEach(() => {
    users = createStubInstance(UserRepository);
    users.stubs.touchLastAccess.resolves();
    service = new LastAccessService(users);
    clock = 1_000_000;
    service.now = () => clock;
  });

  afterEach(() => sinon.restore());

  it('grava no primeiro acesso e no máximo uma vez por hora por usuário', () => {
    service.record('u1');
    service.record('u1');
    clock += LAST_ACCESS_INTERVAL_MS - 1;
    service.record('u1');
    sinon.assert.calledOnce(users.stubs.touchLastAccess);

    clock += 1;
    service.record('u1');
    sinon.assert.calledTwice(users.stubs.touchLastAccess);
  });

  it('cada usuário tem a sua hora', () => {
    service.record('u1');
    service.record('u2');
    sinon.assert.calledWith(users.stubs.touchLastAccess, 'u1');
    sinon.assert.calledWith(users.stubs.touchLastAccess, 'u2');
  });

  it('falha ao gravar só vai pro log, sem derrubar quem chamou', async () => {
    users.stubs.touchLastAccess.rejects(new Error('banco fora'));
    const log = sinon.stub(console, 'error');
    expect(() => service.record('u1')).to.not.throw();
    await new Promise(resolve => setImmediate(resolve));
    sinon.assert.calledOnce(log);
    expect(log.firstCall.args.join(' ')).to.containEql('banco fora');
  });

  describe('JWTStrategy', () => {
    const env = {...process.env};
    beforeEach(() => {
      process.env.JWT_SECRET = 'segredo-de-teste';
    });
    afterEach(() => {
      process.env = {...env};
    });

    const request = (token: string) =>
      ({
        headers: {authorization: `Bearer ${token}`},
        cookies: {},
      }) as unknown as Request;

    it('registra o acesso de quem passa na autenticação', async () => {
      const record = sinon.stub(service, 'record');
      const token = jwt.sign({id: 'u1', email: 'a@x.com'}, 'segredo-de-teste');
      await new JWTStrategy(service).authenticate(request(token));
      sinon.assert.calledOnceWithExactly(record, 'u1');
    });

    it('token inválido não registra nada', async () => {
      const record = sinon.stub(service, 'record');
      await expect(
        new JWTStrategy(service).authenticate(request('lixo')),
      ).to.be.rejectedWith(/Token inválido/);
      sinon.assert.notCalled(record);
    });
  });
});
