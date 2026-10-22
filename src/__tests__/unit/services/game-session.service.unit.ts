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
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {CharacterSheetService} from '../../../services/character-sheet.service';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {
  GameSessionDetail,
  MonsterSession,
  RollLogEntry,
  RollLogInput,
} from '../../../models/game-session-types';
import {
  SessionEvent,
  eventTargetUserId,
  isDmOnlyEvent,
} from '../../../models/session-event-types';
import {SecretRollRequestStore} from '../../../services/secret-roll-requests';

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
    shown_reference_image: null,
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
  let storage: StubbedInstanceWithSinonAccessor<SupabaseStorageService>;
  let imageCleanup: StubbedInstanceWithSinonAccessor<ImageCleanupService>;
  let characterSheet: StubbedInstanceWithSinonAccessor<CharacterSheetService>;
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
      (storage = createStubInstance(SupabaseStorageService)),
      (imageCleanup = createStubInstance(ImageCleanupService)),
      (characterSheet = createStubInstance(CharacterSheetService)),
    );
  });

  afterEach(() => sinon.restore());

  // -------------------------------------------------------------------------
  describe('addPlayer — itens iniciais no inventário da sessão', () => {
    const input = {session_code: 'ABC', player_name: 'Ana', id_character: 7};
    beforeEach(() => {
      repository.stubs.findSessionByCode.resolves({
        id_game_session: 'gs',
        max_player_quantity: 5,
      } as never);
      repository.stubs.isUserInSession.resolves(false);
      repository.stubs.countPlayers.resolves(0);
      repository.stubs.addPlayer.resolves({id_player_session: 'ps'} as never);
      repository.stubs.findCharacterOwnerId.resolves('u1');
    });

    it('personagem de outro usuário: 403 e não entra', async () => {
      repository.stubs.findCharacterOwnerId.resolves('outro');
      await expect(service.addPlayer(input, 'u1')).to.be.rejectedWith({
        statusCode: 403,
      });
      expect(repository.stubs.addPlayer.called).to.be.false();
      expect(events).to.eql([]);
    });

    it('personagem inexistente: 404', async () => {
      repository.stubs.findCharacterOwnerId.resolves(undefined);
      await expect(service.addPlayer(input, 'u1')).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(repository.stubs.addPlayer.called).to.be.false();
    });

    it('entra com o equipamento inicial da classe e do antecedente do personagem', async () => {
      repository.stubs.findStartingKit.resolves({
        id_class: 7,
        id_background: 13,
      });
      await service.addPlayer(input, 'u1');
      const [, idGameSession, items] =
        repository.stubs.addPlayer.firstCall.args;
      expect(idGameSession).to.equal('gs');
      expect(items).to.containDeep([
        {item: 'Mochila', qty: 1},
        {item: 'Tocha', qty: 10},
        {item: 'Insígnia de patente', qty: 1},
      ]);
      expect(repository.stubs.findStartingKit.calledWith(7)).to.be.true();
    });

    it('personagem não encontrado: entra sem itens', async () => {
      repository.stubs.findStartingKit.resolves(null);
      await service.addPlayer(input, 'u1');
      expect(repository.stubs.addPlayer.firstCall.args[2]).to.eql([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('addNpc — só personagem do próprio mestre', () => {
    beforeEach(() => {
      const detail = sessionDetail();
      repository.stubs.findById.resolves(detail);
      repository.stubs.addNpc.resolves({
        id_npc_session: 'n1',
        id_game_session: 'gs',
        id_character: 9,
      } as never);
    });

    it('mestre com personagem dele: adiciona', async () => {
      repository.stubs.findCharacterOwnerId.resolves('dm');
      await service.addNpc('gs', 9, 'dm');
      expect(repository.stubs.addNpc.calledWith('gs', 9)).to.be.true();
    });

    it('mestre com personagem de outro usuário: 403', async () => {
      repository.stubs.findCharacterOwnerId.resolves('jogador');
      await expect(service.addNpc('gs', 9, 'dm')).to.be.rejectedWith({
        statusCode: 403,
      });
      expect(repository.stubs.addNpc.called).to.be.false();
    });

    it('quem não é o mestre continua recebendo 403 antes de tudo', async () => {
      await expect(service.addNpc('gs', 9, 'jogador')).to.be.rejectedWith({
        statusCode: 403,
      });
      expect(repository.stubs.findCharacterOwnerId.called).to.be.false();
    });
  });

  // -------------------------------------------------------------------------
  describe('aplicar dano/cura de uma rolagem (applyAmount)', () => {
    const goblin = {
      id_character: null,
      label: 'Goblin',
      current: 7,
      max: 7,
      temp: 0,
      is_revealed: true,
    };
    const ally = {
      id_character: 20,
      label: 'Thorin',
      current: 10,
      max: 30,
      temp: 3,
      is_revealed: true,
    };
    const input = (overrides = {}) => ({
      id_character: 7,
      target_kind: 'player' as const,
      target_id: 'p2',
      amount: 5,
      kind: 'heal' as const,
      ...overrides,
    });

    beforeEach(() => {
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.isSessionOwner.resolves(false);
      repository.stubs.findCharacterName.resolves('Ana');
      repository.stubs.findApplyTarget.resolves(ally);
      repository.stubs.resolveRelentlessEndurance.callsFake(
        async (_id, hp) => ({
          finalHp: hp,
          relentlessEndurance: null,
        }),
      );
    });

    it('jogador cura um aliado: o servidor calcula o PV, avisa a mesa', async () => {
      const result = await service.applyAmount('gs', input(), 'u1');
      expect(result).to.eql({current_hit_points: 15, temporary_hit_points: 3});
      expect(
        repository.stubs.writeCharacterHp.calledWith(20, 15, 3),
      ).to.be.true();
      expect(events.map(e => e.type)).to.eql([
        'player_hp_updated',
        'amount_applied',
      ]);
      expect(events[1]).to.containDeep({
        actor_name: 'Ana',
        target_label: 'Thorin',
        amount: 5,
        kind: 'heal',
      });
    });

    it('dano em aliado passa pela Resistência Implacável e avisa o uso', async () => {
      repository.stubs.resolveRelentlessEndurance.resolves({
        finalHp: 1,
        relentlessEndurance: {idCharacter: 20, name: 'Thorin'},
      });
      const result = await service.applyAmount(
        'gs',
        input({kind: 'damage', amount: 50}),
        'u1',
      );
      expect(result.current_hit_points).to.equal(1);
      expect(events.map(e => e.type)).to.eql([
        'player_hp_updated',
        'spell_cast',
        'amount_applied',
      ]);
    });

    it('jogador dá dano em monstro revelado; o PV do monstro não volta pra ele', async () => {
      repository.stubs.findApplyTarget.resolves(goblin);
      const result = await service.applyAmount(
        'gs',
        input({
          target_kind: 'monster',
          target_id: 'm1',
          kind: 'damage',
          amount: 4,
        }),
        'u1',
      );
      expect(result).to.eql({});
      expect(repository.stubs.writeMonsterHp.calledWith('m1', 3)).to.be.true();
      const hpEvent = events.find(e => e.type === 'monster_hp_updated')!;
      expect(isDmOnlyEvent(hpEvent)).to.be.true();
      expect(
        isDmOnlyEvent(events.find(e => e.type === 'amount_applied')!),
      ).to.be.false();
    });

    it('monstro escondido: 404 pro jogador, mas o mestre aplica', async () => {
      repository.stubs.findApplyTarget.resolves({
        ...goblin,
        is_revealed: false,
      });
      const monsterDamage = input({
        target_kind: 'monster',
        target_id: 'm1',
        kind: 'damage',
      });
      await expect(
        service.applyAmount('gs', monsterDamage, 'u1'),
      ).to.be.rejectedWith({statusCode: 404});
      repository.stubs.isSessionOwner.resolves(true);
      await service.applyAmount('gs', monsterDamage, 'dm');
      expect(repository.stubs.writeMonsterHp.called).to.be.true();
    });

    it('jogador não cura monstro; PV temporário só em jogador', async () => {
      repository.stubs.findApplyTarget.resolves(goblin);
      await expect(
        service.applyAmount(
          'gs',
          input({target_kind: 'monster', target_id: 'm1'}),
          'u1',
        ),
      ).to.be.rejectedWith({statusCode: 422});
      repository.stubs.findApplyTarget.resolves(ally);
      await expect(
        service.applyAmount(
          'gs',
          input({target_kind: 'npc', target_id: 'n1', kind: 'temp_hp'}),
          'u1',
        ),
      ).to.be.rejectedWith({statusCode: 422});
    });

    it('quem não controla o personagem da rolagem: 403, nada gravado', async () => {
      repository.stubs.canPostRollFor.resolves(false);
      await expect(
        service.applyAmount('gs', input(), 'outro'),
      ).to.be.rejectedWith({
        statusCode: 403,
      });
      expect(repository.stubs.writeCharacterHp.called).to.be.false();
      expect(events).to.eql([]);
    });

    it('validação: quantidade inteira de 1 a 9999, tipos conhecidos, alvo da sessão', async () => {
      for (const bad of [0, -2, 1.5, 10000]) {
        await expect(
          service.applyAmount('gs', input({amount: bad}), 'u1'),
        ).to.be.rejectedWith({statusCode: 422});
      }
      await expect(
        service.applyAmount('gs', input({kind: 'set'}), 'u1'),
      ).to.be.rejectedWith({statusCode: 422});
      repository.stubs.findApplyTarget.resolves(null);
      await expect(service.applyAmount('gs', input(), 'u1')).to.be.rejectedWith(
        {
          statusCode: 404,
        },
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('imagens de referência', () => {
    const image = (overrides = {}) => ({
      id_reference_image: 'img1',
      id_game_session: 'gs',
      image_url: 'https://cdn/ref.png',
      title: 'Mapa da masmorra',
      created_at: new Date(),
      session_owner_id: 'dm',
      is_shown: false,
      ...overrides,
    });
    const upload = (user: string, title?: string | null) =>
      service.addReferenceImage(
        'gs',
        user,
        Buffer.from('x'),
        'image/png',
        title,
      );

    beforeEach(() => {
      repository.stubs.findSessionOwnerId.resolves('dm');
      repository.stubs.countReferenceImages.resolves(0);
      repository.stubs.addReferenceImage.callsFake(async (id, url, title) =>
        image({image_url: url, title}),
      );
      storage.stubs.uploadImage.resolves('https://cdn/novo.png');
    });

    it('mestre sobe imagem com legenda aparada (vazia vira sem legenda)', async () => {
      const created = await upload('dm', '  Taverna  ');
      expect(created.title).to.equal('Taverna');
      expect(
        repository.stubs.addReferenceImage.calledWith(
          'gs',
          'https://cdn/novo.png',
          'Taverna',
        ),
      ).to.be.true();
      await upload('dm', '   ');
      expect(
        repository.stubs.addReferenceImage.secondCall.args[2],
      ).to.be.null();
    });

    it('jogador não sobe (403) e o arquivo nem chega no storage; sessão inexistente: 404', async () => {
      await expect(upload('jogador')).to.be.rejectedWith({statusCode: 403});
      expect(storage.stubs.uploadImage.called).to.be.false();
      repository.stubs.findSessionOwnerId.resolves(undefined);
      await expect(upload('dm')).to.be.rejectedWith({statusCode: 404});
    });

    it('legenda longa demais e limite de imagens: 422 sem upload', async () => {
      await expect(upload('dm', 'x'.repeat(121))).to.be.rejectedWith({
        statusCode: 422,
      });
      repository.stubs.countReferenceImages.resolves(30);
      await expect(upload('dm')).to.be.rejectedWith({statusCode: 422});
      expect(storage.stubs.uploadImage.called).to.be.false();
    });

    it('falha ao gravar descarta o arquivo enviado', async () => {
      repository.stubs.addReferenceImage.rejects(new Error('db'));
      await expect(upload('dm')).to.be.rejectedWith('db');
      expect(
        imageCleanup.stubs.deleteIfUnreferenced.calledWith([
          'https://cdn/novo.png',
        ]),
      ).to.be.true();
    });

    it('lista só pro mestre', async () => {
      repository.stubs.listReferenceImages.resolves([image()]);
      expect(await service.listReferenceImages('gs', 'dm')).to.have.length(1);
      await expect(
        service.listReferenceImages('gs', 'jogador'),
      ).to.be.rejectedWith({statusCode: 403});
    });

    it('mostrar: grava a imagem em exibição e avisa a mesa toda', async () => {
      repository.stubs.findReferenceImage.resolves(image());
      const shown = await service.showReferenceImage('img1', 'dm');
      expect(shown).to.eql({
        id_reference_image: 'img1',
        image_url: 'https://cdn/ref.png',
        title: 'Mapa da masmorra',
      });
      expect(
        repository.stubs.setShownReferenceImage.calledWith('gs', 'img1'),
      ).to.be.true();
      expect(events).to.eql([
        {type: 'reference_image_shown', id_game_session: 'gs', image: shown},
      ]);
      expect(isDmOnlyEvent(events[0])).to.be.false();
    });

    it('mostrar/apagar imagem de outro mestre: 403; inexistente: 404', async () => {
      repository.stubs.findReferenceImage.resolves(
        image({session_owner_id: 'outro'}),
      );
      await expect(service.showReferenceImage('img1', 'dm')).to.be.rejectedWith(
        {statusCode: 403},
      );
      await expect(
        service.deleteReferenceImage('img1', 'dm'),
      ).to.be.rejectedWith({statusCode: 403});
      repository.stubs.findReferenceImage.resolves(null);
      await expect(service.showReferenceImage('x', 'dm')).to.be.rejectedWith({
        statusCode: 404,
      });
      expect(events).to.eql([]);
    });

    it('fechar: zera a exibição e avisa; só o mestre', async () => {
      await service.hideReferenceImage('gs', 'dm');
      expect(
        repository.stubs.setShownReferenceImage.calledWith('gs', null),
      ).to.be.true();
      expect(events).to.eql([
        {
          type: 'reference_image_hidden',
          id_game_session: 'gs',
          reason: 'hidden',
        },
      ]);
      await expect(
        service.hideReferenceImage('gs', 'jogador'),
      ).to.be.rejectedWith({statusCode: 403});
    });

    it('apagar: some do storage; se estava aberta, fecha pra todos', async () => {
      repository.stubs.findReferenceImage.resolves(image({is_shown: true}));
      await service.deleteReferenceImage('img1', 'dm');
      expect(
        repository.stubs.deleteReferenceImage.calledWith('img1'),
      ).to.be.true();
      expect(
        imageCleanup.stubs.deleteIfUnreferenced.calledWith([
          'https://cdn/ref.png',
        ]),
      ).to.be.true();
      expect(events.map(e => e.type)).to.eql(['reference_image_hidden']);

      events.length = 0;
      repository.stubs.findReferenceImage.resolves(image({is_shown: false}));
      await service.deleteReferenceImage('img1', 'dm');
      expect(events).to.eql([]);
    });

    it('jogador recebe a imagem em exibição ao abrir a sessão', async () => {
      const shown = {
        id_reference_image: 'img1',
        image_url: 'https://cdn/ref.png',
        title: null,
      };
      repository.stubs.findById.resolves({
        ...sessionDetail(),
        shown_reference_image: shown,
      });
      repository.stubs.hasSessionAccess.resolves(true);
      const detail = await service.getSession('gs', 'jogador');
      expect(detail.shown_reference_image).to.eql(shown);
    });
  });

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

    it('Resistência Implacável: grava 1 em vez de 0, devolve o PV final e avisa a mesa', async () => {
      repository.stubs.updateCharacterHp.resolves({
        status: 'ok',
        idGameSession: 'gs',
        currentHitPoints: 1,
        relentlessEndurance: {idCharacter: 9, name: 'Grom'},
      });
      const result = await service.updateCharacterHp('ps', 0, 0, 'u');
      expect(result).to.eql({current_hit_points: 1});
      expect(events).to.eql([
        {
          type: 'player_hp_updated',
          id_game_session: 'gs',
          id_player_session: 'ps',
          current_hit_points: 1,
          temporary_hit_points: 0,
        },
        {
          type: 'spell_cast',
          id_game_session: 'gs',
          id_character: 9,
          actor_name: 'Grom',
          spell_name: 'Resistência Implacável',
          save_dc: null,
          save_ability: null,
          is_ability: true,
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

    describe('revelar com combate em andamento', () => {
      beforeEach(() => {
        repository.stubs.setMonsterRevealed.resolves({
          status: 'ok',
          idGameSession: 'gs',
          customName: null,
          dataSnapshot: {name: 'Orc'},
          imageUrl: null,
        });
      });

      it('coloca o monstro na luta, como o + ADICIONAR', async () => {
        combatService.stubs.getActiveEncounterDetail.resolves({
          encounter: {id_combat_encounter: 'enc'},
          participants: [{id_monster_session: 'outro'}],
        } as never);
        await service.revealMonster('m', 'dm');
        sinon.assert.calledOnceWithExactly(
          combatService.stubs.addParticipants,
          'enc',
          [{participant_type: 'monster', id: 'm'}],
          'dm',
        );
      });

      it('monstro que já está na luta não entra de novo', async () => {
        combatService.stubs.getActiveEncounterDetail.resolves({
          encounter: {id_combat_encounter: 'enc'},
          participants: [{id_monster_session: 'm'}],
        } as never);
        await service.revealMonster('m', 'dm');
        sinon.assert.notCalled(combatService.stubs.addParticipants);
      });

      it('sem combate só revela', async () => {
        await service.revealMonster('m', 'dm');
        sinon.assert.notCalled(combatService.stubs.addParticipants);
      });

      it('quem não é mestre é barrado antes de mexer no combate', async () => {
        repository.stubs.setMonsterRevealed.resolves({status: 'unauthorized'});
        await expect(service.revealMonster('m', 'player')).to.be.rejected();
        sinon.assert.notCalled(combatService.stubs.getActiveEncounterDetail);
      });
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

    it('derrotar NÃO limpa a imagem (o modal de derrota ainda vai carregá-la)', async () => {
      repository.stubs.removeMonster.resolves({
        status: 'ok',
        idGameSession: 'gs',
        customName: 'Chefão',
        dataSnapshot: {},
        imageUrl: 'https://x/chefao.png',
      });
      await service.defeatMonster('m', 'dm');
      expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
    });

    it('remover limpa a imagem do monstro depois de avisar a sessão', async () => {
      repository.stubs.removeMonster.resolves({
        status: 'ok',
        idGameSession: 'gs',
        customName: null,
        dataSnapshot: {},
        imageUrl: 'https://x/m.png',
      });
      await service.removeMonster('m', 'dm');
      expect(events[0]).to.containDeep({type: 'monster_removed'});
      sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
        'https://x/m.png',
      ]);
    });

    it('remover sem permissão não limpa nada', async () => {
      repository.stubs.removeMonster.resolves({status: 'unauthorized'});
      await expect(service.removeMonster('m', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
    });

    it('trocar a imagem anuncia a nova e limpa a anterior', async () => {
      storage.stubs.uploadImage.resolves('https://x/nova.png');
      repository.stubs.setMonsterImage.resolves({
        status: 'ok',
        idGameSession: 'gs',
        monster: {id_monster_session: 'm'} as MonsterSession,
        previousImageUrl: 'https://x/velha.png',
      });
      await service.setMonsterImage('m', 'dm', Buffer.from('i'), 'image/png');
      expect(events[0]).to.containDeep({
        type: 'monster_image_updated',
        image_url: 'https://x/nova.png',
      });
      sinon.assert.calledOnceWithExactly(
        imageCleanup.stubs.deleteIfUnreferenced,
        ['https://x/velha.png'],
      );
    });

    it('troca de imagem recusada descarta o arquivo recém-enviado', async () => {
      storage.stubs.uploadImage.resolves('https://x/nova.png');
      repository.stubs.setMonsterImage.resolves({status: 'unauthorized'});
      await expect(
        service.setMonsterImage('m', 'player', Buffer.from('i'), 'image/png'),
      ).to.be.rejectedWith(/Apenas o mestre/);
      sinon.assert.calledOnceWithExactly(
        imageCleanup.stubs.deleteIfUnreferenced,
        ['https://x/nova.png'],
      );
      expect(events).to.be.empty();
    });
  });

  // -------------------------------------------------------------------------
  describe('deleteSession', () => {
    it('só o mestre exclui a sessão', async () => {
      repository.stubs.deleteOwnedSession.resolves({
        status: 'unauthorized',
        imageUrls: [],
      });
      await expect(service.deleteSession('gs', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      sinon.assert.calledWith(
        repository.stubs.deleteOwnedSession,
        'gs',
        'player',
      );
      expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
    });

    it('sessão inexistente', async () => {
      repository.stubs.deleteOwnedSession.resolves({
        status: 'not_found',
        imageUrls: [],
      });
      await expect(service.deleteSession('gs', 'dm')).to.be.rejectedWith(
        /Sessão com id gs não encontrada/,
      );
    });

    it('mestre exclui e as imagens dos monstros da sessão são limpas', async () => {
      repository.stubs.deleteOwnedSession.resolves({
        status: 'ok',
        imageUrls: ['https://x/a.png', 'https://x/b.png'],
      });
      await service.deleteSession('gs', 'dm');
      sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
        'https://x/a.png',
        'https://x/b.png',
      ]);
    });

    it('avisa quem está na sessão que ela foi apagada (só quando apagou)', async () => {
      repository.stubs.deleteOwnedSession.resolves({
        status: 'unauthorized',
        imageUrls: [],
      });
      await expect(service.deleteSession('gs', 'player')).to.be.rejected();
      expect(events).to.be.empty();
      repository.stubs.deleteOwnedSession.resolves({
        status: 'ok',
        imageUrls: [],
      });
      await service.deleteSession('gs', 'dm');
      expect(events).to.eql([{type: 'session_deleted', id_game_session: 'gs'}]);
    });
  });

  // -------------------------------------------------------------------------
  describe('anotações do mestre', () => {
    beforeEach(() => {
      repository.stubs.findDmNotes.resolves({
        user_id: 'dm',
        dm_notes: 'Goblins na ponte',
      });
    });

    it('só o mestre lê; sem anotação vem texto vazio', async () => {
      expect(await service.getDmNotes('gs', 'dm')).to.eql({
        notes: 'Goblins na ponte',
      });
      await expect(service.getDmNotes('gs', 'player')).to.be.rejectedWith(
        /Apenas o mestre/,
      );
      repository.stubs.findDmNotes.resolves({user_id: 'dm', dm_notes: null});
      expect(await service.getDmNotes('gs', 'dm')).to.eql({notes: ''});
      repository.stubs.findDmNotes.resolves(null);
      await expect(service.getDmNotes('gs', 'dm')).to.be.rejectedWith(
        /não encontrada/,
      );
    });

    it('só o mestre grava; texto em branco vira null', async () => {
      expect(await service.updateDmNotes('gs', 'Chefe: Orc', 'dm')).to.eql({
        notes: 'Chefe: Orc',
      });
      sinon.assert.calledWith(
        repository.stubs.updateDmNotes,
        'gs',
        'Chefe: Orc',
      );
      await service.updateDmNotes('gs', '   ', 'dm');
      sinon.assert.calledWith(repository.stubs.updateDmNotes, 'gs', null);
      await expect(
        service.updateDmNotes('gs', 'x', 'player'),
      ).to.be.rejectedWith(/Apenas o mestre/);
    });

    it('valida tipo e tamanho antes de gravar', async () => {
      await expect(service.updateDmNotes('gs', 42, 'dm')).to.be.rejectedWith(
        /texto/,
      );
      await expect(
        service.updateDmNotes('gs', 'a'.repeat(10_001), 'dm'),
      ).to.be.rejectedWith(/10000 caracteres/);
      expect(
        await service.updateDmNotes('gs', 'a'.repeat(10_000), 'dm'),
      ).to.be.ok();
      sinon.assert.calledOnce(repository.stubs.updateDmNotes);
    });
  });

  // -------------------------------------------------------------------------
  describe('partyRest', () => {
    function partyDetail(): GameSessionDetail {
      const character = (name: string, hp: number, temp = 0) =>
        ({
          name,
          current_hit_points: hp,
          max_hit_points: 20,
          temporary_hit_points: temp,
        }) as never;
      return {
        ...sessionDetail(),
        players: [
          {
            id_player_session: 'p1',
            id_character: 1,
            character: character('Ana', 5, 3),
          },
          {
            id_player_session: 'p2',
            id_character: 2,
            character: character('Bia', 0),
          },
          {id_player_session: 'p3', id_character: 3, character: null},
        ] as never,
        npcs: [
          {
            id_npc_session: 'n1',
            id_character: 9,
            character: character('Guarda', 4),
          },
        ] as never,
      };
    }

    beforeEach(() => {
      repository.stubs.isSessionOwner.resolves(true);
      repository.stubs.findById.resolves(partyDetail());
      characterSheet.stubs.longRest.resolves({current_hit_points: 20} as never);
      characterSheet.stubs.shortRest.resolves({resource_trackers: []});
    });

    it('valida tipo e seleção, e só o mestre declara', async () => {
      await expect(
        service.partyRest(
          'gs',
          {rest_type: 'nap' as never, id_player_sessions: ['p1']},
          'dm',
        ),
      ).to.be.rejectedWith(/rest_type/);
      await expect(
        service.partyRest('gs', {rest_type: 'long'}, 'dm'),
      ).to.be.rejectedWith(/ao menos um/);
      repository.stubs.isSessionOwner.resolves(false);
      await expect(
        service.partyRest(
          'gs',
          {rest_type: 'long', id_player_sessions: ['p1']},
          'p',
        ),
      ).to.be.rejectedWith(/Apenas o mestre/);
      sinon.assert.notCalled(characterSheet.stubs.longRest);
    });

    it('longo: PV cheio pros escolhidos (mantém PV temporário), pula quem está com 0 PV e avisa a mesa', async () => {
      const result = await service.partyRest(
        'gs',
        {
          rest_type: 'long',
          id_player_sessions: ['p1', 'p2', 'p3'],
          id_npc_sessions: ['n1'],
        },
        'dm',
      );
      expect(result).to.eql({
        rested: ['Ana', 'Guarda'],
        skipped: [{name: 'Bia', reason: 'sem pontos de vida'}],
      });
      expect(characterSheet.stubs.longRest.args).to.eql([
        [1, 'dm'],
        [9, 'dm'],
      ]);
      expect(events.map(e => e.type)).to.eql([
        'player_hp_updated',
        'npc_hp_updated',
        'party_rested',
      ]);
      expect(events[0]).to.containDeep({
        current_hit_points: 20,
        temporary_hit_points: 3,
      });
      expect(events[2]).to.containDeep({
        rest_type: 'long',
        character_names: ['Ana', 'Guarda'],
      });
    });

    it('curto: só recarrega recursos (inclusive de quem está com 0 PV), sem mexer no PV', async () => {
      const result = await service.partyRest(
        'gs',
        {rest_type: 'short', id_player_sessions: ['p1', 'p2']},
        'dm',
      );
      expect(result.rested).to.eql(['Ana', 'Bia']);
      sinon.assert.notCalled(characterSheet.stubs.longRest);
      expect(characterSheet.stubs.shortRest.args).to.eql([
        [1, 'dm'],
        [2, 'dm'],
      ]);
      expect(events.map(e => e.type)).to.eql(['party_rested']);
    });

    it('ninguém descansou: não avisa a mesa', async () => {
      await service.partyRest(
        'gs',
        {rest_type: 'long', id_player_sessions: ['p2']},
        'dm',
      );
      expect(events).to.be.empty();
    });
  });

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

    it('rolagem de um lançamento: cast_id vai só no evento (não é gravado) e é validado', async () => {
      await service.addRoll('gs', {...ROLL, cast_id: 'cast-1234'}, 'u');
      expect(repository.stubs.addRoll.firstCall.args[1]).to.not.have.property(
        'cast_id',
      );
      expect(events[0]).to.containDeep({
        type: 'roll_added',
        roll: {cast_id: 'cast-1234'},
      });
      await expect(
        service.addRoll('gs', {...ROLL, cast_id: 'x'}, 'u'),
      ).to.be.rejectedWith(/cast_id/);
    });

    it('aceita rolagem de cura (magias de cura)', async () => {
      await service.addRoll('gs', {...ROLL, roll_type: 'heal'}, 'u');
      expect(repository.stubs.addRoll.firstCall.args[1].roll_type).to.equal(
        'heal',
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('teste secreto', () => {
    const players = [
      {
        id_player_session: 'p1',
        id_game_session: 'gs',
        id_character: 10,
        player_name: 'Ana',
        user_id: 'u1',
        character: {name: 'Lyra'},
      },
      {
        id_player_session: 'p2',
        id_game_session: 'gs',
        id_character: 20,
        player_name: 'Bia',
        user_id: 'u2',
        character: {name: 'Thorin'},
      },
      {
        id_player_session: 'p3',
        id_game_session: 'gs',
        id_character: 30,
        player_name: 'Sem ficha',
        user_id: 'u3',
        character: null,
      },
    ] as unknown as GameSessionDetail['players'];
    const perception = {
      id_player_sessions: ['p1'],
      check: {kind: 'skill' as const, id_skill: 13},
      label: 'Percepção',
    };

    beforeEach(() => {
      service.secretRequests = new SecretRollRequestStore();
      repository.stubs.isSessionOwner.callsFake(
        async (_gs, user) => user === 'dm',
      );
      repository.stubs.findById.resolves({...sessionDetail(), players});
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.addRoll.callsFake(
        async (_gs, input) => ({...input}) as unknown as RollLogEntry,
      );
    });

    it('só o mestre pede', async () => {
      await expect(
        service.requestSecretRoll('gs', perception, 'u1'),
      ).to.be.rejectedWith(/Só o mestre/);
    });

    it('valida jogadores, teste e rótulo', async () => {
      const bad = [
        {...perception, id_player_sessions: []},
        {...perception, label: ' '},
        {...perception, label: 'x'.repeat(61)},
        {...perception, check: {kind: 'skill' as const, id_skill: 99}},
        {
          ...perception,
          check: {kind: 'save' as const, ability: 'XYZ' as 'STR'},
        },
        {...perception, id_player_sessions: ['p3']},
        {...perception, id_player_sessions: ['nao-existe']},
      ];
      for (const input of bad) {
        await expect(
          service.requestSecretRoll('gs', input, 'dm'),
        ).to.be.rejected();
      }
      expect(events).to.eql([]);
    });

    it('cada jogador escolhido recebe o pedido só na própria sala', async () => {
      const result = await service.requestSecretRoll(
        'gs',
        {
          id_player_sessions: ['p1', 'p2', 'p1'],
          check: {kind: 'save', ability: 'WIS'},
          label: 'Resistência: Sabedoria',
        },
        'dm',
      );
      expect(result.map(r => r.id_player_session)).to.eql(['p1', 'p2']);
      expect(events.map(e => e.type)).to.eql([
        'secret_roll_requested',
        'secret_roll_requested',
      ]);
      expect(events[0]).to.containDeep({
        target_user_id: 'u1',
        id_player_session: 'p1',
        id_character: 10,
        label: 'Resistência: Sabedoria',
        check: {kind: 'save', ability: 'WIS'},
        request_id: result[0].request_id,
      });
      // roteamento: sala do usuário alvo, nunca a de todos
      expect(eventTargetUserId(events[0])).to.equal('u1');
      expect(eventTargetUserId(events[1])).to.equal('u2');
    });

    it('resposta do jogador fica oculta (só o mestre recebe) e o pedido vale uma vez', async () => {
      const [{request_id}] = await service.requestSecretRoll(
        'gs',
        perception,
        'dm',
      );
      events.length = 0;
      const answer = {
        ...ROLL,
        id_character: 10,
        roll_type: 'skill' as const,
        label: 'Teste secreto: Percepção',
        secret_request_id: request_id,
      };
      const roll = await service.addRoll('gs', answer, 'u1');
      expect(roll.is_hidden).to.be.true();
      expect(repository.stubs.addRoll.firstCall.args[1]).to.not.have.property(
        'secret_request_id',
      );
      expect(isDmOnlyEvent(events[0])).to.be.true();

      await expect(service.addRoll('gs', answer, 'u1')).to.be.rejectedWith(
        /inválido ou expirado/,
      );
    });

    it('pedido de outro jogador/personagem não serve', async () => {
      const [{request_id}] = await service.requestSecretRoll(
        'gs',
        perception,
        'dm',
      );
      await expect(
        service.addRoll(
          'gs',
          {...ROLL, id_character: 10, secret_request_id: request_id},
          'u2',
        ),
      ).to.be.rejectedWith(/inválido ou expirado/);
      await expect(
        service.addRoll(
          'gs',
          {...ROLL, id_character: 20, secret_request_id: request_id},
          'u1',
        ),
      ).to.be.rejectedWith(/inválido ou expirado/);
      // ainda vale pro dono certo
      const roll = await service.addRoll(
        'gs',
        {...ROLL, id_character: 10, secret_request_id: request_id},
        'u1',
      );
      expect(roll.is_hidden).to.be.true();
    });

    it('jogador sem pedido continua sem poder ocultar rolagem', async () => {
      const roll = await service.addRoll(
        'gs',
        {...ROLL, is_hidden: true},
        'u1',
      );
      expect(roll.is_hidden).to.be.false();
    });
  });

  // -------------------------------------------------------------------------
  describe('Inspiração Bárdica', () => {
    const players = [
      {
        id_player_session: 'p1',
        id_game_session: 'gs',
        id_character: 10,
        player_name: 'Ana',
        user_id: 'u1',
        character: {name: 'Lyra'},
      },
      {
        id_player_session: 'p2',
        id_game_session: 'gs',
        id_character: 20,
        player_name: 'Bia',
        user_id: 'u2',
        character: {name: 'Thorin'},
      },
    ] as unknown as GameSessionDetail['players'];

    beforeEach(() => {
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.findById.resolves({...sessionDetail(), players});
      repository.stubs.findCharacterBasics.resolves({
        name: 'Lyra',
        id_class: 2,
        level: 5,
      });
    });

    it('guarda o dado (pelo nível do bardo) no personagem do aliado', async () => {
      const result = await service.grantBardicInspiration(
        'gs',
        {id_character: 10, id_player_session: 'p2'},
        'u1',
      );
      expect(result).to.eql({sides: 8, to: 'Thorin'});
      expect(
        repository.stubs.setBardicInspiration.calledOnceWith(20, {
          sides: 8,
          from: 'Lyra',
        }),
      ).to.be.true();
    });

    it('só quem age pelo bardo, só bardo, aliado da sessão e não ele mesmo', async () => {
      repository.stubs.canPostRollFor.resolves(false);
      await expect(
        service.grantBardicInspiration(
          'gs',
          {id_character: 10, id_player_session: 'p2'},
          'u2',
        ),
      ).to.be.rejectedWith(/não pode agir/);
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.findCharacterBasics.resolves({
        name: 'Thorin',
        id_class: 7,
        level: 5,
      });
      await expect(
        service.grantBardicInspiration(
          'gs',
          {id_character: 10, id_player_session: 'p2'},
          'u1',
        ),
      ).to.be.rejectedWith(/Só bardo/);
      repository.stubs.findCharacterBasics.resolves({
        name: 'Lyra',
        id_class: 2,
        level: 5,
      });
      await expect(
        service.grantBardicInspiration(
          'gs',
          {id_character: 10, id_player_session: 'x'},
          'u1',
        ),
      ).to.be.rejectedWith(/fora da sessão/);
      await expect(
        service.grantBardicInspiration(
          'gs',
          {id_character: 10, id_player_session: 'p1'},
          'u1',
        ),
      ).to.be.rejectedWith(/outra criatura/);
      expect(repository.stubs.setBardicInspiration.called).to.be.false();
    });
  });

  // -------------------------------------------------------------------------
  describe('publishSpellCastStage', () => {
    const SPELL = {
      id_spell: 9,
      name: 'Raio de Fogo',
      casting_time: '1 ação',
      range_distance: 36,
      duration: 'Instantânea',
      is_verbal: true,
      is_somatic: true,
      is_material: false,
      spellLevel: 0,
      school: 'Evocação',
    };
    const STAGE = {
      cast_id: 'cast-1234',
      id_character: 1,
      actor_name: 'Merlin',
      id_spell: 9,
      phase: 'open' as const,
      rolls: [
        {
          id_roll: 'r1',
          kind: 'attack' as const,
          outcome: 'hit' as const,
          critical: false,
        },
      ],
    };

    beforeEach(() => {
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      repository.stubs.findSpellCard.resolves(SPELL);
    });

    it('publica a etapa com a carta da magia e quem lançou (não grava nada)', async () => {
      await service.publishSpellCastStage('gs', STAGE, 'u1');
      expect(events).to.eql([
        {
          type: 'spell_cast_stage',
          id_game_session: 'gs',
          cast_id: 'cast-1234',
          user_id: 'u1',
          id_character: 1,
          actor_name: 'Merlin',
          spell: SPELL,
          phase: 'open',
          rolls: STAGE.rolls,
          save_dc: null,
          save_ability: null,
        },
      ]);
      expect(repository.stubs.addRoll.called).to.be.false();
    });

    it('valida id, fase, rolagens e CD; exige permissão e magia existente', async () => {
      await expect(
        service.publishSpellCastStage('gs', {...STAGE, cast_id: '!'}, 'u'),
      ).to.be.rejectedWith(/cast_id/);
      await expect(
        service.publishSpellCastStage(
          'gs',
          {...STAGE, phase: 'x' as never},
          'u',
        ),
      ).to.be.rejectedWith(/phase/);
      await expect(
        service.publishSpellCastStage(
          'gs',
          {...STAGE, rolls: [{...STAGE.rolls[0], kind: 'x' as never}]},
          'u',
        ),
      ).to.be.rejectedWith(/rolls/);
      await expect(
        service.publishSpellCastStage('gs', {...STAGE, save_dc: 14}, 'u'),
      ).to.be.rejectedWith(/juntos/);

      repository.stubs.findSpellCard.resolves(null);
      await expect(
        service.publishSpellCastStage('gs', STAGE, 'u'),
      ).to.be.rejectedWith(/Magia não encontrada/);

      repository.stubs.canPostRollFor.resolves(false);
      await expect(
        service.publishSpellCastStage('gs', STAGE, 'u'),
      ).to.be.rejectedWith(/não pode lançar/);
      expect(events).to.eql([]);
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
          save_dc: null,
          save_ability: null,
          is_ability: false,
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

    it('habilidade de classe vai marcada (toast "USOU")', async () => {
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      await service.announceSpellCast(
        'gs',
        {
          id_character: 1,
          actor_name: 'Thorin',
          spell_name: 'Retomar o Fôlego',
          is_ability: true,
        },
        'u',
      );
      expect(events[0]).to.containDeep({is_ability: true});
    });

    it('magia de resistência leva a CD e o atributo pro toast; valida os dois juntos', async () => {
      repository.stubs.hasSessionAccess.resolves(true);
      repository.stubs.canPostRollFor.resolves(true);
      const base = {
        id_character: 1,
        actor_name: 'Merlin',
        spell_name: 'Bola de Fogo',
      };
      await service.announceSpellCast(
        'gs',
        {...base, save_dc: 15, save_ability: 'DEX'},
        'u',
      );
      expect(events[0]).to.containDeep({save_dc: 15, save_ability: 'DEX'});

      await expect(
        service.announceSpellCast('gs', {...base, save_dc: 15}, 'u'),
      ).to.be.rejectedWith(/vão juntos/);
      await expect(
        service.announceSpellCast(
          'gs',
          {...base, save_dc: 0, save_ability: 'DEX'},
          'u',
        ),
      ).to.be.rejectedWith(/save_dc inválido/);
      await expect(
        service.announceSpellCast(
          'gs',
          {...base, save_dc: 15, save_ability: 'XYZ' as 'DEX'},
          'u',
        ),
      ).to.be.rejectedWith(/save_ability inválido/);
    });
  });
});
