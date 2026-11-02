import {expect} from '@loopback/testlab';
import {securityId} from '@loopback/security';
import {Request} from '@loopback/rest';
import jwt from 'jsonwebtoken';
import {
  clearCookieOptions,
  cookieOptions,
} from '../../../controllers/auth.controller';
import {JWTStrategy} from '../../../strategies/jwt.strategy';
import {verifyJwtToken} from '../../../strategies/jwt.util';
import {LastAccessService} from '../../../services/last-access.service';

// O registro de último acesso (1.17.8) não interessa aqui.
const noLastAccess = {record: () => {}} as unknown as LastAccessService;

describe('Segurança do login (1.17.5)', () => {
  const env = {...process.env};
  const SECRET = 'segredo-de-teste';

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = {...env};
  });

  const tokenFor = (id: string, algorithm: jwt.Algorithm = 'HS256') =>
    jwt.sign({id, email: `${id}@x.com`}, SECRET, {algorithm});

  const requestWith = (opts: {header?: string; cookie?: string}) =>
    ({
      headers: opts.header ? {authorization: `Bearer ${opts.header}`} : {},
      cookies: opts.cookie ? {token: opts.cookie} : {},
    }) as unknown as Request;

  it('cookie SameSite=Lax (não vai em requisição disparada por outro site) e httpOnly', () => {
    expect(cookieOptions()).to.containDeep({httpOnly: true, sameSite: 'lax'});
    expect(clearCookieOptions()).to.containDeep({
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('com header e cookie, vale o header', async () => {
    const profile = await new JWTStrategy(noLastAccess).authenticate(
      requestWith({
        header: tokenFor('do-header'),
        cookie: tokenFor('do-cookie'),
      }),
    );
    expect(profile?.[securityId]).to.equal('do-header');
  });

  it('só com cookie ainda funciona (reserva)', async () => {
    const profile = await new JWTStrategy(noLastAccess).authenticate(
      requestWith({cookie: tokenFor('do-cookie')}),
    );
    expect(profile?.[securityId]).to.equal('do-cookie');
  });

  it('verificação só aceita HS256', () => {
    expect(verifyJwtToken(tokenFor('u1')).id).to.equal('u1');
    expect(() => verifyJwtToken(tokenFor('u1', 'HS512'))).to.throw(
      /invalid algorithm/,
    );
  });
});
