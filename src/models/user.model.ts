export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name?: string;
  reset_token?: string;
  reset_token_expires?: Date;
  created_at?: Date;
}

export type UserPublic = Pick<User, 'id' | 'email' | 'full_name'>;
