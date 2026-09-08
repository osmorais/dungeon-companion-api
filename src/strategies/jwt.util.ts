import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme-set-JWT_SECRET-in-env';

export interface JwtPayload {
  id: string;
  email: string;
}

/** Fonte de verdade única de verificação de JWT — usada pela rota REST (JWTStrategy) e pelo handshake do socket.io (socket-auth.middleware). */
export function verifyJwtToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
