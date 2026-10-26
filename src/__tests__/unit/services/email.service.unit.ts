import {expect, sinon} from '@loopback/testlab';
import crypto from 'crypto';
import {EmailService, signRelayRequest} from '../../../services/email.service';

describe('EmailService (e-mail de recuperação pelo script da Hostinger)', () => {
  const env = {...process.env};
  let service: EmailService;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    process.env.MAIL_RELAY_SECRET = 'segredo-de-teste';
    delete process.env.MAIL_RELAY_URL;
    service = new EmailService();
    fetchStub = sinon
      .stub()
      .resolves(new Response('{"ok":true}', {status: 200}));
    service.fetchFn = fetchStub as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = {...env};
    sinon.restore();
  });

  it('assinatura: HMAC-SHA256 hex de "<timestamp>.<corpo>" (o mesmo que o PHP confere)', () => {
    const sig = signRelayRequest('k', '1700000000', '{"a":1}');
    expect(sig).to.match(/^[a-f0-9]{64}$/);
    expect(sig).to.equal(
      crypto
        .createHmac('sha256', 'k')
        .update('1700000000.{"a":1}')
        .digest('hex'),
    );
    expect(signRelayRequest('k', '1700000001', '{"a":1}')).to.not.equal(sig);
  });

  it('manda só e-mail e token, assinados, pro script do site', async () => {
    await service.sendPasswordReset('heroi@x.com', 'a'.repeat(64));
    sinon.assert.calledOnce(fetchStub);
    const [url, init] = fetchStub.firstCall.args as [string, RequestInit];
    expect(url).to.equal('https://forjaarcana.com/mail/recuperar-senha.php');
    expect(init.method).to.equal('POST');
    expect(JSON.parse(init.body as string)).to.eql({
      email: 'heroi@x.com',
      token: 'a'.repeat(64),
    });
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Forja-Signature']).to.equal(
      signRelayRequest(
        'segredo-de-teste',
        headers['X-Forja-Timestamp'],
        init.body as string,
      ),
    );
    const age = Date.now() / 1000 - Number(headers['X-Forja-Timestamp']);
    expect(age).to.be.within(0, 5);
  });

  it('MAIL_RELAY_URL troca o endereço do script', async () => {
    process.env.MAIL_RELAY_URL = 'https://teste.local/mail.php';
    await service.sendPasswordReset('heroi@x.com', 'b'.repeat(64));
    expect(fetchStub.firstCall.args[0]).to.equal(
      'https://teste.local/mail.php',
    );
  });

  it('sem MAIL_RELAY_SECRET: falha sem chamar o script', async () => {
    delete process.env.MAIL_RELAY_SECRET;
    await expect(
      service.sendPasswordReset('heroi@x.com', 'c'.repeat(64)),
    ).to.be.rejectedWith(/MAIL_RELAY_SECRET/);
    sinon.assert.notCalled(fetchStub);
  });

  it('script respondeu erro: falha com o status, sem o endereço na mensagem', async () => {
    fetchStub.resolves(new Response('{"error":"smtp"}', {status: 502}));
    const err = await service
      .sendPasswordReset('heroi@x.com', 'd'.repeat(64))
      .then(
        () => null,
        (e: Error) => e,
      );
    expect(err?.message).to.equal('Envio do e-mail falhou (HTTP 502)');
    expect(err?.message).to.not.containEql('heroi@x.com');
  });
});
