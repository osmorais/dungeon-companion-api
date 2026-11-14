/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  canHaveCompanion,
  companionAttacksPerCommand,
  companionBeastAllowed,
  companionMaxHp,
  companionView,
  COMPANION_COLORS,
  pickCompanionColor,
} from '../../../services/character-sheet/companion';

describe('Companheiro Animal — regras', () => {
  it('só ranger do Conclave da Besta a partir do nível 3', () => {
    expect(canHaveCompanion(12, 'mestre-das-feras', 3)).to.be.true();
    expect(canHaveCompanion(12, 'mestre-das-feras', 2)).to.be.false();
    expect(canHaveCompanion(12, 'cacador', 5)).to.be.false();
    expect(canHaveCompanion(5, 'mestre-das-feras', 5)).to.be.false();
  });

  it('besta de ND 1/4 ou menor, até Médio', () => {
    const beast = (cr: number, size: string, type = 'besta') => ({
      challenge_rating: cr,
      data: {type, size},
    });
    expect(companionBeastAllowed(beast(0.25, 'Médio'))).to.be.true();
    expect(companionBeastAllowed(beast(0, 'Minúsculo'))).to.be.true();
    expect(companionBeastAllowed(beast(0.5, 'Médio'))).to.be.false();
    expect(companionBeastAllowed(beast(0.25, 'Grande'))).to.be.false();
    expect(
      companionBeastAllowed(beast(0.25, 'Médio', 'monstruosidade')),
    ).to.be.false();
  });

  it('PV máximo: o maior entre o da besta e 4 × o nível do ranger; 2 ataques no nível 11', () => {
    expect(companionMaxHp(11, 2)).to.equal(11);
    expect(companionMaxHp(11, 5)).to.equal(20);
    expect(companionAttacksPerCommand(10)).to.equal(1);
    expect(companionAttacksPerCommand(11)).to.equal(2);
  });

  it('cor: sorteada entre as livres; com todas em uso, repete', () => {
    const used = COMPANION_COLORS.slice(1);
    expect(pickCompanionColor([...used], () => 0.99)).to.equal(
      COMPANION_COLORS[0],
    );
    expect(COMPANION_COLORS).to.containEql(
      pickCompanionColor([...COMPANION_COLORS], () => 0.5),
    );
  });

  it('como a mesa vê: CA e PV com o ranger somado, deslocamento por extenso', () => {
    const view = companionView({
      id_session_companion: 'c1',
      id_game_session: 'gs',
      id_player_session: 'ps',
      monster_slug: 'lobo',
      name: 'Lobo',
      color: '#5fb3d9',
      hp_current: 9,
      data_snapshot: {
        hit_points: 11,
        armor_class: [{value: 13}],
        speed: {terrestre: '12 m'},
        actions: [{name: 'Mordida'}],
      },
      ranger_level: 5,
      proficiency_bonus: 3,
    });
    expect(view).to.containDeep({
      hp_current: 9,
      hp_max: 20,
      armor_class: 16,
      proficiency_bonus: 3,
      attacks_per_command: 1,
      speed: 'terrestre 12 m',
      actions: [{name: 'Mordida'}],
    });
  });
});
