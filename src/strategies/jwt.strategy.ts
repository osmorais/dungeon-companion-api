import {injectable} from '@loopback/core';
import {asAuthStrategy, AuthenticationStrategy} from '@loopback/authentication';
import {UserProfile, securityId} from '@loopback/security';
import {Request, HttpErrors} from '@loopback/rest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme-set-JWT_SECRET-in-env';

@injectable({}, asAuthStrategy)
export class JWTStrategy implements AuthenticationStrategy {
  name = 'jwt';

  async authenticate(request: Request): Promise<UserProfile | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tokenFromCookie: string | undefined = (request as any).cookies?.token;
    const authHeader = request.headers.authorization;
    const tokenFromHeader =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = tokenFromCookie ?? tokenFromHeader;
    if (!token) {
      throw new HttpErrors.Unauthorized('Cookie de autenticação ausente');
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as {id: string; email: string};
      return {
        [securityId]: payload.id,
        id: payload.id,
        email: payload.email,
        name: payload.email,
      };
    } catch {
      throw new HttpErrors.Unauthorized('Token inválido ou expirado');
    }
  }
}
