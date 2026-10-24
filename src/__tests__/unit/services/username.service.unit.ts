/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {UserRepository} from '../../../repositories/user.repository';
import {
  USERNAME_MAX_LENGTH,
  usernameBase,
  usernameCandidates,
  usernameFormatError,
} from '../../../services/username';
import {UsernameService} from '../../../services/username.service';

describe('nome de usuário — regras', () => {
  it('aceita letras, números, _ e - de 3 a 20 caracteres', () => {
    for (const ok of ['gorak', 'Gorak_Dente', 'ana-3', 'abc', 'a'.repeat(20)])
      expect(usernameFormatError(ok)).to.be.null();
  });

  it('recusa curto, longo, espaço, acento e símbolo', () => {
    for (const bad of ['ab', 'a'.repeat(21), 'gorak dente', 'joão', 'ana!', ''])
      expect(usernameFormatError(bad)).to.be.a.String();
  });

  it('base das sugestões: tira acento, troca espaço por _ e descarta o resto', () => {
    expect(usernameBase('  Gorak Dente-Solto! ')).to.equal('Gorak_Dente-Solto');
    expect(usernameBase('João')).to.equal('Joao');
    expect(usernameBase('a'.repeat(30))).to.have.length(USERNAME_MAX_LENGTH);
  });

  it('candidatos são todos válidos, sem repetição e dentro do tamanho', () => {
    const list = usernameCandidates('Gorak Dente-Solto da Montanha', () => 0.5);
    expect(list.length).to.be.greaterThan(3);
    expect(new Set(list).size).to.equal(list.length);
    for (const c of list) expect(usernameFormatError(c)).to.be.null();
  });

  it('a base limpa vem primeiro; base curta demais ganha complemento', () => {
    expect(usernameCandidates('gorak', () => 0)[0]).to.equal('gorak');
    for (const c of usernameCandidates('!', () => 0))
      expect(usernameFormatError(c)).to.be.null();
  });
});

describe('UsernameService', () => {
  let users: StubbedInstanceWithSinonAccessor<UserRepository>;
  let service: UsernameService;

  beforeEach(() => {
    users = createStubInstance(UserRepository);
    users.stubs.takenUsernames.resolves(new Set());
    service = new UsernameService(users);
  });

  afterEach(() => sinon.restore());

  it('livre: disponível e sem sugestões', async () => {
    const result = await service.check('  gorak ');
    expect(result).to.eql({
      username: 'gorak',
      available: true,
      error: null,
      suggestions: [],
    });
  });

  it('em uso (sem diferenciar maiúsculas): sugere até 3 nomes livres', async () => {
    users.stubs.takenUsernames.callsFake(async (names: string[]) => {
      const taken = new Set(['gorak', 'gorak1']);
      return new Set(names.map(n => n.toLowerCase()).filter(n => taken.has(n)));
    });
    const result = await service.check('Gorak');
    expect(result.available).to.be.false();
    expect(result.error).to.be.null();
    expect(result.suggestions).to.have.length(3);
    expect(result.suggestions).to.not.containEql('gorak1');
    expect(result.suggestions).to.not.containEql('Gorak');
  });

  it('formato inválido: erro e sugestões a partir do que foi digitado, sem ir ao banco antes', async () => {
    const result = await service.check('Gorak Dente');
    expect(result.available).to.be.false();
    expect(result.error).to.match(/letras sem acento/);
    expect(result.suggestions[0]).to.equal('Gorak_Dente');
  });

  it('o próprio nome atual não conta como em uso na troca', async () => {
    await service.check('gorak', 'u1');
    sinon.assert.calledWith(users.stubs.takenUsernames, ['gorak'], 'u1');
  });

  it('assertAvailable: 422 no formato, 409 com sugestões quando em uso', async () => {
    await expect(service.assertAvailable('ab')).to.be.rejectedWith({
      statusCode: 422,
    });
    users.stubs.takenUsernames.resolves(new Set(['gorak']));
    const err = await service.assertAvailable('gorak').catch(e => e);
    expect(err.statusCode).to.equal(409);
    expect(err.details.suggestions).to.be.an.Array();
  });

  it('setUsername grava o nome aparado', async () => {
    expect(await service.setUsername('u1', ' gorak ')).to.equal('gorak');
    sinon.assert.calledWith(users.stubs.setUsername, 'u1', 'gorak');
  });

  it('setUsername: corrida no índice único vira 409, não 500', async () => {
    users.stubs.setUsername.rejects(
      Object.assign(new Error('dup'), {code: '23505'}),
    );
    await expect(service.setUsername('u1', 'gorak')).to.be.rejectedWith({
      statusCode: 409,
    });
  });
});
