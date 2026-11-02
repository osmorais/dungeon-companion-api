import {injectable, BindingScope} from '@loopback/core';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import {passwordResetTemplate} from './email-templates/password-reset.template';

const SMTP_TIMEOUT_MS = 15_000;

/**
 * E-mail de recuperação de senha, enviado direto pelo SMTP da Hostinger (conta de e-mail do site).
 * Da 1.12.1 à 1.17.2 passava por um script PHP no site, porque o Render bloqueava SMTP; na VPS
 * (1.17.3) as portas 465/587 saem. Configuração lida sob demanda, a cada envio.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class EmailService {
  /** Substituível nos testes. */
  createTransport: (
    options: SMTPTransport.Options,
  ) => Pick<nodemailer.Transporter, 'sendMail'> = options =>
    nodemailer.createTransport(options);

  async sendPasswordReset(
    email: string,
    token: string,
    username?: string | null,
  ): Promise<void> {
    // Sem fallback: sem a conta o envio não tem como dar certo, então falha aqui com um motivo claro.
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) throw new Error('SMTP_USER/SMTP_PASS não configurados');

    const port = Number(process.env.SMTP_PORT ?? 465);
    const transporter = this.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.hostinger.com',
      port,
      secure: port === 465,
      auth: {user, pass},
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });

    const frontendUrl = (
      process.env.FRONTEND_URL ?? 'https://forjaarcana.com'
    ).replace(/\/+$/, '');
    const link = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? user,
        to: email,
        subject: '🗝️ Redefinição de Senha - Forja Arcana',
        html: passwordResetTemplate(
          link,
          `${frontendUrl}/forja_arcana.png`,
          username,
        ),
      });
    } catch (err) {
      // A mensagem do nodemailer pode trazer o endereço (destinatário recusado); o controller
      // loga o motivo, então só sobem os códigos.
      const {code, responseCode} = err as {
        code?: string;
        responseCode?: number;
      };
      throw new Error(
        `Envio do e-mail falhou (${[code, responseCode].filter(Boolean).join(' ') || 'erro desconhecido'})`,
      );
    }
  }
}
