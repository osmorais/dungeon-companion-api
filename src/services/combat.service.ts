/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {CombatRepository} from '../repositories/combat.repository';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {SessionEventsService} from './session-events.service';
import {
  CombatEncounter,
  CombatEncounterDetail,
  CombatParticipantDetail,
  StartEncounterParticipantInput,
  SubmitInitiativeInput,
} from '../models/combat-types';

@injectable({scope: BindingScope.TRANSIENT})
export class CombatService {
  constructor(
    @service(CombatRepository)
    private repository: CombatRepository,
    @service(GameSessionRepository)
    private gameSessionRepository: GameSessionRepository,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  async getActiveEncounterDetail(
    idGameSession: string,
  ): Promise<CombatEncounterDetail | null> {
    const encounter =
      await this.repository.findActiveEncounterByGameSession(idGameSession);
    if (!encounter) return null;
    return this.buildDetail(encounter);
  }

  private async buildDetail(
    encounter: CombatEncounter,
  ): Promise<CombatEncounterDetail> {
    const participants = await this.repository.findParticipants(
      encounter.id_combat_encounter,
    );
    const currentIndex =
      participants.length > 0
        ? encounter.current_turn_index % participants.length
        : 0;

    const participantDetails: CombatParticipantDetail[] = participants.map(
      (p, index) => ({
        ...p,
        is_current_turn:
          encounter.status === 'active' && index === currentIndex,
      }),
    );

    return {encounter, participants: participantDetails};
  }

  async startEncounter(
    idGameSession: string,
    participants: StartEncounterParticipantInput[],
    userId: string,
  ): Promise<CombatEncounterDetail> {
    const session = await this.gameSessionRepository.findById(idGameSession);
    if (!session) throw new HttpErrors.NotFound('Sessão não encontrada');
    if (session.game_session.user_id !== userId) {
      throw new HttpErrors.Forbidden('Apenas o mestre pode iniciar um combate');
    }

    const existing =
      await this.repository.findActiveEncounterByGameSession(idGameSession);
    if (existing)
      throw new HttpErrors.Conflict(
        'Já existe um combate em andamento nessa sessão',
      );

    if (!participants.length) {
      throw new HttpErrors.UnprocessableEntity(
        'Selecione ao menos um participante para iniciar a luta',
      );
    }

    const idPlayerSessions = participants
      .filter(p => p.participant_type === 'player')
      .map(p => p.id);
    const idNpcSessions = participants
      .filter(p => p.participant_type === 'npc')
      .map(p => p.id);
    const idMonsterSessions = participants
      .filter(p => p.participant_type === 'monster')
      .map(p => p.id);

    const validPlayerIds = await this.repository.filterValidPlayerSessions(
      idGameSession,
      idPlayerSessions,
    );
    const npcInfos = await this.repository.getValidNpcDexModifiers(
      idGameSession,
      idNpcSessions,
    );
    const monsterInfos = await this.repository.getValidMonsterDexModifiers(
      idGameSession,
      idMonsterSessions,
    );

    if (
      validPlayerIds.length !== idPlayerSessions.length ||
      npcInfos.length !== idNpcSessions.length ||
      monsterInfos.length !== idMonsterSessions.length
    ) {
      throw new HttpErrors.UnprocessableEntity(
        'Um ou mais participantes não pertencem a essa sessão',
      );
    }

    const encounter = await this.repository.createEncounter(idGameSession);

    await this.repository.addPlayerParticipants(
      encounter.id_combat_encounter,
      validPlayerIds,
    );

    for (const npc of npcInfos) {
      const roll = this.rollD20();
      await this.repository.addNpcParticipant(
        encounter.id_combat_encounter,
        npc.id_npc_session,
        roll,
        roll + npc.dex_modifier,
      );
    }

    // Monstros não jogam: a rolagem de iniciativa é automática, igual aos NPCs.
    for (const monster of monsterInfos) {
      const roll = this.rollD20();
      const dexModifier = Math.floor((monster.dexterity - 10) / 2);
      await this.repository.addMonsterParticipant(
        encounter.id_combat_encounter,
        monster.id_monster_session,
        roll,
        roll + dexModifier,
      );
    }

    if (validPlayerIds.length === 0) {
      await this.repository.activateEncounter(encounter.id_combat_encounter);
    }

    this.events.publish(idGameSession);
    return (await this.getActiveEncounterDetail(idGameSession))!;
  }

  async submitInitiative(
    idCombatParticipant: string,
    input: SubmitInitiativeInput,
    userId: string,
  ): Promise<void> {
    const context =
      await this.repository.findParticipantContext(idCombatParticipant);
    if (!context) throw new HttpErrors.NotFound('Participante não encontrado');
    if (context.status !== 'rolling_initiative') {
      throw new HttpErrors.Conflict(
        'Esse combate não está mais na fase de rolagem de iniciativa',
      );
    }
    if (
      context.participant_type !== 'player' ||
      context.player_user_id !== userId
    ) {
      throw new HttpErrors.Forbidden(
        'Você não pode registrar essa rolagem de iniciativa',
      );
    }
    if (context.initiative_total !== null) {
      throw new HttpErrors.Conflict(
        'Você já registrou sua rolagem de iniciativa',
      );
    }
    if (!Array.isArray(input.rolls) || input.rolls.length === 0) {
      throw new HttpErrors.UnprocessableEntity(
        'rolls deve conter ao menos um valor',
      );
    }

    await this.repository.setParticipantInitiative(
      idCombatParticipant,
      input.rolls[0],
      input.total,
    );

    const pending = await this.repository.countPendingParticipants(
      context.id_combat_encounter,
    );
    if (pending === 0) {
      await this.repository.activateEncounter(context.id_combat_encounter);
    }

    this.events.publish(context.id_game_session);
  }

  async endTurn(idCombatEncounter: string, userId: string): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.status !== 'active') {
      throw new HttpErrors.Conflict('Esse combate não está na fase de turnos');
    }

    const participants =
      await this.repository.findParticipants(idCombatEncounter);
    if (!participants.length)
      throw new HttpErrors.Conflict('Combate sem participantes');

    const currentIndex = context.current_turn_index % participants.length;
    const current = participants[currentIndex];

    const isDm = context.dm_user_id === userId;
    if (!isDm) {
      if (current.participant_type !== 'player') {
        throw new HttpErrors.Forbidden('Apenas o mestre pode agir pelo NPC');
      }
      const owner = await this.repository.findParticipantContext(
        current.id_combat_participant,
      );
      if (owner?.player_user_id !== userId) {
        throw new HttpErrors.Forbidden('Não é o seu turno');
      }
    }

    const nextIndex = (currentIndex + 1) % participants.length;
    const nextRound =
      nextIndex === 0 ? context.round_number + 1 : context.round_number;
    await this.repository.updateTurnState(
      idCombatEncounter,
      nextIndex,
      nextRound,
    );

    this.events.publish(context.id_game_session);
  }

  async endEncounter(idCombatEncounter: string, userId: string): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.dm_user_id !== userId) {
      throw new HttpErrors.Forbidden('Apenas o mestre pode encerrar o combate');
    }

    await this.repository.finishEncounter(idCombatEncounter);
    await this.gameSessionRepository.hideAllMonsters(context.id_game_session);
    this.events.publish(context.id_game_session);
  }

  private rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
  }
}
