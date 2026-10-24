/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, inject, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {OAuth2Client} from 'google-auth-library';
import {UserRepository} from '../repositories/user.repository';
import {User, UserPublic} from '../models/user.model';
import {getJwtSecret, verifyJwtToken} from '../strategies/jwt.util';
import {isUniqueViolation, takenError, UsernameService} from './username.service';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';

const JWT_EXPIRES_IN = '8h';

@injectable({scope: BindingScope.TRANSIENT})
export class AuthService {
  constructor(
    @inject('repositories.UserRepository')
    private userRepository: UserRepository,
    @service(UsernameService)
    private usernameService: UsernameService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  generateToken(user: Pick<User, 'id' | 'email'>): string {
    return jwt.sign({id: user.id, email: user.email}, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  async verifyToken(token: string): Promise<{id: string; email: string}> {
    try {
      return verifyJwtToken(token);
    } catch {
      throw new HttpErrors.Unauthorized('Token inválido ou expirado');
    }
  }

  async signup(email: string, password: string, rawUsername: string): Promise<{token: string; user: UserPublic}> {
    const username = await this.usernameService.assertAvailable(rawUsername);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new HttpErrors.Conflict('E-mail já cadastrado');
    }
    const passwordHash = await this.hashPassword(password);
    let user: User;
    try {
      user = await this.userRepository.create({email, password_hash: passwordHash, username});
    } catch (err) {
      // Outra pessoa pegou o mesmo nome entre a conferência e a gravação.
      if (isUniqueViolation(err)) throw takenError((await this.usernameService.check(username)).suggestions);
      throw err;
    }
    const token = this.generateToken(user);
    return {token, user: toPublic(user)};
  }

  /** Usuário logado, com o nome de usuário atual (`null` = ainda precisa escolher). */
  async me(userId: string): Promise<UserPublic> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new HttpErrors.Unauthorized('Conta não encontrada');
    return toPublic(user);
  }

  async login(email: string, password: string): Promise<{token: string; user: UserPublic}> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.password_hash) {
      throw new HttpErrors.Unauthorized('Credenciais inválidas');
    }
    const valid = await this.comparePassword(password, user.password_hash);
    if (!valid) {
      throw new HttpErrors.Unauthorized('Credenciais inválidas');
    }
    const token = this.generateToken(user);
    return {token, user: toPublic(user)};
  }

  async forgotPassword(email: string): Promise<string> {
    // Retenção: token vencido não serve pra nada — some do banco na próxima solicitação de
    // qualquer usuário (rota com limite de tentativas, então o custo é baixo).
    await this.userRepository.clearExpiredResetTokens();
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal whether the email exists
      return '';
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    // O banco guarda só o hash: quem ler a tabela (backup, vazamento) não consegue usar o link.
    await this.userRepository.updateResetToken(
      user.id,
      hashResetToken(token),
      expires,
    );
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashResetToken(token);
    const user = await this.userRepository.findByResetToken(tokenHash);
    if (!user) {
      throw new HttpErrors.BadRequest('Token inválido ou expirado');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.userRepository.resetPassword(tokenHash, passwordHash);
  }

  async googleAuth(idToken: string): Promise<{token: string; user: UserPublic}> {
    if (!GOOGLE_CLIENT_ID) {
      throw new HttpErrors.InternalServerError('Google OAuth não configurado');
    }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    let payload;
    try {
      const ticket = await client.verifyIdToken({idToken, audience: GOOGLE_CLIENT_ID});
      payload = ticket.getPayload();
    } catch {
      throw new HttpErrors.Unauthorized('Token Google inválido');
    }
    if (!payload?.email) {
      throw new HttpErrors.Unauthorized('Token Google inválido');
    }
    // Sem isso, uma conta Google com e-mail não verificado conseguiria se vincular (logo
    // abaixo, por igualdade de e-mail) a uma conta local de outra pessoa e assumi-la.
    if (payload.email_verified !== true) {
      throw new HttpErrors.Unauthorized('O e-mail desta conta Google não está verificado');
    }

    let user = await this.userRepository.findByGoogleId(payload.sub);
    if (!user) {
      const existing = await this.userRepository.findByEmail(payload.email);
      if (existing) {
        await this.userRepository.linkGoogleAccount(existing.id, payload.sub);
        user = {...existing, google_id: payload.sub};
      } else {
        // O nome da conta Google (nome real) não é guardado: a pessoa escolhe o nome de usuário
        // logo depois (o web leva pra tela de escolha enquanto `username` for null).
        user = await this.userRepository.createWithGoogle({
          email: payload.email,
          google_id: payload.sub,
        });
      }
    }

    const jwtToken = this.generateToken(user);
    return {token: jwtToken, user: toPublic(user)};
  }
}

function toPublic(user: User): UserPublic {
  return {id: user.id, email: user.email, username: user.username ?? null};
}

/**
 * SHA-256 basta (sem salt/bcrypt): o token já é 32 bytes aleatórios, então não há o que adivinhar
 * por dicionário — o hash só impede que o valor guardado no banco funcione como link.
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
