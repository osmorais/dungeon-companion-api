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
 * Autentica o handshake do socket.io. Fonte primária: `socket.handshake.auth.token`, mandado
 * explicitamente pelo cliente no payload do socket.io (não é header HTTP nem cookie) — o
 * frontend usa isso porque `WebSocket` nativo não manda headers customizados, e o cookie
 * `token` é bloqueado pelo navegador como cookie de terceiros nesse domínio cross-site, mesmo
 * com SameSite=None (confirmado: nenhum `Cookie:` chega no handshake em produção). O cookie
 * ainda é aceito como fallback (ex: dev local, onde é same-site e não sofre esse bloqueio) —
 * mesma fonte de verdade de verificação (verifyJwtToken) que a estratégia JWT da API REST usa.
 */
export function createSocketAuthMiddleware() {
  return (socket: Socket, next: (err?: Error) => void) => {
    const authToken = socket.handshake.auth?.['token'];
    const token =
      typeof authToken === 'string' && authToken
        ? authToken
        : parseCookie(socket.handshake.headers.cookie, 'token');
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
