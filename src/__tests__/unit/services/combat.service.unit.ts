/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {CombatService} from '../../../services/combat.service';
import {SessionEventsService} from '../../../services/session-events.service';
import {
  CombatRepository,
  EncounterContext,
  ParticipantContext,
} from '../../../repositories/combat.repository';
import {CharacterRepository} from '../../../repositories/character.repository';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {CombatEncounter, CombatParticipant} from '../../../models/combat-types';
import {GameSessionDetail} from '../../../models/game-session-types';
import {SessionEvent} from '../../../models/session-event-types';

type Row = CombatParticipant & {id_character: number | null};

function participant(id: string, overrides: Partial<Row> = {}): Row {
  return {
    id_combat_participant: id,
    id_combat_encounter: 'enc',
    participant_type: 'player',
    id_player_session: `ps-${id}`,
    id_npc_session: null,
    id_monster_session: null,
    initiative_roll: 10,
    initiative_total: 10,
    dex_modifier: 0,
    turn_order: null,
    delayed_this_round: false,
    id_character: null,
    ...overrides,
  };
}

function encounterContext(
  overrides: Partial<EncounterContext> = {},
): EncounterContext {
  return {
    id_game_session: 'gs',
    dm_user_id: 'dm',
    status: 'active',
    round_number: 1,
    current_turn_participant_id: 'a',
    ...overrides,
  };
}

function participantContext(
  overrides: Partial<ParticipantContext> = {},
): ParticipantContext {
  return {
    id_combat_encounter: 'enc',
    id_game_session: 'gs',
    dm_user_id: 'dm',
    status: 'rolling_initiative',
    participant_type: 'player',
    player_user_id: 'player',
    initiative_total: null,
    ...overrides,
  };
}

const ENCOUNTER: CombatEncounter = {
  id_combat_encounter: 'enc',
  id_game_session: 'gs',
  status: 'active',
  round_number: 1,
  current_turn_participant_id: 'a',
  created_at: new Date(0),
  defeated_xp: 0,
};

