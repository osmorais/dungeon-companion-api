/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {WildShapeService} from '../../../services/wild-shape.service';
import {MonsterRepository} from '../../../repositories/monster.repository';
import {CharacterSheetService} from '../../../services/character-sheet.service';
import {GameSessionRepository} from '../../../repositories/game-session.repository';
import {SessionEventsService} from '../../../services/session-events.service';
import {SessionEvent} from '../../../models/session-event-types';
import {buildWildShape} from '../../../services/character-sheet/wild-shape';
import {WOLF} from '../character-sheet/wild-shape.unit';

describe('WildShapeService', () => {
  let monsters: StubbedInstanceWithSinonAccessor<MonsterRepository>;
  let sheets: StubbedInstanceWithSinonAccessor<CharacterSheetService>;
  let sessions: StubbedInstanceWithSinonAccessor<GameSessionRepository>;
  let events: SessionEvent[];
  let service: WildShapeService;

  const shark = {
    ...WOLF,
    slug: 'tubarao-cacador',
    name: 'Tubarão Caçador',
    challenge_rating: 0.5,
    data: {...WOLF.data, speed: {natação: '12 m'}},
  };
  const eagle = {
    ...WOLF,
    slug: 'aguia',
    name: 'Águia',
    challenge_rating: 0,
    data: {...WOLF.data, speed: {terrestre: '3 m', voo: '18 m'}},
  };

  beforeEach(() => {
    monsters = createStubInstance(MonsterRepository);
    sheets = createStubInstance(CharacterSheetService);
    monsters.stubs.listBeasts.resolves([WOLF, shark, eagle]);
    sessions = createStubInstance(GameSessionRepository);
    sessions.stubs.findPlayerSessionsOfCharacter.resolves([
      {
        id_player_session: 'ps',
        id_game_session: 'gs',
        current_hit_points: 25,
        max_hit_points: 30,
        temporary_hit_points: 2,
      },
    ]);
    const bus = new SessionEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new WildShapeService(monsters, sheets, sessions, bus);
  });

  afterEach(() => sinon.restore());

  it('lista só as bestas do nível (nv4: ND 1/2 com nado, sem voo)', async () => {
    sheets.stubs.wildShapeContext.resolves({
      idClass: 5,
      idSubclass: null,
      level: 4,
    });
    const {limits, beasts} = await service.options(1, 'u');
    expect(limits?.max_cr).to.equal(0.5);
    expect(beasts.map(b => b.slug)).to.eql(['lobo', 'tubarao-cacador']);
    expect(beasts[0]).to.eql({
      slug: 'lobo',
      name: 'Lobo',
      challenge_rating: 0.25,
      hp_max: 11,
      ac: 13,
      speed: {terrestre: '12 m'},
    });
  });

  it('quem não é druida recebe a lista vazia', async () => {
    sheets.stubs.wildShapeContext.resolves({
      idClass: 7,
      idSubclass: null,
      level: 10,
    });
    expect(await service.options(1, 'u')).to.eql({limits: null, beasts: []});
  });

  it('transformar: valida o slug, acha a besta e repassa', async () => {
    await expect(service.start(1, 'Lobo!', 'u')).to.be.rejectedWith({
      statusCode: 422,
    });
    monsters.stubs.findBeast.resolves(null);
    await expect(service.start(1, 'nao-existe', 'u')).to.be.rejectedWith({
      statusCode: 404,
    });
    monsters.stubs.findBeast.resolves(WOLF);
    sheets.stubs.setWildShape.resolves({
      active_effects: {
        active: [],
        turn_uses: {},
        wild_shape: buildWildShape(WOLF),
      },
    });
    await service.start(1, 'lobo', 'u');
    sinon.assert.calledWith(sheets.stubs.setWildShape, 1, 'u', WOLF);
    // a mesa passa a mostrar o PV da forma
    expect(events).to.eql([
      {
        type: 'player_hp_updated',
        id_game_session: 'gs',
        id_player_session: 'ps',
        current_hit_points: 11,
        temporary_hit_points: 2,
        max_hit_points: 11,
        wild_shape_name: 'Lobo',
      },
    ]);
  });

  it('sair da forma repassa null e a mesa volta ao PV do druida', async () => {
    sheets.stubs.setWildShape.resolves({
      active_effects: {active: [], turn_uses: {}, wild_shape: null},
    });
    await service.end(1, 'u');
    sinon.assert.calledWith(sheets.stubs.setWildShape, 1, 'u', null);
    expect(events[0]).to.containDeep({
      current_hit_points: 25,
      max_hit_points: 30,
      wild_shape_name: null,
    });
  });
});
