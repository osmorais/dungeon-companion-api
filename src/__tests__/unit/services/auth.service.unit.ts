/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {AuthService, hashResetToken} from '../../../services/auth.service';
import {UserRepository} from '../../../repositories/user.repository';
import {User} from '../../../models/user.model';

describe('AuthService — redefinição de senha', () => {
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let service: AuthService;
  const user = {id: 'u1', email: 'a@x.com'} as User;

  beforeEach(() => {
    users = createStubInstance(UserRepository);
    service = new AuthService(users);
  });

  afterEach(() => sinon.restore());

  it('hashResetToken é SHA-256 em hex, determinístico', () => {
    expect(hashResetToken('abc')).to.equal(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('esqueci a senha: e-mail desconhecido não gera token', async () => {
    users.stubs.findByEmail.resolves(undefined);
    expect(await service.forgotPassword('x@x.com')).to.equal('');
    expect(users.stubs.updateResetToken.called).to.be.false();
  });

  it('esqueci a senha: devolve o token puro (vai no e-mail) mas grava só o hash', async () => {
    users.stubs.findByEmail.resolves(user);
    const token = await service.forgotPassword('a@x.com');
    expect(token).to.match(/^[0-9a-f]{64}$/);
    const [id, stored, expires] = users.stubs.updateResetToken.firstCall.args;
    expect(id).to.equal('u1');
    expect(stored).to.equal(hashResetToken(token));
    expect(stored).to.not.equal(token);
    expect((expires as Date).getTime()).to.be.greaterThan(Date.now());
  });

  it('redefinir: procura e consome pelo hash do token recebido', async () => {
    users.stubs.findByResetToken.resolves(user);
    await service.resetPassword('tok', 'NovaSenha123');
    sinon.assert.calledWith(
      users.stubs.findByResetToken,
      hashResetToken('tok'),
    );
    const [tokenHash, passwordHash] = users.stubs.resetPassword.firstCall.args;
    expect(tokenHash).to.equal(hashResetToken('tok'));
    expect(passwordHash).to.not.equal('NovaSenha123');
  });

  it('redefinir com token inválido/expirado', async () => {
    users.stubs.findByResetToken.resolves(undefined);
    await expect(
      service.resetPassword('tok', 'NovaSenha123'),
    ).to.be.rejectedWith(/Token inválido ou expirado/);
    expect(users.stubs.resetPassword.called).to.be.false();
  });
});
