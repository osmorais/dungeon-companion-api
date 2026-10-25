import {expect} from '@loopback/testlab';
import {monsterRevealCard} from '../../../services/monster-reveal';

describe('monsterRevealCard (carta do aviso de revelação)', () => {
  it('tipo e tamanho da ficha, lore do bestiário', () => {
    expect(
      monsterRevealCard(
        {name: 'Goblin', type: 'humanoide', size: 'Pequeno', hit_points: 7},
        '  Pequenos e traiçoeiros.  ',
      ),
    ).to.eql({
      monster_type: 'humanoide',
      size: 'Pequeno',
      lore: 'Pequenos e traiçoeiros.',
    });
  });

  it('ficha antiga sem lore no bestiário: campos nulos, sem números de combate', () => {
    expect(monsterRevealCard({name: 'Goblin', type: ''}, null)).to.eql({
      monster_type: null,
      size: null,
      lore: null,
    });
    expect(monsterRevealCard(undefined, undefined)).to.eql({
      monster_type: null,
      size: null,
      lore: null,
    });
  });
});
