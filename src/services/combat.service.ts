/* eslint-disable @typescript-eslint/naming-convention */
import {injectable, BindingScope, service} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';
import {CombatRepository} from '../repositories/combat.repository';
import {CharacterRepository} from '../repositories/character.repository';
import {GameSessionRepository} from '../repositories/game-session.repository';
import {SessionEventsService} from './session-events.service';
import {FEATS} from './character-sheet/feats';
import {
  CombatEncounter,
  CombatEncounterDetail,
  CombatParticipant,
  CombatParticipantDetail,
  StartEncounterParticipantInput,
  SubmitInitiativeInput,
} from '../models/combat-types';

@injectable({scope: BindingScope.TRANSIENT})
export class CombatService {
  constructor(
    @service(CombatRepository)
    private repository: CombatRepository,
    @service(CharacterRepository)
    private characterRepository: CharacterRepository,
    @service(GameSessionRepository)
    private gameSessionRepository: GameSessionRepository,
    @service(SessionEventsService)
    private events: SessionEventsService,
  ) {}

  /** Soma de bônus fixos de talento na iniciativa (hoje só o Alerta, +5) por personagem. */
  private async getInitiativeFeatBonuses(
    idCharacters: number[],
  ): Promise<Record<number, number>> {
    const uniqueIds = [...new Set(idCharacters)];
    if (!uniqueIds.length) return {};
    const rows =
      await this.characterRepository.findChosenFeatsForCharacters(uniqueIds);
    const result: Record<number, number> = {};
    for (const row of rows) {
      const bonus = FEATS[row.feat_id]?.initiativeBonus ?? 0;
      if (bonus)
        result[row.id_character] = (result[row.id_character] ?? 0) + bonus;
    }
    return result;
  }

  /**
   * `findParticipants` já traz o modificador de Destreza atual (não mais congelado), mas não
   * sabe somar bônus de talento (catálogo só existe aqui, na service) — soma isso e reordena
   * pelo mesmo critério do SQL (`initiative_total` DESC, depois `dex_modifier` DESC, depois id).
   */
  private async findParticipantsWithLiveInitiativeModifier(
    idCombatEncounter: string,
  ): Promise<CombatParticipant[]> {
    const rows = await this.repository.findParticipants(idCombatEncounter);
    const idCharacters = rows
      .map(r => r.id_character)
      .filter((id): id is number => id !== null);
    const featBonuses = await this.getInitiativeFeatBonuses(idCharacters);

    const corrected: CombatParticipant[] = rows.map(r => ({
      id_combat_participant: r.id_combat_participant,
      id_combat_encounter: r.id_combat_encounter,
      participant_type: r.participant_type,
      id_player_session: r.id_player_session,
      id_npc_session: r.id_npc_session,
      id_monster_session: r.id_monster_session,
      initiative_roll: r.initiative_roll,
      initiative_total: r.initiative_total,
      turn_order: r.turn_order,
      delayed_this_round: r.delayed_this_round,
      dex_modifier:
        r.dex_modifier +
        (r.id_character != null ? (featBonuses[r.id_character] ?? 0) : 0),
    }));

    // `turn_order` é a ordem canônica (definida quando o combate fica ativo, editável pelo
    // mestre depois disso). Antes disso (ainda rolando iniciativa) todo mundo tem turn_order
    // nulo, e cai no critério antigo (initiative_total > dex_modifier > id) como desempate.
    corrected.sort((a, b) => {
      if (
        a.turn_order !== null &&
        b.turn_order !== null &&
        a.turn_order !== b.turn_order
      ) {
        return a.turn_order - b.turn_order;
      }
      if (a.turn_order !== null && b.turn_order === null) return -1;
      if (a.turn_order === null && b.turn_order !== null) return 1;

      if (a.initiative_total === null && b.initiative_total === null) return 0;
      if (a.initiative_total === null) return 1;
      if (b.initiative_total === null) return -1;
      if (a.initiative_total !== b.initiative_total)
        return b.initiative_total - a.initiative_total;
      if (a.dex_modifier !== b.dex_modifier)
        return b.dex_modifier - a.dex_modifier;
      return a.id_combat_participant < b.id_combat_participant ? -1 : 1;
    });

    return corrected;
  }

  /**
   * Ordem "efetiva" pra avançar o turno: igual à `turn_order` canônica, exceto que quem atrasou
   * o próprio turno nesta rodada vai pro final (mas ainda entre si na ordem de `turn_order`,
   * não na ordem em que atrasaram). Só usada aqui, pra calcular quem é o próximo — a lista
   * exibida pro jogador/mestre continua sempre na ordem canônica (ver findParticipantsWithLiveInitiativeModifier).
   */
  private effectiveTurnOrder(
    participants: CombatParticipant[],
  ): CombatParticipant[] {
    return [...participants].sort((a, b) => {
      if (a.delayed_this_round !== b.delayed_this_round) {
        return a.delayed_this_round ? 1 : -1;
      }
      return (a.turn_order ?? 0) - (b.turn_order ?? 0);
    });
  }

