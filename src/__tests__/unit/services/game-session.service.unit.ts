/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {GameSessionService} from '../../../services/game-session.service';
import {SessionEventsService} from '../../../services/session-events.service';
import {CombatService} from '../../../services/combat.service';
import {MonsterCatalogService} from '../../../services/monster-catalog.service';
import {SupabaseStorageService} from '../../../services/supabase-storage.service';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {
  GameSessionDetail,
  MonsterSession,
  RollLogEntry,
  RollLogInput,
} from '../../../models/game-session-types';
import {SessionEvent} from '../../../models/session-event-types';

function monster(
  id: string,
  overrides: Partial<MonsterSession> = {},
): MonsterSession {
  return {
    id_monster_session: id,
    id_game_session: 'gs',
    monster_api_slug: 'goblin',
    hp_current: 7,
    hp_max: 7,
    ac: 15,
    data_snapshot: {name: 'Goblin'},
    is_revealed: false,
    image_url: null,
    ...overrides,
  };
}

function sessionDetail(): GameSessionDetail {
  return {
    game_session: {user_id: 'dm'} as GameSessionDetail['game_session'],
    players: [],
    npcs: [],
    monsters: [
      monster('m1', {is_revealed: true}),
      monster('m2', {
        is_revealed: true,
        custom_name: 'Chefão',
        image_url: 'c.png',
      }),
      monster('m3'),
    ],
    revealed_monsters: [],
    recent_rolls: [
      {id: 'r1', is_hidden: false} as unknown as RollLogEntry,
      {id: 'r2', is_hidden: true} as unknown as RollLogEntry,
    ],
    combat: null,
  };
}

const ROLL: RollLogInput = {
  id_character: 1,
  actor_name: 'Thorin',
  roll_type: 'attack',
  label: 'Machado',
  dice_notation: '1d20+5',
  rolls: [12],
  advantage_state: 'normal',
  modifier: 5,
  total: 17,
};

