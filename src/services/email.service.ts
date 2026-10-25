import {injectable, BindingScope} from '@loopback/core';
import crypto from 'crypto';

/** Script no site (Hostinger) que envia o e-mail pelo SMTP de lá — ver recuperar-senha.php no web. */
const DEFAULT_RELAY_URL = 'https://forjaarcana.com/mail/recuperar-senha.php';
const RELAY_TIMEOUT_MS = 15_000;

/** Assinatura que o script confere: HMAC-SHA256 hex de "<timestamp>.<corpo>". */
export function signRelayRequest(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
}

/**
 * E-mail de recuperação de senha (1.12.1). O Render bloqueia SMTP, então a api não envia: chama
 * por HTTPS o script PHP do site (mesmo servidor do e-mail da Hostinger), assinado com o segredo
 * `MAIL_RELAY_SECRET` (o mesmo do forja-mail-config.php de lá). O script monta o link e o texto a
 * partir do token — aqui só vão o endereço e o token.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class EmailService {
  /** Substituível nos testes. */
  fetchFn: typeof fetch = (...args) => fetch(...args);

  async sendPasswordReset(email: string, token: string): Promise<void> {
    // Sem fallback: sem o segredo o script recusa tudo, então falha aqui com um motivo claro.
    const secret = process.env.MAIL_RELAY_SECRET;
    if (!secret) throw new Error('MAIL_RELAY_SECRET não configurado');
    const url = process.env.MAIL_RELAY_URL ?? DEFAULT_RELAY_URL;

    const body = JSON.stringify({email, token});
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forja-Timestamp': timestamp,
        'X-Forja-Signature': signRelayRequest(secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Só o status (o corpo do script tem só um código de erro, sem o endereço).
      throw new Error(`Envio do e-mail falhou (HTTP ${response.status})`);
    }
  }
}
