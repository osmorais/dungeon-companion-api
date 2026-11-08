/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {NotificationType, NotificationView} from '../models/social-event-types';

export interface NewNotification {
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  payload: Record<string, string>;
  dedupe_key: string;
}

/** Notificações do usuário. Toda leitura e escrita filtra pelo dono (`user_id`). */
@injectable({scope: BindingScope.TRANSIENT})
export class NotificationRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  /**
   * Grava e devolve já com o ator. `undefined` quando a mesma notificação já existia
   * (`dedupe_key` repetido num retry).
   */
  async create(n: NewNotification): Promise<NotificationView | undefined> {
    const sql = this.db.sql;
    const rows = await sql<NotificationView[]>`
      WITH ins AS (
        INSERT INTO notification (user_id, actor_id, type, payload, dedupe_key)
        VALUES (${n.user_id}, ${n.actor_id}, ${n.type}, ${sql.json(n.payload)}, ${n.dedupe_key})
        ON CONFLICT (user_id, dedupe_key) DO NOTHING
        RETURNING *
      )
      SELECT ins.id_notification, ins.type, ins.payload, ins.read_at, ins.created_at,
             CASE WHEN u.id IS NULL THEN NULL
                  ELSE json_build_object('id', u.id, 'username', u.username) END AS actor
      FROM ins
      LEFT JOIN users u ON u.id = ins.actor_id
    `;
    return rows[0];
  }

  async findForUser(
    userId: string,
    unreadOnly: boolean,
    pageSize: number,
    page: number,
  ): Promise<(NotificationView & {total_count: string | number})[]> {
    const sql = this.db.sql;
    return sql<(NotificationView & {total_count: string | number})[]>`
      SELECT n.id_notification, n.type, n.payload, n.read_at, n.created_at,
             CASE WHEN u.id IS NULL THEN NULL
                  ELSE json_build_object('id', u.id, 'username', u.username) END AS actor,
             COUNT(*) OVER() AS total_count
      FROM notification n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE n.user_id = ${userId}
        ${unreadOnly ? sql`AND n.read_at IS NULL` : sql``}
      ORDER BY n.created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  async countUnread(userId: string): Promise<number> {
    const rows = await this.db.sql<{count: number}[]>`
      SELECT COUNT(*)::int AS count FROM notification
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    return rows[0]?.count ?? 0;
  }

  /** Só marca a do próprio usuário. Devolve se ela existe (já lida também conta). */
  async markRead(id: string, userId: string): Promise<boolean> {
    const result = await this.db.sql`
      UPDATE notification SET read_at = COALESCE(read_at, NOW())
      WHERE id_notification = ${id} AND user_id = ${userId}
    `;
    return result.count > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.sql`
      UPDATE notification SET read_at = NOW()
      WHERE user_id = ${userId} AND read_at IS NULL
    `;
    return result.count;
  }
}
