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
import {UsernameService} from '../../../services/username.service';

describe('AuthService — redefinição de senha', () => {
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let service: AuthService;
  const user = {id: 'u1', email: 'a@x.com'} as User;

  beforeEach(() => {
    users = createStubInstance(UserRepository);
    service = new AuthService(users, createStubInstance(UsernameService));
    // bcrypt de verdade leva ~1 s por hash e às vezes estourava o tempo do teste.
    sinon.stub(service, 'hashPassword').resolves('hash');
  });

  afterEach(() => sinon.restore());

  it('hashResetToken é SHA-256 em hex, determinístico', () => {
    expect(hashResetToken('abc')).to.equal(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('esqueci a senha: limpa os tokens vencidos antes (mesmo pra e-mail desconhecido)', async () => {
    users.stubs.findByEmail.resolves(undefined);
    await service.forgotPassword('x@x.com');
    sinon.assert.calledOnce(users.stubs.clearExpiredResetTokens);
    users.stubs.findByEmail.resolves(user);
    await service.forgotPassword('a@x.com');
    sinon.assert.callOrder(
      users.stubs.clearExpiredResetTokens,
      users.stubs.updateResetToken,
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

describe('AuthService — cadastro com nome de usuário', () => {
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let usernames: StubbedInstanceWithSinonAccessor<UsernameService>;
  let service: AuthService;

  beforeEach(() => {
    users = createStubInstance(UserRepository);
    usernames = createStubInstance(UsernameService);
    usernames.stubs.assertAvailable.resolves('gorak');
    users.stubs.findByEmail.resolves(undefined);
    users.stubs.create.resolves({
      id: 'u1',
      email: 'a@x.com',
      username: 'gorak',
    });
    service = new AuthService(users, usernames);
    // bcrypt de verdade leva ~1 s por hash e às vezes estourava o tempo do teste.
    sinon.stub(service, 'hashPassword').resolves('hash');
  });

  afterEach(() => sinon.restore());

  it('cria a conta com o nome de usuário e devolve ele (sem nome real)', async () => {
    const {user} = await service.signup('a@x.com', 'senha-forte', ' gorak ');
    sinon.assert.calledWith(usernames.stubs.assertAvailable, ' gorak ');
    expect(users.stubs.create.firstCall.args[0]).to.containEql({
      email: 'a@x.com',
      username: 'gorak',
    });
    expect(user).to.eql({id: 'u1', email: 'a@x.com', username: 'gorak'});
  });

  it('nome em uso: não cria a conta', async () => {
    usernames.stubs.assertAvailable.rejects(
      Object.assign(new Error('em uso'), {statusCode: 409}),
    );
    await expect(
      service.signup('a@x.com', 'senha-forte', 'gorak'),
    ).to.be.rejectedWith({statusCode: 409});
    expect(users.stubs.create.called).to.be.false();
  });

  it('corrida no índice único ao gravar vira 409 com sugestões', async () => {
    users.stubs.create.rejects(
      Object.assign(new Error('dup'), {code: '23505'}),
    );
    usernames.stubs.check.resolves({
      username: 'gorak',
      available: false,
      error: null,
      suggestions: ['gorak1'],
    });
    const err = await service
      .signup('a@x.com', 'senha-forte', 'gorak')
      .catch(e => e);
    expect(err.statusCode).to.equal(409);
    expect(err.details.suggestions).to.eql(['gorak1']);
  });

  it('/auth/me devolve o nome de usuário atual (null = ainda precisa escolher)', async () => {
    users.stubs.findById.resolves({id: 'u1', email: 'a@x.com', username: null});
    expect(await service.me('u1')).to.eql({
      id: 'u1',
      email: 'a@x.com',
      username: null,
    });
  });
});
