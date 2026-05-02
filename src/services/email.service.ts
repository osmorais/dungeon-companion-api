import {injectable, BindingScope} from '@loopback/core';
import nodemailer from 'nodemailer';
import {passwordResetTemplate} from './email-templates/password-reset.template';

@injectable({scope: BindingScope.TRANSIENT})
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.hostinger.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    family: 4, // force IPv4 — Render has no IPv6 egress
  });

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://forjaarcana.com';
    const link = `${frontendUrl}/reset-password?token=${token}`;
    const logoUrl = `${frontendUrl}/forja_arcana.png`;

    // if (process.env.NODE_ENV !== 'production') {
    //   console.log(`[EmailService] Password reset link for ${email}: ${link}`);
    //   return;
    // }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: email,
      subject: '🗝️ Redefinição de Senha - Forja Arcana',
      html: passwordResetTemplate(link, logoUrl),
    });
  }
}
