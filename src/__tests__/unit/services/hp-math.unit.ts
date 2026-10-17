import {expect} from '@loopback/testlab';
import {applyHpAmount} from '../../../services/hp-math';

describe('applyHpAmount', () => {
  const state = {current: 10, max: 20, temp: 4};

  it('dano consome primeiro os PV temporários e não passa de 0', () => {
    expect(applyHpAmount(state, 3, 'damage')).to.eql({current: 10, temp: 1});
    expect(applyHpAmount(state, 7, 'damage')).to.eql({current: 7, temp: 0});
    expect(applyHpAmount(state, 50, 'damage')).to.eql({current: 0, temp: 0});
  });

  it('cura vai até o máximo, sem mexer nos temporários; de 0 (ou negativo) parte de 0', () => {
    expect(applyHpAmount(state, 5, 'heal')).to.eql({current: 15, temp: 4});
    expect(applyHpAmount(state, 50, 'heal')).to.eql({current: 20, temp: 4});
    expect(applyHpAmount({...state, current: -3}, 2, 'heal')).to.eql({
      current: 2,
      temp: 4,
    });
  });

  it('PV temporários não acumulam: fica o maior', () => {
    expect(applyHpAmount(state, 2, 'temp_hp')).to.eql({current: 10, temp: 4});
    expect(applyHpAmount(state, 9, 'temp_hp')).to.eql({current: 10, temp: 9});
  });
});
