import {injectable, service} from '@loopback/core';
import {asAuthStrategy, AuthenticationStrategy} from '@loopback/authentication';
import {UserProfile, securityId} from '@loopback/security';
import {Request, HttpErrors} from '@loopback/rest';
import {verifyJwtToken} from './jwt.util';
import {LastAccessService} from '../services/last-access.service';

@injectable({}, asAuthStrategy)
export class JWTStrategy implements AuthenticationStrategy {
  name = 'jwt';

  constructor(
    @service(LastAccessService) private lastAccess: LastAccessService,
  ) {}

  async authenticate(request: Request): Promise<UserProfile | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenFromCookie: string | undefined = (request as any).cookies?.token;
    const authHeader = request.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    // O site manda sempre o header; o cookie fica de reserva (header primeiro: é o que não vai
    // sozinho numa requisição forjada por outro site).
    const token = tokenFromHeader ?? tokenFromCookie;
    if (!token) {
      throw new HttpErrors.Unauthorized('Cookie de autenticação ausente');
    }
    let payload;
    try {
      payload = verifyJwtToken(token);
    } catch {
      throw new HttpErrors.Unauthorized('Token inválido ou expirado');
    }
    this.lastAccess.record(payload.id);
    return {
      [securityId]: payload.id,
      id: payload.id,
      email: payload.email,
      name: payload.email,
    };
  }
}
