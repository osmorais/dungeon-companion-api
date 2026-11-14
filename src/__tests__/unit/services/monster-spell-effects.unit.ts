/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  MONSTER_SPELL_EFFECT_KEYS,
  SPELL_MONSTER_EFFECT,
  isMonsterSpellEffectKey,
  normalizeMonsterSpellEffects,
  withMonsterSpellEffect,
} from '../../../services/monster-spell-effects';

describe('monster-spell-effects (1.26.0)', () => {
  it('mesmas magias e chaves do web (roll-modal/monster-spell-effects.ts)', () => {
    expect(SPELL_MONSTER_EFFECT).to.eql({
      264: 'bane',
      164: 'faerie_fire',
      290: 'guiding_bolt',
      361: 'vicious_mockery',
      289: 'enfeebled',
    });
    expect([...MONSTER_SPELL_EFFECT_KEYS]).to.eql([
      'bane',
      'faerie_fire',
      'guiding_bolt',
      'vicious_mockery',
      'enfeebled',
    ]);
    expect(isMonsterSpellEffectKey('bane')).to.be.true();
    expect(isMonsterSpellEffectKey('voo')).to.be.false();
    expect(isMonsterSpellEffectKey(3)).to.be.false();
  });

  it('normaliza: só chaves conhecidas com quem lançou; nulo vira vazio', () => {
    expect(normalizeMonsterSpellEffects(null)).to.eql({});
    expect(
      normalizeMonsterSpellEffects({
        bane: {from: 'Clara'},
        faerie_fire: {},
        voo: {from: 'x'},
      }),
    ).to.eql({bane: {from: 'Clara'}});
  });

  it('liga e desliga sem mexer nas outras', () => {
    const on = withMonsterSpellEffect(
      {bane: {from: 'Clara'}},
      'guiding_bolt',
      'Lyra',
    );
    expect(on).to.eql({bane: {from: 'Clara'}, guiding_bolt: {from: 'Lyra'}});
    expect(withMonsterSpellEffect(on, 'bane', null)).to.eql({
      guiding_bolt: {from: 'Lyra'},
    });
  });
});