describe('CombatService', () => {
  let repository: StubbedInstanceWithSinonAccessor<CombatRepository>;
  let characterRepository: StubbedInstanceWithSinonAccessor<CharacterRepository>;
  let gameSessionRepository: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
  let events: SessionEvent[];
  let service: CombatService;

  beforeEach(() => {
    repository = createStubInstance(CombatRepository);
    characterRepository = createStubInstance(CharacterRepository);
    gameSessionRepository = createStubInstance(GameSessionRepository);
    const bus = new SessionEventsService();
    events = [];
    bus.subscribe(e => events.push(e));

    characterRepository.stubs.findChosenFeatsForCharacters.resolves([]);
    repository.stubs.findActiveEncounterByGameSession.resolves(ENCOUNTER);
    repository.stubs.findParticipants.resolves([]);
    gameSessionRepository.stubs.revealMonsters.resolves([]);

    service = new CombatService(
      repository,
      characterRepository,
      gameSessionRepository,
      bus,
    );
  });

  afterEach(() => sinon.restore());

  const eventTypes = () => events.map(e => e.type);

  // -------------------------------------------------------------------------
  describe('ordem de iniciativa', () => {
    it('sem turn_order: ordena por total, depois DES, depois id; sem rolagem vai pro fim', async () => {
      repository.stubs.findParticipants.resolves([
        participant('c', {initiative_total: 15, dex_modifier: 1}),
        participant('a', {initiative_total: 15, dex_modifier: 3}),
        participant('d', {initiative_total: null}),
        participant('b', {initiative_total: 20}),
        participant('e', {initiative_total: 15, dex_modifier: 1}),
      ]);
      const detail = await service.getActiveEncounterDetail('gs');
      expect(detail!.participants.map(p => p.id_combat_participant)).to.eql([
        'b',
        'a',
        'c',
        'e',
        'd',
      ]);
    });

    it('turn_order manda (reordenação manual do mestre) e marca o turno atual', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {initiative_total: 20, turn_order: 1}),
        participant('b', {initiative_total: 5, turn_order: 0}),
      ]);
      const detail = await service.getActiveEncounterDetail('gs');
      expect(
        detail!.participants.map(p => [
          p.id_combat_participant,
          p.is_current_turn,
        ]),
      ).to.eql([
        ['b', false],
        ['a', true],
      ]);
    });

    it('talento Alerta soma +5 no desempate de DES', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {
          initiative_total: 12,
          dex_modifier: 3,
          id_character: 1,
        }),
        participant('b', {
          initiative_total: 12,
          dex_modifier: 1,
          id_character: 2,
        }),
      ]);
      characterRepository.stubs.findChosenFeatsForCharacters.resolves([
        {id_character: 2, feat_id: 'alerta'},
      ]);
      const detail = await service.getActiveEncounterDetail('gs');
      expect(
        detail!.participants.map(p => [
          p.id_combat_participant,
          p.dex_modifier,
        ]),
      ).to.eql([
        ['b', 6],
        ['a', 3],
      ]);
    });

    it('sem combate ativo devolve null', async () => {
      repository.stubs.findActiveEncounterByGameSession.resolves(null);
      expect(await service.getActiveEncounterDetail('gs')).to.be.null();
    });
  });

  // -------------------------------------------------------------------------
  describe('startEncounter', () => {
    beforeEach(() => {
      gameSessionRepository.stubs.findById.resolves({
        game_session: {user_id: 'dm'},
      } as GameSessionDetail);
      repository.stubs.findActiveEncounterByGameSession
        .onFirstCall()
        .resolves(null);
      repository.stubs.createEncounter.resolves({
        ...ENCOUNTER,
        status: 'rolling_initiative',
      });
      repository.stubs.filterValidPlayerSessions.callsFake(
        async (_gs, ids) => ids,
      );
      repository.stubs.getValidNpcCombatInfo.resolves([]);
      repository.stubs.getValidMonsterDexModifiers.callsFake(async (_gs, ids) =>
        ids.map(id => ({id_monster_session: id, dexterity: 14})),
      );
      repository.stubs.addMonsterParticipant.callsFake(
        async (_enc, id) => `p-${id}`,
      );
    });

    it('só o mestre inicia, sem combate duplicado e com ao menos um participante', async () => {
      await expect(
        service.startEncounter(
          'gs',
          [{participant_type: 'player', id: 'p1'}],
          'player',
        ),
      ).to.be.rejectedWith(/Apenas o mestre/);
      await expect(service.startEncounter('gs', [], 'dm')).to.be.rejectedWith(
        /ao menos um participante/,
      );
      repository.stubs.findActiveEncounterByGameSession.resetBehavior();
      repository.stubs.findActiveEncounterByGameSession.resolves(ENCOUNTER);
      await expect(
        service.startEncounter(
          'gs',
          [{participant_type: 'player', id: 'p1'}],
          'dm',
        ),
      ).to.be.rejectedWith(/combate em andamento/);
    });

    it('participante de outra sessão é rejeitado', async () => {
      repository.stubs.filterValidPlayerSessions.resolves([]);
      await expect(
        service.startEncounter(
          'gs',
          [{participant_type: 'player', id: 'intruso'}],
          'dm',
        ),
      ).to.be.rejectedWith(/não pertencem a essa sessão/);
      expect(repository.stubs.createEncounter.called).to.be.false();
    });

    it('com jogadores: fica rolando iniciativa e não ativa a ordem ainda', async () => {
      await service.startEncounter(
        'gs',
        [{participant_type: 'player', id: 'p1'}],
        'dm',
      );
      expect(repository.stubs.addPlayerParticipants.firstCall.args).to.eql([
        'enc',
        ['p1'],
      ]);
      expect(repository.stubs.activateEncounter.called).to.be.false();
      expect(eventTypes()).to.eql(['combat_started']);
    });

    it('só monstros: rola iniciativa automática (d20 + DES), ativa e anuncia revelados antes do início', async () => {
      sinon.stub(Math, 'random').returns(0.5); // d20 → 11
      repository.stubs.findParticipants.resolves([
        participant('p-m1', {participant_type: 'monster'}),
      ]);
      gameSessionRepository.stubs.revealMonsters.resolves([
        {
          id_monster_session: 'm1',
          custom_name: null,
          data_snapshot: {name: 'Goblin'},
          image_url: null,
          lore: null,
        },
      ]);

      await service.startEncounter(
        'gs',
        [{participant_type: 'monster', id: 'm1'}],
        'dm',
      );

      expect(repository.stubs.addMonsterParticipant.firstCall.args).to.eql([
        'enc',
        'm1',
        11,
        13,
      ]);
      expect(repository.stubs.appendTurnOrder.called).to.be.false();
      expect(repository.stubs.activateEncounter.firstCall.args).to.eql([
        'enc',
        'p-m1',
      ]);
      expect(eventTypes()).to.eql(['monster_revealed', 'combat_started']);
      expect(events[0]).to.containDeep({name: 'Goblin'});
    });
  });

  // -------------------------------------------------------------------------
  describe('addParticipants (entrar no combate em andamento)', () => {
    beforeEach(() => {
      repository.stubs.findEncounterContext.resolves(encounterContext());
      repository.stubs.findExistingParticipantSessionIds.resolves({
        playerSessionIds: ['p1'],
        npcSessionIds: [],
        monsterSessionIds: ['m1'],
      });
      repository.stubs.filterValidPlayerSessions.callsFake(
        async (_gs, ids) => ids,
      );
      repository.stubs.getValidNpcCombatInfo.callsFake(async (_gs, ids) =>
        ids.map(id => ({id_npc_session: id, id_character: 9, dex_modifier: 2})),
      );
      repository.stubs.getValidMonsterDexModifiers.callsFake(async (_gs, ids) =>
        ids.map(id => ({id_monster_session: id, dexterity: 10})),
      );
      repository.stubs.addNpcParticipant.callsFake(
        async (_enc, id) => `p-${id}`,
      );
      repository.stubs.addMonsterParticipant.callsFake(
        async (_enc, id) => `p-${id}`,
      );
    });

    it('só o mestre, combate não encerrado, lista não vazia', async () => {
      await expect(
        service.addParticipants(
          'enc',
          [{participant_type: 'npc', id: 'n1'}],
          'player',
        ),
      ).to.be.rejectedWith(/Apenas o mestre/);
      await expect(service.addParticipants('enc', [], 'dm')).to.be.rejectedWith(
        /ao menos um participante/,
      );
      repository.stubs.findEncounterContext.resolves(
        encounterContext({status: 'finished'}),
      );
      await expect(
        service.addParticipants(
          'enc',
          [{participant_type: 'npc', id: 'n1'}],
          'dm',
        ),
      ).to.be.rejectedWith(/encerrado/);
    });

    it('ignora quem já está no combate e rejeita se não sobrar ninguém', async () => {
      await expect(
        service.addParticipants(
          'enc',
          [
            {participant_type: 'player', id: 'p1'},
            {participant_type: 'monster', id: 'm1'},
          ],
          'dm',
        ),
      ).to.be.rejectedWith(/já estão no combate/);

      await service.addParticipants(
        'enc',
        [
          {participant_type: 'player', id: 'p1'},
          {participant_type: 'player', id: 'p2'},
        ],
        'dm',
      );
      expect(repository.stubs.addPlayerParticipants.firstCall.args).to.eql([
        'enc',
        ['p2'],
      ]);
    });

    it('combate ativo: NPC/monstro novos entram no fim da ordem; evento combat_participants_added', async () => {
      await service.addParticipants(
        'enc',
        [
          {participant_type: 'npc', id: 'n1'},
          {participant_type: 'monster', id: 'm2'},
        ],
        'dm',
      );
      expect(repository.stubs.appendTurnOrder.args).to.eql([
        ['enc', 'p-n1'],
        ['enc', 'p-m2'],
      ]);
      expect(eventTypes()).to.eql(['combat_participants_added']);
    });

    it('ainda rolando iniciativa: não mexe na ordem', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({status: 'rolling_initiative'}),
      );
      await service.addParticipants(
        'enc',
        [{participant_type: 'npc', id: 'n1'}],
        'dm',
      );
      expect(repository.stubs.appendTurnOrder.called).to.be.false();
    });

    it('monstro novo não revelado é anunciado antes do evento de participantes', async () => {
      gameSessionRepository.stubs.revealMonsters.resolves([
        {
          id_monster_session: 'm2',
          custom_name: 'Chefão',
          data_snapshot: {},
          image_url: 'x.png',
          lore: null,
        },
      ]);
      await service.addParticipants(
        'enc',
        [{participant_type: 'monster', id: 'm2'}],
        'dm',
      );
      expect(eventTypes()).to.eql([
        'monster_revealed',
        'combat_participants_added',
      ]);
      expect(events[0]).to.containDeep({name: 'Chefão', image_url: 'x.png'});
    });
  });

  // -------------------------------------------------------------------------
  describe('submitInitiative', () => {
    const input = {rolls: [14], modifier: 2, total: 16};

    it('dono do personagem ou mestre podem rolar; outros não', async () => {
      repository.stubs.findParticipantContext.resolves(participantContext());
      repository.stubs.countPendingParticipants.resolves(1);
      await expect(
        service.submitInitiative('a', input, 'intruso'),
      ).to.be.rejectedWith(/não pode registrar/);
      await service.submitInitiative('a', input, 'player');
      await service.submitInitiative('a', input, 'dm');
      expect(repository.stubs.setParticipantInitiative.firstCall.args).to.eql([
        'a',
        14,
        16,
      ]);
    });

    it('rejeita rolagem repetida, combate encerrado e rolls vazio', async () => {
      repository.stubs.findParticipantContext.resolves(
        participantContext({initiative_total: 12}),
      );
      await expect(
        service.submitInitiative('a', input, 'player'),
      ).to.be.rejectedWith(/já registrou/);
      repository.stubs.findParticipantContext.resolves(
        participantContext({status: 'finished'}),
      );
      await expect(
        service.submitInitiative('a', input, 'player'),
      ).to.be.rejectedWith(/encerrado/);
      repository.stubs.findParticipantContext.resolves(participantContext());
      await expect(
        service.submitInitiative('a', {...input, rolls: []}, 'player'),
      ).to.be.rejectedWith(/rolls/);
    });

    it('último a rolar ativa o combate com a ordem calculada', async () => {
      repository.stubs.findParticipantContext.resolves(participantContext());
      repository.stubs.countPendingParticipants.resolves(0);
      repository.stubs.findParticipants.resolves([
        participant('a', {initiative_total: 5}),
        participant('b', {initiative_total: 18}),
      ]);
      await service.submitInitiative('a', input, 'player');
      expect(repository.stubs.setTurnOrder.args).to.eql([
        ['b', 0],
        ['a', 1],
      ]);
      expect(repository.stubs.activateEncounter.firstCall.args).to.eql([
        'enc',
        'b',
      ]);
      expect(eventTypes()).to.eql(['initiative_submitted']);
    });

    it('combate já ativo: quem chegou depois entra no fim da ordem', async () => {
      repository.stubs.findParticipantContext.resolves(
        participantContext({status: 'active'}),
      );
      await service.submitInitiative('z', input, 'player');
      expect(repository.stubs.appendTurnOrder.firstCall.args).to.eql([
        'enc',
        'z',
      ]);
      expect(repository.stubs.activateEncounter.called).to.be.false();
    });
  });

  // -------------------------------------------------------------------------
  describe('turnos', () => {
    const ordered = () => [
      participant('a', {turn_order: 0}),
      participant('b', {turn_order: 1, participant_type: 'npc'}),
      participant('c', {turn_order: 2}),
    ];

    beforeEach(() => repository.stubs.findParticipants.resolves(ordered()));

    it('endTurn avança pro próximo na mesma rodada', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      await service.endTurn('enc', 'dm');
      expect(repository.stubs.updateTurnState.firstCall.args).to.eql([
        'enc',
        'b',
        1,
      ]);
      expect(repository.stubs.clearDelayedFlags.called).to.be.false();
      expect(eventTypes()).to.eql(['turn_ended']);
    });

    it('vez de um monstro: rola a recarga gasta, devolve lendárias e avisa o mestre', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {turn_order: 0}),
        participant('m', {
          turn_order: 1,
          participant_type: 'monster',
          id_player_session: null,
          id_monster_session: 'ms1',
        }),
      ]);
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      gameSessionRepository.stubs.findMonsterActionContext.resolves({
        id_game_session: 'gs',
        session_owner_id: 'dm',
        data_snapshot: {
          actions: [{name: 'Sopro', usage: {type: 'recharge', min: 5}}],
        },
        action_state: {recharge: ['Sopro'], legendary_used: 2},
      });
      sinon.stub(Math, 'random').returns(0.9); // d6 = 6
      await service.endTurn('enc', 'dm');
      const [id, state] =
        gameSessionRepository.stubs.writeMonsterActionState.firstCall.args;
      expect(id).to.equal('ms1');
      expect(state).to.containDeep({recharge: [], legendary_used: 0});
      expect(eventTypes()).to.eql([
        'monster_action_state_updated',
        'turn_ended',
      ]);
      const update = events[0] as Extract<
        SessionEvent,
        {type: 'monster_action_state_updated'}
      >;
      expect(update.recharge_rolls).to.eql([
        {ability: 'Sopro', roll: 6, min: 5, recharged: true},
      ]);
    });

    it('vez de um monstro sem nada gasto: não grava nem avisa', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {turn_order: 0}),
        participant('m', {
          turn_order: 1,
          participant_type: 'monster',
          id_monster_session: 'ms1',
        }),
      ]);
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      gameSessionRepository.stubs.findMonsterActionContext.resolves({
        id_game_session: 'gs',
        session_owner_id: 'dm',
        data_snapshot: {actions: []},
        action_state: null,
      });
      await service.endTurn('enc', 'dm');
      expect(
        gameSessionRepository.stubs.writeMonsterActionState.called,
      ).to.be.false();
      expect(eventTypes()).to.eql(['turn_ended']);
    });

    it('endTurn do último volta pro primeiro, nova rodada e limpa atrasos', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'c', round_number: 3}),
      );
      await service.endTurn('enc', 'dm');
      expect(repository.stubs.updateTurnState.firstCall.args).to.eql([
        'enc',
        'a',
        4,
      ]);
      expect(repository.stubs.clearDelayedFlags.calledOnce).to.be.true();
    });

    it('jogador só encerra o próprio turno; turno de NPC só o mestre', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      repository.stubs.findParticipantContext.resolves(
        participantContext({player_user_id: 'player'}),
      );
      await expect(service.endTurn('enc', 'outro')).to.be.rejectedWith(
        /Não é o seu turno/,
      );
      await service.endTurn('enc', 'player');

      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'b'}),
      );
      await expect(service.endTurn('enc', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
    });

    it('endTurn fora da fase de turnos é rejeitado', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({status: 'rolling_initiative'}),
      );
      await expect(service.endTurn('enc', 'dm')).to.be.rejectedWith(
        /fase de turnos/,
      );
    });

    it('delayTurn: marca o atraso, passa a vez pro próximo e avisa', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      await service.delayTurn('enc', 'dm');
      expect(repository.stubs.setDelayed.firstCall.args).to.eql(['a', true]);
      expect(repository.stubs.updateTurnState.firstCall.args[1]).to.equal('b');
      expect(eventTypes()).to.eql(['turn_delayed']);
    });

    // Regressão: delayTurn marcava o atraso antes de calcular o próximo — quem atrasou caía no
    // fim da ordem efetiva, o próximo dava a volta pro índice 0 e isso era tratado como rodada
    // nova (incrementava round_number e limpava o atraso recém-marcado).
    it('delayTurn não avança a rodada nem limpa o atraso recém-marcado', async () => {
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      await service.delayTurn('enc', 'dm');
      expect(repository.stubs.updateTurnState.firstCall.args).to.eql([
        'enc',
        'b',
        1,
      ]);
      expect(repository.stubs.clearDelayedFlags.called).to.be.false();
    });

    it('rodada completa com atraso: a atrasa → b → c → a → rodada 2 começa em a', async () => {
      // Simula o banco: delayed/turno/rodada persistem entre as chamadas.
      const state = {current: 'a', round: 1, delayed: new Set<string>()};
      repository.stubs.findParticipants.callsFake(async () =>
        ordered().map(p => ({
          ...p,
          delayed_this_round: state.delayed.has(p.id_combat_participant),
        })),
      );
      repository.stubs.findEncounterContext.callsFake(async () =>
        encounterContext({
          current_turn_participant_id: state.current,
          round_number: state.round,
        }),
      );
      repository.stubs.setDelayed.callsFake(async id => {
        state.delayed.add(id);
      });
      repository.stubs.clearDelayedFlags.callsFake(async () => {
        state.delayed.clear();
      });
      repository.stubs.updateTurnState.callsFake(async (_enc, next, round) => {
        state.current = next;
        state.round = round;
      });

      const turns: string[] = [];
      await service.delayTurn('enc', 'dm');
      for (let i = 0; i < 3; i++) {
        turns.push(`${state.current}@${state.round}`);
        await service.endTurn('enc', 'dm');
      }
      turns.push(`${state.current}@${state.round}`);

      expect(turns).to.eql(['b@1', 'c@1', 'a@1', 'a@2']);
      expect(state.delayed.size).to.equal(0);
      await expect(service.delayTurn('enc', 'dm')).to.be.fulfilled();
    });

    it('atrasar duas vezes na mesma rodada continua bloqueado depois do fix', async () => {
      const delayed = new Set<string>();
      repository.stubs.findParticipants.callsFake(async () =>
        ordered().map(p => ({
          ...p,
          delayed_this_round: delayed.has(p.id_combat_participant),
        })),
      );
      repository.stubs.setDelayed.callsFake(async id => {
        delayed.add(id);
      });
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      await service.delayTurn('enc', 'dm');
      // Volta a vez pro "a" na mesma rodada (depois de b e c) e ele tenta atrasar de novo.
      await expect(service.delayTurn('enc', 'dm')).to.be.rejectedWith(
        /já foi atrasado/,
      );
    });

    it('depois de atrasar, o último da ordem normal passa a vez pra quem atrasou (mesma rodada)', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {turn_order: 0, delayed_this_round: true}),
        participant('b', {turn_order: 1}),
        participant('c', {turn_order: 2}),
      ]);
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'c'}),
      );
      await service.endTurn('enc', 'dm');
      expect(repository.stubs.updateTurnState.firstCall.args).to.eql([
        'enc',
        'a',
        1,
      ]);
    });

    it('não dá pra atrasar duas vezes na mesma rodada', async () => {
      repository.stubs.findParticipants.resolves([
        participant('a', {turn_order: 0, delayed_this_round: true}),
      ]);
      repository.stubs.findEncounterContext.resolves(
        encounterContext({current_turn_participant_id: 'a'}),
      );
      await expect(service.delayTurn('enc', 'dm')).to.be.rejectedWith(
        /já foi atrasado/,
      );
    });

    it('moveParticipant troca turn_order com o vizinho; nas bordas não faz nada', async () => {
      repository.stubs.findEncounterContext.resolves(encounterContext());
      await service.moveParticipant('enc', 'b', 'up', 'dm');
      expect(repository.stubs.setTurnOrder.args).to.eql([
        ['b', 0],
        ['a', 1],
      ]);
      expect(eventTypes()).to.eql(['turn_order_changed']);

      repository.stubs.setTurnOrder.resetHistory();
      await service.moveParticipant('enc', 'a', 'up', 'dm');
      await service.moveParticipant('enc', 'c', 'down', 'dm');
      expect(repository.stubs.setTurnOrder.called).to.be.false();
    });

    it('moveParticipant só pelo mestre e com combate ativo', async () => {
      repository.stubs.findEncounterContext.resolves(encounterContext());
      await expect(
        service.moveParticipant('enc', 'b', 'up', 'player'),
      ).to.be.rejectedWith(/Apenas o mestre/);
      repository.stubs.findEncounterContext.resolves(
        encounterContext({status: 'rolling_initiative'}),
      );
      await expect(
        service.moveParticipant('enc', 'b', 'up', 'dm'),
      ).to.be.rejectedWith(/combate ativo/);
    });
  });

  // -------------------------------------------------------------------------
  describe('endEncounter', () => {
    it('só o mestre encerra; esconde os monstros e avisa todo mundo', async () => {
      repository.stubs.findEncounterContext.resolves(encounterContext());
      gameSessionRepository.stubs.hideAllMonsters.resolves(['m1', 'm2']);
      await expect(service.endEncounter('enc', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      await service.endEncounter('enc', 'dm');
      expect(
        repository.stubs.finishEncounter.calledOnceWith('enc'),
      ).to.be.true();
      // Fúria/Arma Sagrada dos personagens da sessão acabam com o combate
      expect(
        gameSessionRepository.stubs.clearActiveEffectsInSession.calledOnceWith(
          'gs',
        ),
      ).to.be.true();
      expect(events).to.eql([
        {
          type: 'combat_ended',
          id_game_session: 'gs',
          id_combat_encounter: 'enc',
          hidden_monster_ids: ['m1', 'm2'],
        },
      ]);
    });
  });
});
