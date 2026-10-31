/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  SPELL_CARD_DAMAGE_EXTRA,
  formatSpellDice,
  spellCardDamage,
  withCardDamage,
} from '../../../services/character-sheet/spell-card-damage';
import {SPELL_MECHANICS} from '../../../services/character-sheet/spell-mechanics';

describe('spell-card-damage (selo de dano da carta)', () => {
  it('dano base da mecânica: dados e tipo no círculo da magia', () => {
    expect(spellCardDamage(44, 3)).to.eql({
      dice: '8d6',
      type: 'fogo',
      kind: 'damage',
    });
    // Truque no nível 1, sem escalar.
    expect(spellCardDamage(287, 0)).to.eql({
      dice: '1d10',
      type: 'fogo',
      kind: 'damage',
    });
  });

  it('várias rolagens, bônus fixo e dados extras', () => {
    expect(spellCardDamage(222, 1)).to.eql({
      dice: '3× 1d4+1',
      type: 'energia',
      kind: 'damage',
    });
    expect(spellCardDamage(341, 4)?.dice).to.equal('2d8 + 4d6');
  });

  it('magia que soma no ataque leva "+"', () => {
    expect(spellCardDamage(49, 1)).to.eql({
      dice: '+1d6',
      type: 'necrótico',
      kind: 'damage',
    });
  });

  it('cura com o modificador escrito e PV temporários', () => {
    expect(spellCardDamage(108, 1)).to.eql({
      dice: '1d8 + mod',
      type: null,
      kind: 'heal',
    });
    expect(spellCardDamage(359, 1)?.kind).to.equal('temp_hp');
  });

  it('magia de dano sem mecânica usa o cadastro só de exibição', () => {
    expect(spellCardDamage(206, 4)).to.eql({
      dice: '8d8',
      type: 'necrótico',
      kind: 'damage',
    });
    expect(spellCardDamage(253, 9)?.dice).to.equal('MORTE');
  });

  it('magia sem dano nem cura não tem selo', () => {
    expect(spellCardDamage(188, 2)).to.be.null(); // Invisibilidade
    expect(spellCardDamage(68, 1)).to.be.null(); // Comando (resistência sem dano)
  });

  it('o cadastro só de exibição não repete magia que já rola dano ou cura', () => {
    for (const id of Object.keys(SPELL_CARD_DAMAGE_EXTRA)) {
      const m = SPELL_MECHANICS[Number(id)];
      expect({id, rola: !!(m?.damage ?? m?.heal)}).to.eql({id, rola: false});
    }
  });

  it('formatSpellDice: modificador negativo, extra e "+ mod"', () => {
    const entry = {
      instances: 1,
      dice_count: 2,
      dice_sides: 6,
      modifier: -1,
      extra_dice: [],
    };
    expect(formatSpellDice(entry)).to.equal('2d6-1');
    expect(
      formatSpellDice({...entry, modifier: 0}, {castingMod: true}),
    ).to.equal('2d6 + mod');
  });

  it('withCardDamage junta o campo sem mexer no resto', () => {
    const spell = withCardDamage({
      id_spell: 44,
      spellLevel: 3,
      name: 'Bola de Fogo',
    });
    expect(spell.name).to.equal('Bola de Fogo');
    expect(spell.card_damage?.dice).to.equal('8d6');
  });
});
