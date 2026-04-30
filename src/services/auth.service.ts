/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, inject} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {UserRepository} from '../repositories/user.repository';
import {User, UserPublic} from '../models/user.model';

const JWT_SECRET = process.env.JWT_SECRET ?? 'changeme-set-JWT_SECRET-in-env';
const JWT_EXPIRES_IN = '8h';

@injectable({scope: BindingScope.TRANSIENT})
export class AuthService {
  constructor(
    @inject('repositories.UserRepository')
    private userRepository: UserRepository,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  generateToken(user: Pick<User, 'id' | 'email'>): string {
    return jwt.sign({id: user.id, email: user.email}, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  async verifyToken(token: string): Promise<{id: string; email: string}> {
    try {
      return jwt.verify(token, JWT_SECRET) as {id: string; email: string};
    } catch {
      throw new HttpErrors.Unauthorized('Token inválido ou expirado');
    }
  }

  async signup(email: string, password: string, fullName?: string): Promise<{token: string; user: UserPublic}> {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new HttpErrors.Conflict('E-mail já cadastrado');
    }
    const passwordHash = await this.hashPassword(password);
    const user = await this.userRepository.create({email, password_hash: passwordHash, full_name: fullName});
    const token = this.generateToken(user);
    return {token, user: {id: user.id, email: user.email, full_name: user.full_name}};
  }

  async login(email: string, password: string): Promise<{token: string; user: UserPublic}> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new HttpErrors.Unauthorized('Credenciais inválidas');
    }
    const valid = await this.comparePassword(password, user.password_hash);
    if (!valid) {
      throw new HttpErrors.Unauthorized('Credenciais inválidas');
    }
    const token = this.generateToken(user);
    return {token, user: {id: user.id, email: user.email, full_name: user.full_name}};
  }

  async forgotPassword(email: string): Promise<string> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal whether the email exists
      return '';
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await this.userRepository.updateResetToken(user.id, token, expires);
    return token;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByResetToken(token);
    if (!user) {
      throw new HttpErrors.BadRequest('Token inválido ou expirado');
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.userRepository.resetPassword(token, passwordHash);
  }
}
