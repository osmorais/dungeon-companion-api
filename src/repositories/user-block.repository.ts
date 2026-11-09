/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {BlockedUser} from '../models/friend-types';

/** Bloqueios entre usuários (`user_block`). As regras ficam no UserBlockService. */
@injectable({scope: BindingScope.TRANSIENT})
export class UserBlockRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  /** Quem bloqueou quem entre os dois. */
  async blockStatus(
    userId: string,
    otherId: string,
  ): Promise<{byMe: boolean; byThem: boolean}> {
    const rows = await this.db.sql<{blocker_id: string}[]>`
      SELECT blocker_id FROM user_block
      WHERE (blocker_id = ${userId} AND blocked_id = ${otherId})
         OR (blocker_id = ${otherId} AND blocked_id = ${userId})
    `;
    return {
      byMe: rows.some(r => r.blocker_id === userId),
      byThem: rows.some(r => r.blocker_id === otherId),
    };
  }

  /**
   * Bloqueia e, na mesma transação, desfaz a amizade e cancela as solicitações e os convites para
   * mesa pendentes entre os dois (nas duas direções). Bloquear de novo não muda nada.
   */
  async block(
    blockerId: string,
    blockedId: string,
  ): Promise<{friendshipRemoved: boolean}> {
    return this.db.sql.begin(async sql => {
      await sql`
        INSERT INTO user_block (blocker_id, blocked_id)
        VALUES (${blockerId}, ${blockedId})
        ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      `;
      const removed = await sql`
        DELETE FROM friendship
        WHERE user_low_id = LEAST(${blockerId}::uuid, ${blockedId}::uuid)
          AND user_high_id = GREATEST(${blockerId}::uuid, ${blockedId}::uuid)
      `;
      await sql`
        UPDATE friend_request
        SET status = 'cancelled', responded_at = NOW()
        WHERE status = 'pending'
          AND ((sender_id = ${blockerId} AND receiver_id = ${blockedId})
            OR (sender_id = ${blockedId} AND receiver_id = ${blockerId}))
      `;
      await sql`
        UPDATE session_invite
        SET status = 'cancelled', responded_at = NOW()
        WHERE status = 'pending'
          AND ((sender_id = ${blockerId} AND receiver_id = ${blockedId})
            OR (sender_id = ${blockedId} AND receiver_id = ${blockerId}))
      `;
      return {friendshipRemoved: removed.count > 0};
    });
  }

  /** Devolve se havia bloqueio. */
  async unblock(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.db.sql`
      DELETE FROM user_block
      WHERE blocker_id = ${blockerId} AND blocked_id = ${blockedId}
    `;
    return result.count > 0;
  }

  async findBlocked(
    blockerId: string,
    pageSize: number,
    page: number,
  ): Promise<(BlockedUser & {total_count: string | number})[]> {
    return this.db.sql<(BlockedUser & {total_count: string | number})[]>`
      SELECT u.id, u.username, b.created_at AS blocked_at,
             COUNT(*) OVER() AS total_count
      FROM user_block b
      JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = ${blockerId}
      ORDER BY b.created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }
}
