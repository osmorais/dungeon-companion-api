/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {PresencePrivacy} from '../models/social-event-types';
import {
  FriendRow,
  FriendRequest,
  FriendRequestCounts,
  FriendRequestView,
  PlayerSearchResult,
} from '../models/friend-types';

type WithTotal<T> = T & {total_count: string | number};

/** Escapa `%`, `_` e `\` pra busca por parte do nome com LIKE (o termo vem do usuário). */
export function likeContains(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%`;
}

/**
 * Solicitações de amizade, amizades (uma linha por par, ids em ordem canônica) e busca de
 * jogadores. As travas de bloqueio também ficam no SQL das escritas (além do service), pra uma
 * corrida entre bloquear e aceitar/enviar não deixar passar nada.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class FriendRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  /**
   * Amigos com as preferências de privacidade da presença (o service aplica). `onlyIds`: restringe
   * a esses usuários (aba Online, com os ids conectados) e já tira quem esconde a presença.
   */
  async findFriends(
    userId: string,
    search: string | null,
    pageSize: number,
    page: number,
    onlyIds?: string[],
  ): Promise<WithTotal<FriendRow>[]> {
    const sql = this.db.sql;
    return sql<WithTotal<FriendRow>[]>`
      SELECT u.id, u.username, f.created_at AS friends_since,
             u.presence_visibility, u.show_last_seen, u.last_access_at,
             COUNT(*) OVER() AS total_count
      FROM friendship f
      JOIN users u
        ON u.id = CASE WHEN f.user_low_id = ${userId}::uuid THEN f.user_high_id ELSE f.user_low_id END
      WHERE (f.user_low_id = ${userId}::uuid OR f.user_high_id = ${userId}::uuid)
        ${search ? sql`AND LOWER(u.username) LIKE ${likeContains(search)}` : sql``}
        ${
          onlyIds
            ? sql`AND u.id IN ${sql(onlyIds)} AND u.presence_visibility <> 'nobody'`
            : sql``
        }
      ORDER BY LOWER(u.username)
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  /** Pra quem avisar a mudança de presença de `userId`, e o que ele deixa ver. */
  async findPresenceAudience(
    userId: string,
  ): Promise<{friendIds: string[]; privacy: PresencePrivacy} | undefined> {
    const rows = await this.db.sql<
      (PresencePrivacy & {friend_ids: string[] | null})[]
    >`
      SELECT u.presence_visibility, u.show_last_seen, u.last_access_at,
             (
               SELECT array_agg(CASE WHEN f.user_low_id = u.id THEN f.user_high_id ELSE f.user_low_id END)
               FROM friendship f
               WHERE f.user_low_id = u.id OR f.user_high_id = u.id
             ) AS friend_ids
      FROM users u
      WHERE u.id = ${userId}
    `;
    const row = rows[0];
    if (!row) return undefined;
    return {
      friendIds: row.friend_ids ?? [],
      privacy: {
        presence_visibility: row.presence_visibility,
        show_last_seen: row.show_last_seen,
        last_access_at: row.last_access_at,
      },
    };
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    const rows = await this.db.sql`
      SELECT 1 FROM friendship
      WHERE user_low_id = LEAST(${a}::uuid, ${b}::uuid)
        AND user_high_id = GREATEST(${a}::uuid, ${b}::uuid)
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /** Desfaz a amizade para os dois. Devolve se havia amizade. */
  /**
   * Desfaz a amizade e, na mesma transação, cancela os convites para mesa pendentes entre os dois
   * (nas duas direções): convite é só entre amigos. Devolve se havia amizade.
   */
  async removeFriendship(a: string, b: string): Promise<boolean> {
    return this.db.sql.begin(async sql => {
      const removed = await sql`
        DELETE FROM friendship
        WHERE user_low_id = LEAST(${a}::uuid, ${b}::uuid)
          AND user_high_id = GREATEST(${a}::uuid, ${b}::uuid)
      `;
      if (removed.count === 0) return false;
      await sql`
        UPDATE session_invite
        SET status = 'cancelled', responded_at = NOW()
        WHERE status = 'pending'
          AND ((sender_id = ${a} AND receiver_id = ${b})
            OR (sender_id = ${b} AND receiver_id = ${a}))
      `;
      return true;
    });
  }

  async findRequestById(id: string): Promise<FriendRequest | undefined> {
    const rows = await this.db.sql<FriendRequest[]>`
      SELECT * FROM friend_request WHERE id_friend_request = ${id} LIMIT 1
    `;
    return rows[0];
  }

  /** A solicitação pendente entre os dois, em qualquer direção (o índice único garante no máximo uma). */
  async findPendingBetween(
    a: string,
    b: string,
  ): Promise<FriendRequest | undefined> {
    const rows = await this.db.sql<FriendRequest[]>`
      SELECT * FROM friend_request
      WHERE status = 'pending'
        AND ((sender_id = ${a} AND receiver_id = ${b})
          OR (sender_id = ${b} AND receiver_id = ${a}))
      LIMIT 1
    `;
    return rows[0];
  }

  /** Quando o destinatário recusou a última solicitação deste remetente (trava anti-spam). */
  async lastRejectedAt(
    senderId: string,
    receiverId: string,
  ): Promise<Date | null> {
    const rows = await this.db.sql<{at: Date | null}[]>`
      SELECT MAX(responded_at) AS at FROM friend_request
      WHERE sender_id = ${senderId} AND receiver_id = ${receiverId} AND status = 'rejected'
    `;
    return rows[0]?.at ?? null;
  }

  /**
   * Cria a solicitação, a menos que haja bloqueio entre os dois (aí devolve `undefined`). Corrida
   * com outra pendente do mesmo par estoura o índice único (23505) — o service trata.
   */
  async createRequest(
    senderId: string,
    receiverId: string,
  ): Promise<FriendRequest | undefined> {
    const rows = await this.db.sql<FriendRequest[]>`
      INSERT INTO friend_request (sender_id, receiver_id)
      SELECT ${senderId}, ${receiverId}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_block
        WHERE (blocker_id = ${senderId} AND blocked_id = ${receiverId})
           OR (blocker_id = ${receiverId} AND blocked_id = ${senderId})
      )
      RETURNING *
    `;
    return rows[0];
  }

  /**
   * Aceita (só o destinatário, só pendente, só sem bloqueio) e cria a amizade na mesma transação.
   * `undefined` quando nada mudou.
   */
  async acceptRequest(
    id: string,
    receiverId: string,
  ): Promise<FriendRequest | undefined> {
    return this.db.sql.begin(async sql => {
      const rows = await sql<FriendRequest[]>`
        UPDATE friend_request fr
        SET status = 'accepted', responded_at = NOW()
        WHERE fr.id_friend_request = ${id}
          AND fr.receiver_id = ${receiverId}
          AND fr.status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM user_block b
            WHERE (b.blocker_id = fr.sender_id AND b.blocked_id = fr.receiver_id)
               OR (b.blocker_id = fr.receiver_id AND b.blocked_id = fr.sender_id)
          )
        RETURNING fr.*
      `;
      const request = rows[0];
      if (!request) return undefined;
      await sql`
        INSERT INTO friendship (user_low_id, user_high_id)
        VALUES (
          LEAST(${request.sender_id}::uuid, ${request.receiver_id}::uuid),
          GREATEST(${request.sender_id}::uuid, ${request.receiver_id}::uuid)
        )
        ON CONFLICT (user_low_id, user_high_id) DO NOTHING
      `;
      return request;
    });
  }

  /** Recusa (só o destinatário) ou cancela (só o remetente) uma pendente. */
  async closeRequest(
    id: string,
    userId: string,
    as: 'receiver' | 'sender',
  ): Promise<FriendRequest | undefined> {
    const sql = this.db.sql;
    const status = as === 'receiver' ? 'rejected' : 'cancelled';
    const owner =
      as === 'receiver'
        ? sql`receiver_id = ${userId}`
        : sql`sender_id = ${userId}`;
    const rows = await sql<FriendRequest[]>`
      UPDATE friend_request
      SET status = ${status}, responded_at = NOW()
      WHERE id_friend_request = ${id} AND ${owner} AND status = 'pending'
      RETURNING *
    `;
    return rows[0];
  }

  /** Pendentes recebidas (`received`) ou enviadas (`sent`), com a outra pessoa. */
  async findPendingRequests(
    userId: string,
    direction: 'received' | 'sent',
    pageSize: number,
    page: number,
  ): Promise<WithTotal<FriendRequestView>[]> {
    const sql = this.db.sql;
    const mine =
      direction === 'received'
        ? sql`fr.receiver_id = ${userId}`
        : sql`fr.sender_id = ${userId}`;
    const other =
      direction === 'received' ? sql`fr.sender_id` : sql`fr.receiver_id`;
    return sql<WithTotal<FriendRequestView>[]>`
      SELECT fr.id_friend_request, fr.created_at,
             json_build_object('id', u.id, 'username', u.username) AS user,
             COUNT(*) OVER() AS total_count
      FROM friend_request fr
      JOIN users u ON u.id = ${other}
      WHERE ${mine} AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  async countPendingRequests(userId: string): Promise<FriendRequestCounts> {
    const rows = await this.db.sql<{received: number; sent: number}[]>`
      SELECT
        COUNT(*) FILTER (WHERE receiver_id = ${userId})::int AS received,
        COUNT(*) FILTER (WHERE sender_id = ${userId})::int AS sent
      FROM friend_request
      WHERE status = 'pending' AND (receiver_id = ${userId} OR sender_id = ${userId})
    `;
    return {received: rows[0]?.received ?? 0, sent: rows[0]?.sent ?? 0};
  }

  /**
   * Busca por nome de usuário. Quem desligou `discoverable` só aparece pelo nome exato; quem
   * bloqueou quem busca nunca aparece. O nome exato vem primeiro.
   */
  async searchPlayers(
    userId: string,
    term: string,
    pageSize: number,
    page: number,
  ): Promise<WithTotal<PlayerSearchResult>[]> {
    const exact = term.toLowerCase();
    return this.db.sql<WithTotal<PlayerSearchResult>[]>`
      SELECT u.id, u.username,
             CASE
               WHEN f.id_friendship IS NOT NULL THEN 'friend'
               WHEN b.blocker_id IS NOT NULL THEN 'blocked'
               WHEN fr.sender_id = ${userId}::uuid THEN 'request_sent'
               WHEN fr.receiver_id = ${userId}::uuid THEN 'request_received'
               ELSE 'none'
             END AS relationship,
             fr.id_friend_request,
             COUNT(*) OVER() AS total_count
      FROM users u
      LEFT JOIN friendship f
        ON f.user_low_id = LEAST(u.id, ${userId}::uuid)
       AND f.user_high_id = GREATEST(u.id, ${userId}::uuid)
      LEFT JOIN user_block b
        ON b.blocker_id = ${userId}::uuid AND b.blocked_id = u.id
      LEFT JOIN friend_request fr
        ON fr.status = 'pending'
       AND ((fr.sender_id = u.id AND fr.receiver_id = ${userId}::uuid)
         OR (fr.sender_id = ${userId}::uuid AND fr.receiver_id = u.id))
      WHERE u.id <> ${userId}::uuid
        AND u.username IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_block x
          WHERE x.blocker_id = u.id AND x.blocked_id = ${userId}::uuid
        )
        AND (
          LOWER(u.username) = ${exact}
          OR (u.discoverable AND LOWER(u.username) LIKE ${likeContains(term)})
        )
      ORDER BY (LOWER(u.username) = ${exact}) DESC, LOWER(u.username)
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }

  /** Destinatário de uma solicitação: precisa existir, ter nome de usuário e aceitar pedidos. */
  async findRecipient(
    id: string,
  ): Promise<
    | {id: string; username: string | null; accept_friend_requests: boolean}
    | undefined
  > {
    const rows = await this.db.sql<
      {id: string; username: string | null; accept_friend_requests: boolean}[]
    >`
      SELECT id, username, accept_friend_requests FROM users WHERE id = ${id} LIMIT 1
    `;
    return rows[0];
  }
}
