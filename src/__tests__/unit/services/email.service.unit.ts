import {expect, sinon} from '@loopback/testlab';
import {EmailService} from '../../../services/email.service';

describe('EmailService (e-mail de recuperação pelo SMTP da Hostinger)', () => {
  const env = {...process.env};
  let service: EmailService;
  let createStub: sinon.SinonStub;
  let sendMailStub: sinon.SinonStub;

  beforeEach(() => {
    process.env.SMTP_USER = 'mensageiro@forjaarcana.com';
    process.env.SMTP_PASS = 'senha-de-teste';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;
    delete process.env.FRONTEND_URL;
    service = new EmailService();
    sendMailStub = sinon.stub().resolves({messageId: 'x'});
    createStub = sinon.stub().returns({sendMail: sendMailStub});
    service.createTransport = createStub;
  });

  afterEach(() => {
    process.env = {...env};
    sinon.restore();
  });

  it('conecta no SMTP da Hostinger por SSL na 465, com a conta do site e timeout', async () => {
    await service.sendPasswordReset('heroi@x.com', 'a'.repeat(64));
    sinon.assert.calledOnce(createStub);
    const options = createStub.firstCall.args[0];
    expect(options).to.containDeep({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {user: 'mensageiro@forjaarcana.com', pass: 'senha-de-teste'},
    });
    expect(options.connectionTimeout).to.be.greaterThan(0);
    expect(options.socketTimeout).to.be.greaterThan(0);
  });

  it('SMTP_HOST e SMTP_PORT trocam o servidor; fora da 465 usa STARTTLS (secure false)', async () => {
    process.env.SMTP_HOST = 'smtp.teste.local';
    process.env.SMTP_PORT = '587';
    await service.sendPasswordReset('heroi@x.com', 'a'.repeat(64));
    expect(createStub.firstCall.args[0]).to.containDeep({
      host: 'smtp.teste.local',
      port: 587,
      secure: false,
    });
  });

  it('manda o e-mail pro endereço pedido, com o link do token e o logo do site', async () => {
    await service.sendPasswordReset('heroi@x.com', 'b'.repeat(64));
    sinon.assert.calledOnce(sendMailStub);
    const mail = sendMailStub.firstCall.args[0];
    expect(mail.to).to.equal('heroi@x.com');
    expect(mail.from).to.equal('mensageiro@forjaarcana.com');
    expect(mail.subject).to.containEql('Redefinição de Senha');
    expect(mail.html).to.containEql(
      `https://forjaarcana.com/reset-password?token=${'b'.repeat(64)}`,
    );
    expect(mail.html).to.containEql('https://forjaarcana.com/forja_arcana.png');
  });

  it('SMTP_FROM troca o remetente; FRONTEND_URL troca o link (sem barra dobrada)', async () => {
    process.env.SMTP_FROM = 'Forja Arcana <mensageiro@forjaarcana.com>';
    process.env.FRONTEND_URL = 'https://teste.local/';
    await service.sendPasswordReset('heroi@x.com', 'c'.repeat(64));
    const mail = sendMailStub.firstCall.args[0];
    expect(mail.from).to.equal('Forja Arcana <mensageiro@forjaarcana.com>');
    expect(mail.html).to.containEql(
      `https://teste.local/reset-password?token=${'c'.repeat(64)}`,
    );
  });

  it('sem SMTP_USER ou SMTP_PASS: falha sem tentar conectar', async () => {
    delete process.env.SMTP_PASS;
    await expect(
      service.sendPasswordReset('heroi@x.com', 'd'.repeat(64)),
    ).to.be.rejectedWith(/SMTP_USER\/SMTP_PASS/);
    sinon.assert.notCalled(createStub);

    process.env.SMTP_PASS = 'senha-de-teste';
    delete process.env.SMTP_USER;
    await expect(
      service.sendPasswordReset('heroi@x.com', 'd'.repeat(64)),
    ).to.be.rejectedWith(/SMTP_USER\/SMTP_PASS/);
    sinon.assert.notCalled(createStub);
  });

  it('falha do SMTP sobe só com os códigos, sem o endereço (o controller loga a mensagem)', async () => {
    const smtpError = Object.assign(
      new Error(
        "Can't send mail - all recipients were rejected: 550 <heroi@x.com>",
      ),
      {code: 'EENVELOPE', responseCode: 550},
    );
    sendMailStub.rejects(smtpError);
    const err = await service
      .sendPasswordReset('heroi@x.com', 'e'.repeat(64))
      .then(
        () => null,
        (e: Error) => e,
      );
    expect(err?.message).to.equal('Envio do e-mail falhou (EENVELOPE 550)');
    expect(err?.message).to.not.containEql('heroi@x.com');
  });

  it('falha sem código: mensagem genérica', async () => {
    sendMailStub.rejects(new Error('heroi@x.com qualquer coisa'));
    await expect(
      service.sendPasswordReset('heroi@x.com', 'f'.repeat(64)),
    ).to.be.rejectedWith('Envio do e-mail falhou (erro desconhecido)');
  });
});
