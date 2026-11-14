import {expect} from '@loopback/testlab';
import {
  damageAfterDefenses,
  isImmuneTo,
  monsterDefenses,
} from '../../../services/monster-defenses';

describe('defesas de monstro ao dano (1.24.4)', () => {
  const skeleton = monsterDefenses({
    damage_immunities: ['veneno'],
    damage_resistances: [
      'concussão, cortante e perfurante de ataques não-mágicos',
    ],
    damage_vulnerabilities: ['concussão'],
  });

  it('só os tipos simples entram (o composto fica com o mestre)', () => {
    expect(skeleton).to.eql({
      immunities: ['veneno'],
      resistances: [],
      vulnerabilities: ['concussao'],
    });
    expect(monsterDefenses(null)).to.eql({
      immunities: [],
      resistances: [],
      vulnerabilities: [],
    });
  });

  it('imune a qualquer tipo citado, com acento ou maiúscula', () => {
    expect(isImmuneTo(skeleton, 'Veneno')).to.be.true();
    expect(isImmuneTo(skeleton, 'venenoso')).to.be.true();
    expect(isImmuneTo(skeleton, 'fogo + veneno')).to.be.true();
    expect(isImmuneTo(skeleton, 'fogo')).to.be.false();
    expect(isImmuneTo(skeleton, null)).to.be.false();
  });

  it('resistência e vulnerabilidade juntas se anulam', () => {
    const both = monsterDefenses({
      damage_resistances: ['fogo'],
      damage_vulnerabilities: ['fogo'],
    });
    expect(damageAfterDefenses(both, 'fogo', 9)).to.eql({
      amount: 9,
      outcome: null,
    });
    expect(damageAfterDefenses(skeleton, 'Concussão', 4)).to.eql({
      amount: 8,
      outcome: 'vulnerable',
    });
  });
});
