import {expect} from '@loopback/testlab';
import {Request} from '@loopback/rest';
import {
  clientIp,
  RATE_LIMITS,
  RateLimitService,
} from '../../../services/rate-limit.service';

function request(
  headers: Record<string, string>,
  remoteAddress = '10.0.0.1',
): Request {
  return {headers, socket: {remoteAddress}} as unknown as Request;
}

describe('RateLimitService', () => {
  let now: number;
  let limiter: RateLimitService;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new RateLimitService();
    limiter.now = () => now;
  });

  function exhaust(key: string) {
    for (let i = 0; i < RATE_LIMITS.loginEmail.max; i++) {
      limiter.consume('loginEmail', key);
    }
  }

  it('aceita até o máximo da janela e recusa a seguinte com 429', () => {
    exhaust('a@x.com');
    expect(() => limiter.consume('loginEmail', 'a@x.com')).to.throw(
      /Muitas tentativas. Tente de novo em 15 minutos/,
    );
    try {
      limiter.consume('loginEmail', 'a@x.com');
    } catch (err) {
      expect((err as {statusCode: number}).statusCode).to.equal(429);
    }
  });

  it('libera de novo quando a janela vence', () => {
    exhaust('a@x.com');
    now += RATE_LIMITS.loginEmail.windowMs;
    expect(() => limiter.consume('loginEmail', 'a@x.com')).to.not.throw();
  });

  it('mensagem conta os minutos restantes (mínimo 1, singular)', () => {
    exhaust('a@x.com');
    now += RATE_LIMITS.loginEmail.windowMs - 30_000;
    expect(() => limiter.consume('loginEmail', 'a@x.com')).to.throw(
      /em 1 minuto\./,
    );
  });

  it('chaves e limites são independentes; e-mail ignora maiúsculas/espaços', () => {
    exhaust(' A@X.com ');
    expect(() => limiter.consume('loginEmail', 'a@x.com')).to.throw(/Muitas/);
    expect(() => limiter.consume('loginEmail', 'b@x.com')).to.not.throw();
    expect(() => limiter.consume('loginIp', 'a@x.com')).to.not.throw();
  });

  it('chave vazia não conta nem bloqueia', () => {
    for (let i = 0; i < 50; i++) {
      limiter.consume('signupIp', '');
      limiter.consume('signupIp', undefined);
    }
  });

  it('limites configurados das rotas sensíveis', () => {
    expect(RATE_LIMITS.loginEmail).to.eql({max: 10, windowMs: 15 * 60_000});
    expect(RATE_LIMITS.signupIp.max).to.equal(5);
    expect(RATE_LIMITS.forgotPasswordEmail.max).to.equal(3);
    expect(RATE_LIMITS.accountDeleteUser.max).to.equal(5);
  });
});

describe('clientIp', () => {
  it('prefere o cabeçalho da Cloudflare', () => {
    expect(
      clientIp(
        request({
          'cf-connecting-ip': '200.1.1.1',
          'x-forwarded-for': '6.6.6.6, 9.9.9.9',
        }),
      ),
    ).to.equal('200.1.1.1');
  });

  it('sem Cloudflare usa o ÚLTIMO x-forwarded-for (o da esquerda pode ser forjado)', () => {
    expect(
      clientIp(request({'x-forwarded-for': '6.6.6.6, 200.2.2.2'})),
    ).to.equal('200.2.2.2');
  });

  it('sem cabeçalhos usa o IP da conexão', () => {
    expect(clientIp(request({}, '127.0.0.1'))).to.equal('127.0.0.1');
  });
});
