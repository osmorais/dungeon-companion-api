/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {CompanionService} from '../../../services/companion.service';
import {CompanionRepository} from '../../../repositories/companion.repository';
import {MonsterRepository} from '../../../repositories/monster.repository';
import {SessionEventsService} from '../../../services/session-events.service';
import {SessionEvent} from '../../../models/session-event-types';
import {SessionCompanion} from '../../../services/character-sheet/companion';

const PS = '11111111-1111-1111-1111-111111111111';
const CID = '22222222-2222-2222-2222-222222222222';

const WOLF = {
  slug: 'lobo',
  name: 'Lobo',
  hp_max: 11,
  ac: 13,
  challenge_rating: 0.25,
  data: {
    type: 'besta',
    size: 'Médio',
    speed: {terrestre: '12 m'},
    hit_points: 11,
  },
};
const BEAR = {
  ...WOLF,
  slug: 'urso-pardo',
  name: 'Urso Pardo',
  challenge_rating: 1,
  data: {...WOLF.data, size: 'Grande'},
};

const view = (overrides: Partial<SessionCompanion> = {}): SessionCompanion => ({
  id_session_companion: CID,
  id_game_session: 'gs',
  id_player_session: PS,
  slug: 'lobo',
  name: 'Lobo',
  color: '#5fb3d9',
  hp_current: 20,
  hp_max: 20,
  armor_class: 16,
  proficiency_bonus: 3,
  attacks_per_command: 1,
  speed: 'terrestre 12 m',
  actions: [],
  ...overrides,
});

describe('CompanionService', () => {
  let companions: StubbedInstanceWithSinonAccessor<CompanionRepository>;
  let monsters: StubbedInstanceWithSinonAccessor<MonsterRepository>;
  let events: SessionEvent[];
  let service: CompanionService;

  const ranger = (overrides = {}) => ({
    player_user_id: 'u',
    session_owner_id: 'dm',
    id_class: 12,
    id_subclass: 'mestre-das-feras',
    level: 5,
    ...overrides,
  });

  beforeEach(() => {
    companions = createStubInstance(CompanionRepository);
    monsters = createStubInstance(MonsterRepository);
    const bus = new SessionEventsService();
    events = [];
    bus.subscribe(e => events.push(e));
    service = new CompanionService(companions, monsters, bus);
    companions.stubs.findRanger.resolves(ranger());
    companions.stubs.usedColors.resolves([]);
    companions.stubs.upsert.resolves(CID);
    companions.stubs.findById.resolves(view());
    companions.stubs.findOwners.resolves({
      player_user_id: 'u',
      session_owner_id: 'dm',
    });
    monsters.stubs.listBeasts.resolves([WOLF, BEAR]);
    monsters.stubs.findBeast.resolves(WOLF);
  });

  afterEach(() => sinon.restore());

  it('opções: só bestas permitidas; quem não pode ter companheiro recebe vazio', async () => {
    const {allowed, beasts} = await service.options('gs', PS, 'u');
    expect(allowed).to.be.true();
    expect(beasts.map(b => b.slug)).to.eql(['lobo']);
    companions.stubs.findRanger.resolves(ranger({id_subclass: 'cacador'}));
    expect(await service.options('gs', PS, 'u')).to.eql({
      allowed: false,
      beasts: [],
    });
  });

  it('só o jogador do ranger e o mestre', async () => {
    await expect(service.options('gs', PS, 'outro')).to.be.rejectedWith({
      statusCode: 403,
    });
    expect(await service.options('gs', PS, 'dm')).to.containDeep({
      allowed: true,
    });
    await expect(service.options('gs', 'x', 'u')).to.be.rejectedWith({
      statusCode: 422,
    });
  });

  it('escolher: PV cheio pelo nível do ranger, cor livre, avisa a mesa', async () => {
    companions.stubs.usedColors.resolves(['#e0b84a']);
    const companion = await service.choose(
      'gs',
      {id_player_session: PS, slug: 'lobo'},
      'u',
    );
    const saved = companions.stubs.upsert.firstCall.args[0];
    expect(saved).to.containDeep({slug: 'lobo', name: 'Lobo', hpCurrent: 20});
    expect(saved.color).to.not.equal('#e0b84a');
    expect(companion.id_session_companion).to.equal(CID);
    expect(events[0]).to.containDeep({
      type: 'companion_set',
      id_player_session: PS,
      companion: {name: 'Lobo'},
    });
  });

  it('escolher: recusa besta fora da regra e quem não tem o traço', async () => {
    monsters.stubs.findBeast.resolves(BEAR);
    await expect(
      service.choose('gs', {id_player_session: PS, slug: 'urso-pardo'}, 'u'),
    ).to.be.rejectedWith(/ND 1\/4/);
    companions.stubs.findRanger.resolves(ranger({level: 2}));
    await expect(
      service.choose('gs', {id_player_session: PS, slug: 'lobo'}, 'u'),
    ).to.be.rejectedWith(/nível 3/);
    expect(events).to.eql([]);
  });

  it('dispensar avisa a mesa com companheiro null', async () => {
    await service.dismiss(CID, 'u');
    sinon.assert.calledWith(companions.stubs.delete, CID);
    expect(events[0]).to.containDeep({
      type: 'companion_set',
      id_player_session: PS,
      companion: null,
    });
  });

  it('PV: até o máximo, inteiro, só de quem pode', async () => {
    expect(await service.setHp(CID, 99, 'dm')).to.eql({hp_current: 20});
    sinon.assert.calledWith(companions.stubs.writeHp, CID, 20);
    await expect(service.setHp(CID, -1, 'u')).to.be.rejectedWith({
      statusCode: 422,
    });
    await expect(service.setHp(CID, 5, 'outro')).to.be.rejectedWith({
      statusCode: 403,
    });
    companions.stubs.findOwners.resolves(null);
    await expect(service.setHp(CID, 5, 'u')).to.be.rejectedWith({
      statusCode: 404,
    });
  });
});
