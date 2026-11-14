import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {SessionEventsService} from '../../../services/session-events.service';
import {CharacterSheetService} from '../../../services/character-sheet.service';
import {
  AttackCheckService,
  attackHits,
} from '../../../services/attack-check.service';
import {GameSessionDetail} from '../../../models/game-session-types';
import {SessionEvent} from '../../../models/session-event-types';

describe('acerto automático contra a CA (1.25.0)', () => {
  it('total ≥ CA acerta; 20 natural sempre acerta; 1 natural sempre erra', () => {
    expect(attackHits(15, 10, 15)).to.be.true();
    expect(attackHits(14, 10, 15)).to.be.false();
    expect(attackHits(3, 20, 30)).to.be.true();
    expect(attackHits(40, 1, 10)).to.be.false();
  });

  describe('AttackCheckService', () => {
    let sessions: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
    let sheets: {loadCharacter: sinon.SinonStub};
    let events: SessionEvent[];
    let service: AttackCheckService;

    const detail = (autoHit = true): GameSessionDetail =>
      ({
        game_session: {user_id: 'dm', auto_hit_check: autoHit},
        players: [{id_player_session: 'p1', id_character: 10, user_id: 'u1'}],
        npcs: [{id_npc_session: 'n1', id_character: 30}],
        companions: [{id_session_companion: 'c1', armor_class: 14}],
        monsters: [
          {id_monster_session: 'm1', ac: 13, is_revealed: true},
          {id_monster_session: 'm2', ac: 18, is_revealed: false},
        ],
      }) as unknown as GameSessionDetail;

    beforeEach(() => {
      sessions = createStubInstance(GameSessionRepository);
      sessions.stubs.hasSessionAccess.resolves(true);
      sessions.stubs.isSessionOwner.callsFake(
        async (_gs, user) => user === 'dm',
      );
      sessions.stubs.findById.resolves(detail());
      sheets = {
        loadCharacter: sinon
          .stub()
          .resolves({character_sheet: {combat_stats: {armor_class: 16}}}),
      };
      const bus = new SessionEventsService();
      events = [];
      bus.subscribe(e => events.push(e));
      service = new AttackCheckService(
        sessions,
        sheets as unknown as CharacterSheetService,
        bus,
      );
    });

    const hit = (
      target_kind: string,
      target_id: string,
      total: number,
      user = 'u1',
      natural = 10,
    ) => service.check('gs', {target_kind, target_id, total, natural}, user);

    it('monstro: compara com a CA dele, sem revelar o número', async () => {
      expect(await hit('monster', 'm1', 13)).to.eql({hit: true});
      expect(await hit('monster', 'm1', 12)).to.eql({hit: false});
    });

    it('jogador e NPC: CA da ficha calculada, lida como o dono (jogador / mestre)', async () => {
      expect(await hit('player', 'p1', 16, 'dm')).to.eql({hit: true});
      sinon.assert.calledWith(sheets.loadCharacter, 10, 'u1');
      expect(await hit('npc', 'n1', 15)).to.eql({hit: false});
      sinon.assert.calledWith(sheets.loadCharacter, 30, 'dm');
      expect(await hit('companion', 'c1', 14)).to.eql({hit: true});
    });

    it('jogador não mira monstro escondido; o mestre mira', async () => {
      await expect(hit('monster', 'm2', 30)).to.be.rejectedWith(
        /não encontrado/,
      );
      expect(await hit('monster', 'm2', 18, 'dm')).to.eql({hit: true});
    });

    it('opção desligada, sem acesso ou dados inválidos: recusa', async () => {
      sessions.stubs.findById.resolves(detail(false));
      await expect(hit('monster', 'm1', 20)).to.be.rejectedWith(
        /não usa acerto automático/,
      );
      sessions.stubs.findById.resolves(detail());
      await expect(hit('dragao', 'm1', 20)).to.be.rejectedWith(/Alvo inválido/);
      await expect(hit('monster', 'm1', 20, 'u1', 21)).to.be.rejectedWith(
        /Rolagem inválida/,
      );
      sessions.stubs.hasSessionAccess.resolves(false);
      await expect(hit('monster', 'm1', 20)).to.be.rejectedWith(/acesso/);
    });

    it('só o mestre liga a opção; a mesa recebe a mudança', async () => {
      await expect(
        service.setAutoHitCheck('gs', true, 'u1'),
      ).to.be.rejectedWith(/Só o mestre/);
      await expect(
        service.setAutoHitCheck('gs', 'sim', 'dm'),
      ).to.be.rejectedWith(/true ou false/);
      expect(await service.setAutoHitCheck('gs', true, 'dm')).to.eql({
        auto_hit_check: true,
      });
      sinon.assert.calledWith(sessions.stubs.setAutoHitCheck, 'gs', true);
      expect(events).to.eql([
        {
          type: 'session_settings_updated',
          id_game_session: 'gs',
          auto_hit_check: true,
        },
      ]);
    });
  });
});
