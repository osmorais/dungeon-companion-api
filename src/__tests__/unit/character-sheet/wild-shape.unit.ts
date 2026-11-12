/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  applyHpToWildShape,
  beastAllowed,
  buildWildShape,
  wildShapeLimits,
} from '../../../services/character-sheet/wild-shape';

export const WOLF = {
  slug: 'lobo',
  name: 'Lobo',
  hp_max: 11,
  ac: 13,
  challenge_rating: 0.25,
  data: {
    type: 'besta',
    speed: {terrestre: '12 m'},
    strength: 12,
    dexterity: 15,
    constitution: 12,
    actions: [{name: 'Mordida'}],
  },
};

const beast = (cr: number, speed: Record<string, string>, type = 'besta') => ({
  challenge_rating: cr,
  data: {type, speed},
});

describe('Forma Selvagem — regras', () => {
  it('limites pelo nível: nv2 ND 1/4 sem nado nem voo, nv4 ND 1/2 com nado, nv8 ND 1 com voo', () => {
    expect(wildShapeLimits(5, null, 1)).to.be.null();
    expect(wildShapeLimits(5, null, 2)).to.eql({
      max_cr: 0.25,
      swim: false,
      fly: false,
      hours: 1,
    });
    expect(wildShapeLimits(5, null, 4)).to.eql({
      max_cr: 0.5,
      swim: true,
      fly: false,
      hours: 2,
    });
    expect(wildShapeLimits(5, null, 8)).to.eql({
      max_cr: 1,
      swim: true,
      fly: true,
      hours: 4,
    });
    expect(wildShapeLimits(5, null, 20)?.max_cr).to.equal(1);
  });

  it('Círculo da Lua: ND 1 desde o nv2 e nível ÷ 3 a partir do nv6 (nado e voo pela tabela)', () => {
    expect(wildShapeLimits(5, 'lua', 2)).to.eql({
      max_cr: 1,
      swim: false,
      fly: false,
      hours: 1,
    });
    expect(wildShapeLimits(5, 'lua', 6)?.max_cr).to.equal(2);
    expect(wildShapeLimits(5, 'lua', 9)?.max_cr).to.equal(3);
    expect(wildShapeLimits(5, 'lua', 20)?.max_cr).to.equal(6);
  });

  it('só druida tem Forma Selvagem', () => {
    expect(wildShapeLimits(7, null, 10)).to.be.null();
  });

  it('besta permitida: tipo, ND, nado e voo', () => {
    const nv2 = wildShapeLimits(5, null, 2)!;
    const nv4 = wildShapeLimits(5, null, 4)!;
    const nv8 = wildShapeLimits(5, null, 8)!;
    expect(beastAllowed(beast(0.25, {terrestre: '12 m'}), nv2)).to.be.true();
    expect(beastAllowed(beast(0.5, {terrestre: '12 m'}), nv2)).to.be.false();
    expect(
      beastAllowed(beast(0, {terrestre: '6 m'}, 'monstruosidade'), nv8),
    ).to.be.false();
    expect(
      beastAllowed(beast(0, {terrestre: '3 m', natação: '9 m'}), nv2),
    ).to.be.false();
    expect(
      beastAllowed(beast(0, {terrestre: '3 m', natação: '9 m'}), nv4),
    ).to.be.true();
    expect(
      beastAllowed(beast(0, {terrestre: '3 m', voo: '18 m'}), nv4),
    ).to.be.false();
    expect(
      beastAllowed(beast(0, {terrestre: '3 m', voo: '18 m'}), nv8),
    ).to.be.true();
  });

  it('a forma copia PV cheio, CA, atributos físicos, deslocamento e ações da besta', () => {
    expect(buildWildShape(WOLF)).to.eql({
      slug: 'lobo',
      name: 'Lobo',
      challenge_rating: 0.25,
      hp_current: 11,
      hp_max: 11,
      armor_class: 13,
      strength: 12,
      dexterity: 15,
      constitution: 12,
      speed: 'terrestre 12 m',
      actions: [{name: 'Mordida'}],
    });
  });

  it('PV da forma: acima de 0 só a forma muda (no máximo o PV dela)', () => {
    const wolf = buildWildShape(WOLF);
    expect(applyHpToWildShape(wolf, 4, 0, 20)).to.eql({
      form: {...wolf, hp_current: 4},
      druidHp: 20,
    });
    expect(applyHpToWildShape(wolf, 99, 0, 20).form?.hp_current).to.equal(11);
  });

  it('forma em 0: volta ao normal e o dano que sobrou passa pro druida (sem ficar negativo)', () => {
    const wolf = buildWildShape(WOLF);
    expect(applyHpToWildShape(wolf, 0, 7, 20)).to.eql({
      form: null,
      druidHp: 13,
    });
    expect(applyHpToWildShape(wolf, 0, 0, 20)).to.eql({
      form: null,
      druidHp: 20,
    });
    expect(applyHpToWildShape(wolf, 0, 50, 20)).to.eql({
      form: null,
      druidHp: 0,
    });
  });
});