  /**
   * Persiste turn_order = índice pra cada participante (na ordem já calculada por
   * findParticipantsWithLiveInitiativeModifier) e marca o primeiro como o turno atual. Chamado
   * sempre que a fase de rolagem de iniciativa termina e o combate passa a 'active'.
   */
  private async activateWithComputedOrder(
    idCombatEncounter: string,
  ): Promise<void> {
    const participants =
      await this.findParticipantsWithLiveInitiativeModifier(idCombatEncounter);
    for (const [index, p] of participants.entries()) {
      await this.repository.setTurnOrder(p.id_combat_participant, index);
    }
    await this.repository.activateEncounter(
      idCombatEncounter,
      participants[0].id_combat_participant,
    );
  }

  /** Avança current_turn_participant_id pro próximo da ordem efetiva, incrementando a rodada
   *  (e limpando os atrasos) quando ela dá a volta completa. Compartilhado por endTurn/delayTurn. */
  private async advanceToNextTurn(
    idCombatEncounter: string,
    participants: CombatParticipant[],
    currentParticipantId: string,
    roundNumber: number,
  ): Promise<void> {
    const order = this.effectiveTurnOrder(participants);
    const currentIndex = order.findIndex(
      p => p.id_combat_participant === currentParticipantId,
    );
    const nextIndex = (currentIndex + 1) % order.length;
    const isNewRound = nextIndex === 0;
    const next = order[nextIndex];

    await this.repository.updateTurnState(
      idCombatEncounter,
      next.id_combat_participant,
      isNewRound ? roundNumber + 1 : roundNumber,
    );
    if (isNewRound) await this.repository.clearDelayedFlags(idCombatEncounter);
  }

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
    const participants = await this.findParticipantsWithLiveInitiativeModifier(
      encounter.id_combat_encounter,
    );

    const participantDetails: CombatParticipantDetail[] = participants.map(
      p => ({
        ...p,
        is_current_turn:
          encounter.status === 'active' &&
          p.id_combat_participant === encounter.current_turn_participant_id,
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
    const npcInfos = await this.repository.getValidNpcCombatInfo(
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

    const npcFeatBonuses = await this.getInitiativeFeatBonuses(
      npcInfos.map(n => n.id_character),
    );
    for (const npc of npcInfos) {
      const roll = this.rollD20();
      const modifier =
        npc.dex_modifier + (npcFeatBonuses[npc.id_character] ?? 0);
      await this.repository.addNpcParticipant(
        encounter.id_combat_encounter,
        npc.id_npc_session,
        roll,
        roll + modifier,
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
      await this.activateWithComputedOrder(encounter.id_combat_encounter);
    }

    // Entrar na luta já revela o monstro pros jogadores — anuncia (nome + imagem) antes do
    // combat_started, pra dar tempo do anúncio aparecer antes do banner de rolar iniciativa.
    const newlyRevealed = await this.gameSessionRepository.revealMonsters(
      idGameSession,
      idMonsterSessions,
    );
    for (const monster of newlyRevealed) {
      this.events.publish({
        type: 'monster_revealed',
        id_game_session: idGameSession,
        id_monster_session: monster.id_monster_session,
        name:
          monster.custom_name ??
          this.monsterSnapshotName(monster.data_snapshot),
        image_url: monster.image_url,
      });
    }

    const combat = (await this.getActiveEncounterDetail(idGameSession))!;
    this.events.publish({
      type: 'combat_started',
      id_game_session: idGameSession,
      combat,
    });
    return combat;
  }

  private monsterSnapshotName(snapshot: unknown): string {
    return (snapshot as {name?: string} | undefined)?.name ?? 'Monstro';
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
    // O mestre também pode rolar iniciativa pelo jogador (ex: jogador ausente/AFK) — além do
    // próprio dono do personagem.
    const isOwnCharacter = context.player_user_id === userId;
    const isDm = context.dm_user_id === userId;
    if (context.participant_type !== 'player' || (!isOwnCharacter && !isDm)) {
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
      await this.activateWithComputedOrder(context.id_combat_encounter);
    }

    const combat = (await this.getActiveEncounterDetail(
      context.id_game_session,
    ))!;
    this.events.publish({
      type: 'initiative_submitted',
      id_game_session: context.id_game_session,
      combat,
    });
  }

  async endTurn(idCombatEncounter: string, userId: string): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.status !== 'active') {
      throw new HttpErrors.Conflict('Esse combate não está na fase de turnos');
    }

    const participants =
      await this.findParticipantsWithLiveInitiativeModifier(idCombatEncounter);
    if (!participants.length)
      throw new HttpErrors.Conflict('Combate sem participantes');

    const current =
      participants.find(
        p => p.id_combat_participant === context.current_turn_participant_id,
      ) ?? participants[0];

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

    await this.advanceToNextTurn(
      idCombatEncounter,
      participants,
      current.id_combat_participant,
      context.round_number,
    );

    const combat = (await this.getActiveEncounterDetail(
      context.id_game_session,
    ))!;
    this.events.publish({
      type: 'turn_ended',
      id_game_session: context.id_game_session,
      combat,
    });
  }

  /**
   * O mestre reordena manualmente a iniciativa: move um participante uma posição pra cima/baixo,
   * trocando seu turn_order com o vizinho. Funciona a qualquer momento durante um combate ativo
   * — como o turno atual é rastreado por id (não por índice), reordenar não faz o turno "pular"
   * pra outro participante.
   */
  async moveParticipant(
    idCombatEncounter: string,
    idCombatParticipant: string,
    direction: 'up' | 'down',
    userId: string,
  ): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.dm_user_id !== userId) {
      throw new HttpErrors.Forbidden(
        'Apenas o mestre pode reordenar a iniciativa',
      );
    }
    if (context.status !== 'active') {
      throw new HttpErrors.Conflict(
        'Só é possível reordenar a iniciativa durante um combate ativo',
      );
    }

    const participants =
      await this.findParticipantsWithLiveInitiativeModifier(idCombatEncounter);
    const index = participants.findIndex(
      p => p.id_combat_participant === idCombatParticipant,
    );
    if (index === -1)
      throw new HttpErrors.NotFound('Participante não encontrado');

    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= participants.length) return;

