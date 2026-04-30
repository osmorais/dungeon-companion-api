import {injectable, BindingScope} from '@loopback/core';
import nodemailer from 'nodemailer';

@injectable({scope: BindingScope.TRANSIENT})
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const link = `${frontendUrl}/reset-password?token=${token}`;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EmailService] Password reset link for ${email}: ${link}`);
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: email,
      subject: 'Redefinição de senha - Forja Arcana',
      html: `
        <p>Você solicitou a redefinição de sua senha.</p>
        <p>Clique no link abaixo para continuar (válido por 1 hora):</p>
        <a href="${link}">${link}</a>
      `,
    });
  }
}
