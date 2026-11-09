/* eslint-disable @typescript-eslint/naming-convention */
import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';
import {
  InviteTargetSession,
  SessionInvite,
  SessionInviteView,
} from '../models/session-invite-types';

type WithTotal<T> = T & {total_count: string | number};

/**
 * Convites para mesa. O aceite reserva o convite numa escrita condicional (só o destinatário, só
 * pendente, só no prazo, só sem bloqueio) antes de entrar na mesa — se a entrada falhar, o service
 * devolve o convite pra pendente.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class SessionInviteRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async findTargetSession(
    idGameSession: string,
  ): Promise<InviteTargetSession | undefined> {
    const rows = await this.db.sql<InviteTargetSession[]>`
      SELECT gs.id_game_session, gs.session_name, gs.session_code, gs.user_id,
             gs.max_player_quantity,
             (SELECT COUNT(*)::int FROM player_session ps
              WHERE ps.id_game_session = gs.id_game_session) AS player_count
      FROM game_session gs
      WHERE gs.id_game_session = ${idGameSession}
      LIMIT 1
    `;
    return rows[0];
  }

  async isInSession(idGameSession: string, userId: string): Promise<boolean> {
    const rows = await this.db.sql`
      SELECT 1 FROM player_session
      WHERE id_game_session = ${idGameSession} AND user_id = ${userId}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /** Pendentes vencidos de quem convida ou é convidado viram `expired`. */
  async expireStale(userId: string): Promise<void> {
    await this.db.sql`
      UPDATE session_invite
      SET status = 'expired', responded_at = NOW()
      WHERE status = 'pending' AND expires_at <= NOW()
        AND (receiver_id = ${userId} OR sender_id = ${userId})
    `;
  }

  /** Corrida com outro pendente da mesma pessoa e mesa estoura o índice único (23505). */
  async create(input: {
    id_game_session: string;
    sender_id: string;
    receiver_id: string;
    message: string | null;
    expires_at: Date;
  }): Promise<SessionInvite> {
    const rows = await this.db.sql<SessionInvite[]>`
      INSERT INTO session_invite (id_game_session, sender_id, receiver_id, message, expires_at)
      VALUES (${input.id_game_session}, ${input.sender_id}, ${input.receiver_id},
              ${input.message}, ${input.expires_at})
      RETURNING *
    `;
    return rows[0];
  }

  async findById(id: string): Promise<SessionInvite | undefined> {
    const rows = await this.db.sql<SessionInvite[]>`
      SELECT * FROM session_invite WHERE id_session_invite = ${id} LIMIT 1
    `;
    return rows[0];
  }

  /** Reserva o aceite. `undefined` se não é mais pendente, venceu ou há bloqueio entre os dois. */
  async claim(
    id: string,
    receiverId: string,
  ): Promise<SessionInvite | undefined> {
    const rows = await this.db.sql<SessionInvite[]>`
      UPDATE session_invite si
      SET status = 'accepted', responded_at = NOW()
      WHERE si.id_session_invite = ${id}
        AND si.receiver_id = ${receiverId}
        AND si.status = 'pending'
        AND si.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM user_block b
          WHERE (b.blocker_id = si.sender_id AND b.blocked_id = si.receiver_id)
             OR (b.blocker_id = si.receiver_id AND b.blocked_id = si.sender_id)
        )
      RETURNING si.*
    `;
    return rows[0];
  }

  /** Desfaz a reserva quando a entrada na mesa foi recusada (sem vaga, personagem inválido…). */
  async releaseClaim(id: string): Promise<void> {
    await this.db.sql`
      UPDATE session_invite SET status = 'pending', responded_at = NULL
      WHERE id_session_invite = ${id} AND status = 'accepted'
    `;
  }

  /** Recusa (destinatário), cancela (remetente) ou marca vencido um pendente. */
  async close(
    id: string,
    status: 'rejected' | 'cancelled' | 'expired',
    owner?: {userId: string; as: 'receiver' | 'sender'},
  ): Promise<SessionInvite | undefined> {
    const sql = this.db.sql;
    const ownerFilter = !owner
      ? sql``
      : owner.as === 'receiver'
        ? sql`AND receiver_id = ${owner.userId}`
        : sql`AND sender_id = ${owner.userId}`;
    const rows = await sql<SessionInvite[]>`
      UPDATE session_invite
      SET status = ${status}, responded_at = NOW()
      WHERE id_session_invite = ${id} AND status = 'pending' ${ownerFilter}
      RETURNING *
    `;
    return rows[0];
  }

  /** Pendentes no prazo recebidos ou enviados, com a mesa e a outra pessoa. */
  async findPending(
    userId: string,
    direction: 'received' | 'sent',
    pageSize: number,
    page: number,
  ): Promise<WithTotal<SessionInviteView>[]> {
    const sql = this.db.sql;
    const mine =
      direction === 'received'
        ? sql`si.receiver_id = ${userId}`
        : sql`si.sender_id = ${userId}`;
    const other =
      direction === 'received' ? sql`si.sender_id` : sql`si.receiver_id`;
    return sql<WithTotal<SessionInviteView>[]>`
      SELECT si.id_session_invite, si.id_game_session, gs.session_name, si.message,
             si.created_at, si.expires_at,
             json_build_object('id', u.id, 'username', u.username) AS user,
             COUNT(*) OVER() AS total_count
      FROM session_invite si
      JOIN game_session gs ON gs.id_game_session = si.id_game_session
      JOIN users u ON u.id = ${other}
      WHERE ${mine} AND si.status = 'pending' AND si.expires_at > NOW()
      ORDER BY si.created_at DESC
      LIMIT ${pageSize}
      OFFSET (${page} - 1) * ${pageSize}
    `;
  }
}
