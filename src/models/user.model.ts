export interface User {
  id: string;
  email: string;
  password_hash?: string;
  full_name?: string;
  /** Nome de usuário (1.9.0), único sem diferenciar maiúsculas. `null` em conta antiga ou criada
   *  com o Google até a pessoa escolher. */
  username?: string | null;
  google_id?: string;
  reset_token?: string;
  reset_token_expires?: Date;
  created_at?: Date;
}

export type UserPublic = Pick<User, 'id' | 'email' | 'username'>;