describe('GameSessionService', () => {
  let repository: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
  let combatService: StubbedInstanceWithSinonAccessor<CombatService>;
  let events: SessionEvent[];
  let service: GameSessionService;

  beforeEach(() => {
    repository = createStubInstance(GameSessionRepository);
    combatService = createStubInstance(CombatService);
    combatService.stubs.getActiveEncounterDetail.resolves(null);
    const bus = new SessionEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new GameSessionService(
      repository,
      combatService,
      bus,
      createStubInstance(MonsterCatalogService),
      createStubInstance(SupabaseStorageService),
    );
  });

  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  describe('getSession', () => {
    beforeEach(() => {
      repository.stubs.findById.resolves(sessionDetail());
      repository.stubs.hasSessionAccess.resolves(true);
    });

    it('mestre vê todos os monstros e todas as rolagens', async () => {
      const detail = await service.getSession('gs', 'dm');
      expect(detail.monsters.map(m => m.id_monster_session)).to.eql([
        'm1',
        'm2',
        'm3',
      ]);
      expect(detail.recent_rolls.length).to.equal(2);
    });

    it('jogador não vê a lista de monstros, só os revelados (nome + imagem), e não vê rolagem oculta', async () => {
      const detail = await service.getSession('gs', 'player');
      expect(detail.monsters).to.eql([]);
      expect(detail.revealed_monsters).to.eql([
        {id_monster_session: 'm1', name: 'Goblin', image_url: null},
        {id_monster_session: 'm2', name: 'Chefão', image_url: 'c.png'},
      ]);
      expect(
        detail.recent_rolls.map(r => (r as unknown as {id: string}).id),
      ).to.eql(['r1']);
    });

    it('sessão inexistente ou sem acesso', async () => {
      repository.stubs.hasSessionAccess.resolves(false);
      await expect(service.getSession('gs', 'intruso')).to.be.rejectedWith(
        /não tem acesso/,
      );
      repository.stubs.findById.resolves(null);
      await expect(service.getSession('gs', 'dm')).to.be.rejectedWith(
        /não encontrada/,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('pontos de vida', () => {
    it('jogador: valida inteiros e PV temporário não negativo', async () => {
      await expect(
        service.updateCharacterHp('ps', 1.5, 0, 'u'),
      ).to.be.rejectedWith(/current_hit_points/);
      await expect(
        service.updateCharacterHp('ps', 10, -1, 'u'),
      ).to.be.rejectedWith(/temporary_hit_points/);
      expect(repository.stubs.updateCharacterHp.called).to.be.false();
    });

    it('jogador: traduz status do repositório e publica o novo PV', async () => {
      repository.stubs.updateCharacterHp.resolves({status: 'unauthorized'});
      await expect(
        service.updateCharacterHp('ps', 10, 0, 'u'),
      ).to.be.rejectedWith(/não tem permissão/);
      repository.stubs.updateCharacterHp.resolves({status: 'not_found'});
      await expect(
        service.updateCharacterHp('ps', 10, 0, 'u'),
      ).to.be.rejectedWith(/não encontrado/);
      repository.stubs.updateCharacterHp.resolves({
        status: 'ok',
        idGameSession: 'gs',
      });
      await service.updateCharacterHp('ps', 10, 3, 'u');
      expect(events).to.eql([
        {
          type: 'player_hp_updated',
          id_game_session: 'gs',
          id_player_session: 'ps',
          current_hit_points: 10,
          temporary_hit_points: 3,
        },
      ]);
    });

    it('NPC e monstro: só o mestre', async () => {
      repository.stubs.updateNpcHp.resolves({status: 'unauthorized'});
      await expect(service.updateNpcHp('n', 5, 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      repository.stubs.updateMonsterHp.resolves({status: 'unauthorized'});
      await expect(
        service.updateMonsterHp('m', 5, 'player'),
      ).to.be.rejectedWith(/não tem permissão/);
      repository.stubs.updateMonsterHp.resolves({
        status: 'ok',
        idGameSession: 'gs',
      });
      await service.updateMonsterHp('m', 0, 'dm');
      expect(events[0]).to.containDeep({
        type: 'monster_hp_updated',
        hp_current: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('updateMonsterStats', () => {
    const valid = {hpCurrent: 5, hpMax: 10, ac: 13};

    it('valida PV, PV máximo, CA e atributos (1 a 30)', async () => {
      await expect(
        service.updateMonsterStats('m', 'dm', {...valid, hpCurrent: -1}),
      ).to.be.rejectedWith(/hp_current/);
      await expect(
        service.updateMonsterStats('m', 'dm', {...valid, hpMax: 0}),
      ).to.be.rejectedWith(/hp_max/);
      await expect(
        service.updateMonsterStats('m', 'dm', {...valid, ac: -1}),
      ).to.be.rejectedWith(/ac/);
      await expect(
        service.updateMonsterStats('m', 'dm', {
          ...valid,
          abilities: {strength: 31},
        }),
      ).to.be.rejectedWith(/strength/);
      expect(repository.stubs.updateMonsterStats.called).to.be.false();
    });

    it('nome em branco vira null e evento leva os valores novos', async () => {
      repository.stubs.updateMonsterStats.resolves({
        status: 'ok',
        idGameSession: 'gs',
      });
      await service.updateMonsterStats('m', 'dm', {
        ...valid,
        customName: '   ',
        abilities: {dexterity: 14},
      });
      expect(
        repository.stubs.updateMonsterStats.firstCall.args[2],
      ).to.containDeep({customName: null, abilities: {dexterity: 14}});
      expect(events[0]).to.containDeep({
        type: 'monster_stats_updated',
        custom_name: null,
        hp_max: 10,
        ac: 13,
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('monstros', () => {
    it('revelar anuncia nome (custom ou do snapshot) e imagem', async () => {
      repository.stubs.setMonsterRevealed.resolves({
        status: 'ok',
        idGameSession: 'gs',
        customName: null,
        dataSnapshot: {name: 'Orc'},
        imageUrl: 'o.png',
      });
      await service.revealMonster('m', 'dm');
      expect(events).to.eql([
        {
          type: 'monster_revealed',
          id_game_session: 'gs',
          id_monster_session: 'm',
          name: 'Orc',
          image_url: 'o.png',
        },
      ]);
    });

    it('esconder/revelar só pelo mestre', async () => {
      repository.stubs.setMonsterRevealed.resolves({status: 'unauthorized'});
      await expect(service.revealMonster('m', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      await expect(service.hideMonster('m', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
    });

    it('derrotar remove e anuncia com nome e imagem; sem nome cai pra "Monstro"', async () => {
      repository.stubs.removeMonster.resolves({
        status: 'ok',
        idGameSession: 'gs',
        customName: null,
        dataSnapshot: {},
        imageUrl: null,
      });
      await service.defeatMonster('m', 'dm');
      expect(events[0]).to.containDeep({
        type: 'monster_defeated',
        name: 'Monstro',
        image_url: null,
      });
    });
  });

  // -------------------------------------------------------------------------
  describe('grantXp', () => {
    it('valida quantidade e seleção', async () => {
      await expect(
        service.grantXp('gs', {xp_amount: 0, id_player_sessions: ['p']}, 'dm'),
      ).to.be.rejectedWith(/xp_amount/);
      await expect(
        service.grantXp(
          'gs',
          {xp_amount: 10.5, id_player_sessions: ['p']},
          'dm',
        ),
      ).to.be.rejectedWith(/xp_amount/);
      await expect(
        service.grantXp('gs', {xp_amount: 10}, 'dm'),
      ).to.be.rejectedWith(/ao menos um/);
    });

    it('só o mestre concede', async () => {
      repository.stubs.grantXp.resolves({status: 'unauthorized', granted: []});
      await expect(
        service.grantXp(
          'gs',
          {xp_amount: 10, id_player_sessions: ['p']},
          'player',
        ),
      ).to.be.rejectedWith(/Apenas o mestre/);
    });

    it('avisa can_level_up sempre que o total alcança o próximo nível (jogador e NPC)', async () => {
      repository.stubs.grantXp.resolves({
        status: 'ok',
        granted: [
          {
            participant_type: 'player',
            id_player_session: 'p1',
            id_character: 1,
            character_name: 'A',
            xp_points: 300,
            level: 1,
          },
          {
            participant_type: 'player',
            id_player_session: 'p2',
            id_character: 2,
            character_name: 'B',
            xp_points: 299,
            level: 1,
          },
          {
            participant_type: 'npc',
            id_npc_session: 'n1',
            id_character: 3,
            character_name: 'C',
            xp_points: 999999,
            level: 20,
          },
        ],
      });
      await service.grantXp(
        'gs',
        {
          xp_amount: 50,
          id_player_sessions: ['p1', 'p2'],
          id_npc_sessions: ['n1'],
        },
        'dm',
      );
      expect(
        events.map(e => [e.type, (e as {can_level_up: boolean}).can_level_up]),
      ).to.eql([
        ['player_xp_granted', true],
        ['player_xp_granted', false],
        ['npc_xp_granted', false],
      ]);
    });
  });

  // -------------------------------------------------------------------------
  describe('addRoll', () => {
    beforeEach(() => {
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.addRoll.callsFake(
        async (_gs, input) => ({...input}) as unknown as RollLogEntry,
      );
    });

    it('valida campos obrigatórios e enums', async () => {
      await expect(
        service.addRoll('gs', {...ROLL, actor_name: ' '}, 'u'),
      ).to.be.rejectedWith(/actor_name/);
      await expect(
        service.addRoll('gs', {...ROLL, label: ''}, 'u'),
      ).to.be.rejectedWith(/label/);
      await expect(
        service.addRoll('gs', {...ROLL, dice_notation: ''}, 'u'),
      ).to.be.rejectedWith(/dice_notation/);
      await expect(
        service.addRoll('gs', {...ROLL, rolls: []}, 'u'),
      ).to.be.rejectedWith(/rolls/);
      await expect(
        service.addRoll('gs', {...ROLL, roll_type: 'xyz' as never}, 'u'),
      ).to.be.rejectedWith(/roll_type/);
      await expect(
        service.addRoll('gs', {...ROLL, advantage_state: 'xyz' as never}, 'u'),
      ).to.be.rejectedWith(/advantage_state/);
    });

    it('sem acesso à sessão ou sem permissão pro personagem', async () => {
      repository.stubs.canPostRollFor.resolves(false);
      await expect(service.addRoll('gs', ROLL, 'u')).to.be.rejectedWith(
        /não pode registrar/,
      );
      repository.stubs.hasSessionAccess.resolves(false);
      await expect(service.addRoll('gs', ROLL, 'u')).to.be.rejectedWith(
        /não tem acesso/,
      );
    });

    it('rolagem oculta só vale pro mestre; jogador tem o campo ignorado', async () => {
      repository.stubs.isSessionOwner.withArgs('gs', 'dm').resolves(true);
      repository.stubs.isSessionOwner.withArgs('gs', 'player').resolves(false);
      await service.addRoll('gs', {...ROLL, is_hidden: true}, 'dm');
      await service.addRoll('gs', {...ROLL, is_hidden: true}, 'player');
      expect(
        repository.stubs.addRoll.args.map(([, input]) => input.is_hidden),
      ).to.eql([true, false]);
      expect(events.map(e => e.type)).to.eql(['roll_added', 'roll_added']);
    });
  });

  // -------------------------------------------------------------------------
  describe('announceSpellCast', () => {
    it('só publica (não persiste) e exige permissão', async () => {
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      await service.announceSpellCast(
        'gs',
        {id_character: 1, actor_name: 'Merlin', spell_name: 'Bola de Fogo'},
        'u',
      );
      expect(events).to.eql([
        {
          type: 'spell_cast',
          id_game_session: 'gs',
          id_character: 1,
          actor_name: 'Merlin',
          spell_name: 'Bola de Fogo',
        },
      ]);
      expect(repository.stubs.addRoll.called).to.be.false();

      repository.stubs.canPostRollFor.resolves(false);
      await expect(
        service.announceSpellCast(
          'gs',
          {id_character: 1, actor_name: 'X', spell_name: 'Y'},
          'u',
        ),
      ).to.be.rejectedWith(/não pode anunciar/);
    });
  });
});
