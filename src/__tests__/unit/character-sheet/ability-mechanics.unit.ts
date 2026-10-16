/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  ABILITY_MECHANICS_NAMES,
  abilityMechanicsFor,
} from '../../../services/character-sheet/ability-mechanics';
import {
  CLASSES,
  RACES,
  SUBCLASSES,
  getKnownClassAbilities,
  getKnownRaceAbilities,
} from '../../../services/character-sheet/rules';
import {stats} from '../fixtures';

describe('ability-mechanics', () => {
  const ctx = (level: number, overrides = {}) => ({
    level,
    stats: stats({WIS: 16}),
    profBonus: 3,
    spellSaveDc: 14,
    ...overrides,
  });

  it('toda habilidade com mecânica existe na tabela de alguma classe/subclasse/raça', () => {
    const known = new Set<string>();
    for (const c of Object.values(CLASSES)) {
      for (const sub of [
        null,
        ...(SUBCLASSES[c.id_class] ?? []).map(s => s.id_subclass),
      ]) {
        for (const a of getKnownClassAbilities(c.id_class, 20, sub))
          known.add(a.name);
      }
    }
    for (const r of Object.values(RACES)) {
      for (const a of getKnownRaceAbilities(r.id_race)) known.add(a.name);
    }
    for (const name of ABILITY_MECHANICS_NAMES) {
      expect({name, known: known.has(name)}).to.eql({name, known: true});
    }
  });

  it('Retomar o Fôlego: cura 1d10 + nível', () => {
    const {roll} = abilityMechanicsFor('Retomar o Fôlego', ctx(5));
    expect(roll).to.containDeep({kind: 'heal', heal: 'hp'});
    expect(roll!.by_slot['0']).to.containDeep({
      dice_count: 1,
      dice_sides: 10,
      modifier: 5,
    });
  });

  it('Integridade Corporal: cura fixa 3 × nível', () => {
    const {roll} = abilityMechanicsFor('Integridade Corporal', ctx(6));
    expect(roll!.by_slot['0']).to.containDeep({dice_count: 0, modifier: 18});
  });

  it('Preservar a Vida: 5 × nível pra distribuir', () => {
    const {roll} = abilityMechanicsFor(
      'Canalizar Divindade: Preservar a Vida',
      ctx(4),
    );
    expect(roll).to.containDeep({kind: 'heal', heal_distribute: true});
    expect(roll!.by_slot['0'].modifier).to.equal(20);
  });

  it('Curar pelo Toque: quantidade escolhida pelo jogador, sem rolagem pronta', () => {
    const result = abilityMechanicsFor('Curar pelo Toque (1 PV)', ctx(5));
    expect(result.variable_cost).to.be.true();
    expect(result.roll!.by_slot).to.eql({});
  });

  it('Radiação do Amanhecer: CON, 2d10 + nível radiante, metade, CD de magia', () => {
    const {roll} = abilityMechanicsFor(
      'Canalizar Divindade: Radiação do Amanhecer',
      ctx(6),
    );
    expect(roll).to.containDeep({
      kind: 'save',
      save_ability: 'CON',
      save_dc: 14,
      save_on_success: 'half',
      damage_type: 'radiante',
    });
    expect(roll!.by_slot['0']).to.containDeep({
      dice_count: 2,
      dice_sides: 10,
      modifier: 6,
    });
  });

  it('Monge: CD de chi = 8 + proficiência + SAB (Ataque Atordoante só CD; Palma Vibrante com dano)', () => {
    // SAB 16 (+3), prof 3 → CD 14
    const stun = abilityMechanicsFor(
      'Ataque Atordoante',
      ctx(5, {spellSaveDc: null}),
    ).roll!;
    expect(stun).to.containDeep({save_ability: 'CON', save_dc: 14});
    expect(stun.by_slot).to.eql({});
    const palm = abilityMechanicsFor(
      'Palma Vibrante',
      ctx(17, {spellSaveDc: null}),
    ).roll!;
    expect(palm.save_effect_note).to.match(/cai a 0 PV/);
    expect(palm.by_slot['0']).to.containDeep({dice_count: 10, dice_sides: 10});
  });

  it('Arma de Sopro: DES, CD 8 + CON + proficiência, fogo, metade, 2d6→5d6 pelo nível', () => {
    const breath = (level: number) =>
      abilityMechanicsFor('Arma de Sopro', {
        level,
        stats: stats({CON: 16}),
        profBonus: 2,
        spellSaveDc: null,
      }).roll!;
    expect(breath(1)).to.containDeep({
      kind: 'save',
      save_ability: 'DEX',
      save_dc: 8 + 2 + 3,
      save_on_success: 'half',
      damage_type: 'fogo',
    });
    expect([1, 6, 11, 16].map(l => breath(l).by_slot['0'].dice_count)).to.eql([
      2, 3, 4, 5,
    ]);
  });

  it('Criar Espaço de Magia devolve o espaço do círculo', () => {
    expect(
      abilityMechanicsFor('Criar Espaço de Magia (3º círculo)', ctx(5)),
    ).to.eql({
      roll: null,
      variable_cost: false,
      restores_slot: 3,
      activates: null,
      unarmed_attacks: null,
      targets_ally: false,
    });
  });

  it('habilidade sem mecânica: só gasta e anuncia', () => {
    expect(abilityMechanicsFor('Surto de Ação', ctx(5))).to.eql({
      roll: null,
      variable_cost: false,
      restores_slot: null,
      activates: null,
      unarmed_attacks: null,
      targets_ally: false,
    });
  });

  it('Fúria e Arma Sagrada ligam o efeito; Rajada de Golpes abre 2 ataques desarmados', () => {
    expect(abilityMechanicsFor('Fúria', ctx(3)).activates).to.equal('Fúria');
    expect(
      abilityMechanicsFor('Canalizar Divindade: Arma Sagrada', ctx(3))
        .activates,
    ).to.equal('Arma Sagrada');
    expect(
      abilityMechanicsFor('Rajada de Golpes', ctx(3)).unarmed_attacks,
    ).to.equal(2);
  });
});
