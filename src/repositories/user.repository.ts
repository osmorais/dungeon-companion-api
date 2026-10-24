import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {User} from '../models/user.model';

@injectable({scope: BindingScope.TRANSIENT})
export class UserRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const rows = await this.db.sql<User[]>`
      SELECT id, email, password_hash, username, reset_token, reset_token_expires, created_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;
    return rows[0];
  }

  /** `tokenHash` é o SHA-256 do token do link (ver hashResetToken) — o token puro nunca é gravado. */
  async findByResetToken(tokenHash: string): Promise<User | undefined> {
    const rows = await this.db.sql<User[]>`
      SELECT id, email, password_hash, username, reset_token, reset_token_expires, created_at
      FROM users
      WHERE reset_token = ${tokenHash}
        AND reset_token_expires > NOW()
      LIMIT 1
    `;
    return rows[0];
  }

  async findByGoogleId(googleId: string): Promise<User | undefined> {
    const rows = await this.db.sql<User[]>`
      SELECT id, email, password_hash, username, google_id, reset_token, reset_token_expires, created_at
      FROM users
      WHERE google_id = ${googleId}
      LIMIT 1
    `;
    return rows[0];
  }

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db.sql<User[]>`
      SELECT id, email, username FROM users WHERE id = ${id} LIMIT 1
    `;
    return rows[0];
  }

  async create(data: {email: string; password_hash: string; username: string}): Promise<User> {
    const rows = await this.db.sql<User[]>`
      INSERT INTO users (email, password_hash, username)
      VALUES (${data.email}, ${data.password_hash}, ${data.username})
      RETURNING id, email, username, created_at
    `;
    return rows[0];
  }

  /** Sem nome: o nome da conta Google não é guardado (minimização); a pessoa escolhe o usuário. */
  async createWithGoogle(data: {email: string; google_id: string}): Promise<User> {
    const rows = await this.db.sql<User[]>`
      INSERT INTO users (email, google_id)
      VALUES (${data.email}, ${data.google_id})
      RETURNING id, email, username, google_id, created_at
    `;
    return rows[0];
  }

  /**
   * Quais dos nomes já estão em uso (comparação sem maiúsculas, como o índice único). Devolve os
   * nomes em minúsculas. `exceptUserId`: o nome atual da própria pessoa não conta como em uso.
   */
  async takenUsernames(usernames: string[], exceptUserId?: string): Promise<Set<string>> {
    if (!usernames.length) return new Set();
    const lowered = usernames.map(u => u.toLowerCase());
    const rows = await this.db.sql<{name: string}[]>`
      SELECT LOWER(username) AS name FROM users
      WHERE LOWER(username) IN ${this.db.sql(lowered)}
        ${exceptUserId ? this.db.sql`AND id <> ${exceptUserId}` : this.db.sql``}
    `;
    return new Set(rows.map(r => r.name));
  }

  async setUsername(id: string, username: string): Promise<void> {
    await this.db.sql`UPDATE users SET username = ${username} WHERE id = ${id}`;
  }

  async linkGoogleAccount(id: string, googleId: string): Promise<void> {
    await this.db.sql`
      UPDATE users SET google_id = ${googleId} WHERE id = ${id}
    `;
  }

  async updateResetToken(id: string, tokenHash: string, expires: Date): Promise<void> {
    await this.db.sql`
      UPDATE users
      SET reset_token = ${tokenHash}, reset_token_expires = ${expires}
      WHERE id = ${id}
    `;
  }

  /** Apaga tokens de redefinição já vencidos (de todos os usuários). Devolve quantos limpou. */
  async clearExpiredResetTokens(): Promise<number> {
    const result = await this.db.sql`
      UPDATE users
      SET reset_token = NULL, reset_token_expires = NULL
      WHERE reset_token IS NOT NULL AND reset_token_expires <= NOW()
    `;
    return result.count;
  }

  async resetPassword(tokenHash: string, passwordHash: string): Promise<void> {
    await this.db.sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE reset_token = ${tokenHash}
        AND reset_token_expires > NOW()
    `;
  }
}
