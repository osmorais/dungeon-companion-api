import {Socket} from 'socket.io';
import {verifyJwtToken} from './jwt.util';

function parseCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      // decodeURIComponent lança URIError em percent-encoding malformado — não pode escapar
      // daqui: isso corre dentro do middleware do socket.io, cujo _add() interno é async e não
      // tem try/catch em volta da chamada da middleware chain, então uma exceção síncrona vira
      // unhandled rejection e derruba o processo Node inteiro.
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

/**
 * Autentica o handshake do socket.io lendo o mesmo cookie httpOnly (`token`) que a
 * estratégia JWT da API REST usa — mesma fonte de verdade (verifyJwtToken), só muda o
 * transporte de leitura do cookie (aqui não passa pelo cookie-parser do Express).
 */
export function createSocketAuthMiddleware() {
  return (socket: Socket, next: (err?: Error) => void) => {
    const token = parseCookie(socket.handshake.headers.cookie, 'token');
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyJwtToken(token);
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  };
}
