import {injectable, BindingScope} from '@loopback/core';
import {HttpErrors, Request} from '@loopback/rest';

export interface RateLimitRule {
  /** Quantas tentativas cabem na janela. */
  max: number;
  /** Tamanho da janela, em ms. */
  windowMs: number;
}

const MINUTE = 60 * 1000;

/**
 * Limites por rota sensível (LGPD art. 46 — força bruta, envio de e-mail em massa). Chaves por
 * IP e, onde faz sentido, por e-mail/usuário (não depende do IP, que pode variar).
 */
export const RATE_LIMITS = {
  loginIp: {max: 20, windowMs: 15 * MINUTE},
  loginEmail: {max: 10, windowMs: 15 * MINUTE},
  signupIp: {max: 5, windowMs: 60 * MINUTE},
  forgotPasswordIp: {max: 5, windowMs: 60 * MINUTE},
  forgotPasswordEmail: {max: 3, windowMs: 60 * MINUTE},
  resetPasswordIp: {max: 10, windowMs: 15 * MINUTE},
  googleIp: {max: 30, windowMs: 15 * MINUTE},
  // Conferência do nome de usuário enquanto a pessoa digita (cadastro): folgado pra digitação,
  // mas trava varredura da lista de nomes.
  usernameCheckIp: {max: 120, windowMs: 15 * MINUTE},
  accountDeleteUser: {max: 5, windowMs: 15 * MINUTE},
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Contador em memória, janela fixa. Suficiente pra uma instância só (Render); com várias
 * instâncias cada uma contaria separado — aí precisaria de um store compartilhado (ex.: Redis).
 * Reiniciar o servidor zera os contadores.
 */
@injectable({scope: BindingScope.SINGLETON})
export class RateLimitService {
  private buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  /** Relógio — sobrescrito só nos testes. */
  now: () => number = () => Date.now();

  /**
   * Conta uma tentativa. Lança 429 quando a chave já esgotou a janela. Chave vazia é ignorada
   * (ex.: e-mail não informado — a validação do corpo cuida disso).
   */
  consume(name: RateLimitName, key: string | undefined | null): void {
    if (!key) return;
    const rule = RATE_LIMITS[name];
    const now = this.now();
    this.sweep(now);

    const id = `${name}:${key.trim().toLowerCase()}`;
    const bucket = this.buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(id, {count: 1, resetAt: now + rule.windowMs});
      return;
    }
    if (bucket.count >= rule.max) {
      const minutes = Math.max(1, Math.ceil((bucket.resetAt - now) / MINUTE));
      throw new HttpErrors.TooManyRequests(
        `Muitas tentativas. Tente de novo em ${minutes} minuto${minutes > 1 ? 's' : ''}.`,
      );
    }
    bucket.count++;
  }

  /** Remove janelas vencidas no máximo uma vez por minuto, pra memória não crescer sem limite. */
  private sweep(now: number): void {
    if (now - this.lastSweep < MINUTE) return;
    this.lastSweep = now;
    for (const [id, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(id);
    }
  }
}

let loggedIpSource = false;

/**
 * IP do cliente atrás do proxy do Render (que fica atrás da Cloudflare), nesta ordem:
 * 1. `cf-connecting-ip` — preenchido/sobrescrito pela própria Cloudflare;
 * 2. o **último** item de `x-forwarded-for` — o endereço que o proxy do Render viu (os itens à
 *    esquerda podem ter sido forjados pelo próprio cliente);
 * 3. o IP da conexão (em produção seria o do proxy, igual pra todo mundo — por isso é o último).
 * A fonte usada é logada uma vez por processo, pra conferir nos logs do Render.
 */
export function clientIp(request: Request): string {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === 'string' && value.trim() ? value : undefined;
  };
  const cf = header('cf-connecting-ip');
  const xff = header('x-forwarded-for');
  let source: string;
  let ip: string;
  if (cf) {
    source = 'cf-connecting-ip';
    ip = cf.trim();
  } else if (xff) {
    source = 'x-forwarded-for (último)';
    const parts = xff
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    ip = parts[parts.length - 1];
  } else {
    source = 'conexão direta';
    ip = request.socket?.remoteAddress ?? 'desconhecido';
  }
  if (!loggedIpSource) {
    loggedIpSource = true;
    console.log(`[rate-limit] IP do cliente obtido via ${source}`);
  }
  return ip;
}
