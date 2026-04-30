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
    const token: string | undefined = (request as any).cookies?.token;
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