    const current = participants[index];
    const target = participants[swapIndex];
    await this.repository.setTurnOrder(
      current.id_combat_participant,
      target.turn_order ?? swapIndex,
    );
    await this.repository.setTurnOrder(
      target.id_combat_participant,
      current.turn_order ?? index,
    );

    const combat = (await this.getActiveEncounterDetail(
      context.id_game_session,
    ))!;
    this.events.publish({
      type: 'turn_order_changed',
      id_game_session: context.id_game_session,
      combat,
    });
  }

  /**
   * O jogador (ou o mestre, pelo NPC/monstro da vez) atrasa o turno atual: ele passa a agir por
   * último nesta rodada, mantendo a posição normal a partir da próxima (regra simplificada —
   * o livro só tem a ação Preparar, que reage a um gatilho específico via reação, não uma troca
   * livre de posição na ordem).
   */
  async delayTurn(idCombatEncounter: string, userId: string): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.status !== 'active') {
      throw new HttpErrors.Conflict('Esse combate não está na fase de turnos');
    }

    const participants =
      await this.findParticipantsWithLiveInitiativeModifier(idCombatEncounter);
    if (!participants.length)
      throw new HttpErrors.Conflict('Combate sem participantes');

    const current = participants.find(
      p => p.id_combat_participant === context.current_turn_participant_id,
    );
    if (!current)
      throw new HttpErrors.Conflict(
        'Não foi possível determinar o turno atual',
      );
    if (current.delayed_this_round) {
      throw new HttpErrors.Conflict('Esse turno já foi atrasado nesta rodada');
    }

    const isDm = context.dm_user_id === userId;
    if (!isDm) {
      if (current.participant_type !== 'player') {
        throw new HttpErrors.Forbidden(
          'Apenas o mestre pode agir por esse participante',
        );
      }
      const owner = await this.repository.findParticipantContext(
        current.id_combat_participant,
      );
      if (owner?.player_user_id !== userId) {
        throw new HttpErrors.Forbidden('Não é o seu turno');
      }
    }

    await this.repository.setDelayed(current.id_combat_participant, true);
    const updatedParticipants = participants.map(p =>
      p.id_combat_participant === current.id_combat_participant
        ? {...p, delayed_this_round: true}
        : p,
    );

    await this.advanceToNextTurn(
      idCombatEncounter,
      updatedParticipants,
      current.id_combat_participant,
      context.round_number,
    );

    const combat = (await this.getActiveEncounterDetail(
      context.id_game_session,
    ))!;
    this.events.publish({
      type: 'turn_delayed',
      id_game_session: context.id_game_session,
      combat,
    });
  }

  async endEncounter(idCombatEncounter: string, userId: string): Promise<void> {
    const context =
      await this.repository.findEncounterContext(idCombatEncounter);
    if (!context) throw new HttpErrors.NotFound('Combate não encontrado');
    if (context.dm_user_id !== userId) {
      throw new HttpErrors.Forbidden('Apenas o mestre pode encerrar o combate');
    }

    await this.repository.finishEncounter(idCombatEncounter);
    const hiddenMonsterIds = await this.gameSessionRepository.hideAllMonsters(
      context.id_game_session,
    );
    this.events.publish({
      type: 'combat_ended',
      id_game_session: context.id_game_session,
      id_combat_encounter: idCombatEncounter,
      hidden_monster_ids: hiddenMonsterIds,
    });
  }

  private rollD20(): number {
    return Math.floor(Math.random() * 20) + 1;
  }
}
