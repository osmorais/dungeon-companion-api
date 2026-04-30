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
      SELECT id, email, password_hash, full_name, reset_token, reset_token_expires, created_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;
    return rows[0];
  }

  async findByResetToken(token: string): Promise<User | undefined> {
    const rows = await this.db.sql<User[]>`
      SELECT id, email, password_hash, full_name, reset_token, reset_token_expires, created_at
      FROM users
      WHERE reset_token = ${token}
        AND reset_token_expires > NOW()
      LIMIT 1
    `;
    return rows[0];
  }

  async create(data: {email: string; password_hash: string; full_name?: string}): Promise<User> {
    const rows = await this.db.sql<User[]>`
      INSERT INTO users (email, password_hash, full_name)
      VALUES (${data.email}, ${data.password_hash}, ${data.full_name ?? null})
      RETURNING id, email, full_name, created_at
    `;
    return rows[0];
  }

  async updateResetToken(id: string, token: string, expires: Date): Promise<void> {
    await this.db.sql`
      UPDATE users
      SET reset_token = ${token}, reset_token_expires = ${expires}
      WHERE id = ${id}
    `;
  }

  async resetPassword(token: string, passwordHash: string): Promise<void> {
    await this.db.sql`
      UPDATE users
      SET password_hash = ${passwordHash},
          reset_token = NULL,
          reset_token_expires = NULL
      WHERE reset_token = ${token}
        AND reset_token_expires > NOW()
    `;
  }
}
