import jwt from 'jsonwebtoken';

// Só usado fora de produção, pra não exigir JWT_SECRET no .env local. Em produção a ausência
// da variável derruba o servidor no boot (ver assertJwtSecretConfigured) — com um fallback
// público, qualquer pessoa conseguiria assinar tokens válidos pra qualquer usuário.
const DEV_FALLBACK_SECRET = 'dev-only-insecure-jwt-secret';

export interface JwtPayload {
  id: string;
  email: string;
}

/** Lido sob demanda (não no load do módulo) pra não depender da ordem em que o dotenv roda. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET precisa estar configurado em produção');
  }
  return DEV_FALLBACK_SECRET;
}

/** Chamado no boot (src/index.ts) pra falhar logo em vez de só no primeiro login. */
export function assertJwtSecretConfigured(): void {
  getJwtSecret();
  if (!process.env.JWT_SECRET) {
    console.warn(
      '[WARN] JWT_SECRET não configurado — usando segredo de desenvolvimento. ' +
        'Nunca rode assim em produção.',
    );
  }
}

/** Fonte de verdade única de verificação de JWT — usada pela rota REST (JWTStrategy) e pelo handshake do socket.io (socket-auth.middleware). */
export function verifyJwtToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}
