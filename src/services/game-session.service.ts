/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {AddPlayerInput, CreateGameSessionInput, GameSessionCreated, GameSessionDetail, GameSessionPagedList, NpcSession, PlayerSession} from '../models/game-session-types';

@injectable({scope: BindingScope.TRANSIENT})
export class GameSessionService {
  constructor(
    @service(GameSessionRepository)
    private repository: GameSessionRepository,
  ) {}

  async createSession(input: CreateGameSessionInput, userId: string): Promise<GameSessionCreated> {
    const {session_name, session_code, max_player_quantity, dm_name} = input;

    if (!session_name?.trim()) throw new HttpErrors.UnprocessableEntity('Nome da sessão é obrigatório');
    if (!session_code?.trim()) throw new HttpErrors.UnprocessableEntity('Código da sessão é obrigatório');
    if (!dm_name?.trim()) throw new HttpErrors.UnprocessableEntity('Nome do mestre é obrigatório');
    if (!max_player_quantity || max_player_quantity < 1)
      throw new HttpErrors.UnprocessableEntity('Quantidade máxima de jogadores deve ser pelo menos 1');

    try {
      return await this.repository.createSession(input, userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('session_code')) {
        throw new HttpErrors.Conflict('Código da sessão já está em uso');
      }
      throw err;
    }
  }

  async addPlayer(input: AddPlayerInput, userId: string): Promise<PlayerSession> {
    if (!input.session_code?.trim()) throw new HttpErrors.UnprocessableEntity('Código da sessão é obrigatório');
    if (!input.player_name?.trim()) throw new HttpErrors.UnprocessableEntity('Nome do jogador é obrigatório');
    if (!input.id_character) throw new HttpErrors.UnprocessableEntity('id_character é obrigatório');

    const session = await this.repository.findSessionByCode(input.session_code);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');

    const alreadyIn = await this.repository.isUserInSession(session.id_game_session, userId);
    if (alreadyIn) throw new HttpErrors.Conflict('Usuário já está nessa sessão');

    const currentCount = await this.repository.countPlayers(session.id_game_session);
    if (currentCount >= session.max_player_quantity) {
      throw new HttpErrors.UnprocessableEntity('A sessão já atingiu o número máximo de jogadores');
    }

    return this.repository.addPlayer({...input, user_id: userId}, session.id_game_session);
  }

  async removeNpc(idNpcSession: string, userId: string): Promise<void> {
    const result = await this.repository.removeNpc(idNpcSession, userId);
    if (result === 'not_found') throw new HttpErrors.NotFound('NPC não encontrado na sessão');
    if (result === 'unauthorized') throw new HttpErrors.Forbidden('Apenas o mestre pode remover NPCs');
  }

  async addNpc(idGameSession: string, idCharacter: number, userId: string): Promise<NpcSession> {
    const session = await this.repository.findById(idGameSession);
    if (!session) throw new HttpErrors.NotFound(`Sessão com id ${idGameSession} não encontrada`);
    if (session.game_session.user_id !== userId) throw new HttpErrors.Forbidden('Apenas o mestre pode adicionar NPCs');
    return this.repository.addNpc(idGameSession, idCharacter);
  }

  async removePlayer(idPlayerSession: string, userId: string): Promise<void> {
    const result = await this.repository.removePlayer(idPlayerSession, userId);
    if (result === 'not_found') throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result === 'unauthorized') throw new HttpErrors.Forbidden('Você não pode remover outro jogador da sessão');
  }

  async updateCharacterHp(idPlayerSession: string, currentHitPoints: number, userId: string): Promise<void> {
    if (typeof currentHitPoints !== 'number' || !Number.isInteger(currentHitPoints)) {
      throw new HttpErrors.UnprocessableEntity('current_hit_points deve ser um número inteiro');
    }
    const result = await this.repository.updateCharacterHp(idPlayerSession, currentHitPoints, userId);
    if (result === 'not_found') throw new HttpErrors.NotFound('Jogador não encontrado na sessão');
    if (result === 'unauthorized') throw new HttpErrors.Forbidden('Você não tem permissão para alterar a vida deste personagem');
  }

  async deleteSession(id: string): Promise<void> {
    const deleted = await this.repository.deleteById(id);
    if (!deleted) throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);
  }

  async getSession(id: string, userId: string): Promise<GameSessionDetail> {
    const session = await this.repository.findById(id);
    if (!session) throw new HttpErrors.NotFound(`Sessão com id ${id} não encontrada`);

    const hasAccess = await this.repository.hasSessionAccess(id, userId);
    if (!hasAccess) throw new HttpErrors.Forbidden('Você não tem acesso a esta sessão');

    return session;
  }

  async listSessions(pageSize: number, page: number): Promise<GameSessionPagedList> {
    const rows = await this.repository.findPaged(pageSize, page);
    return {
      GameSessionPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }

  async listUserSessions(userId: string, pageSize: number, page: number): Promise<GameSessionPagedList> {
    const rows = await this.repository.findPagedByUser(userId, pageSize, page);
    return {
      GameSessionPagedList: rows,
      page,
      pageSize,
      total_count: rows[0]?.total_count ?? 0,
    };
  }
}
