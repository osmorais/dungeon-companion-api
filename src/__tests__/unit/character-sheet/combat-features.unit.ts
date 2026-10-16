/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {buildCombatFeatures} from '../../../services/character-sheet/combat-features';
import {stats} from '../fixtures';

describe('combat-features', () => {
  const base = {
    idClass: 7,
    idSubclass: null,
    idRace: 9,
    level: 5,
    stats: stats({STR: 16, DEX: 14, WIS: 14, CHA: 16}),
    profBonus: 3,
    classResources: null,
    featIds: [],
    activeEffects: null,
  };

  it('personagem comum: crítico só no 20, nada a somar', () => {
    expect(buildCombatFeatures(base)).to.eql({
      crit_min: 20,
      melee_crit_extra_dice: 0,
      riders: [],
      attack_bonuses: [],
      power_attack: [],
      unarmed: null,
      active_effects: {active: [], turn_uses: {}},
      halfling_lucky: false,
    });
  });

  it('Halfling: Sortudo', () => {
    expect(
      buildCombatFeatures({...base, idRace: 3}).halfling_lucky,
    ).to.be.true();
  });

  it('Ladino: Ataque Furtivo com o dado do nível, acuidade ou distância, 1×/turno', () => {
    const f = buildCombatFeatures({
      ...base,
      idClass: 8,
      classResources: {'Ataque Furtivo': '3d6'},
    });
    expect(f.riders).to.eql([
      {
        key: 'Ataque Furtivo',
        name: 'Ataque Furtivo',
        dice: {count: 3, sides: 6},
        flat: 0,
        damage_type: 'da arma',
        applies: 'finesse_or_ranged',
        once_per_turn: true,
        requires_active: null,
      },
    ]);
  });

  it('Bárbaro: Fúria soma o dano de fúria (só ativa); Crítico Brutal e Ataques Selvagens', () => {
    const f = buildCombatFeatures({
      ...base,
      idClass: 1,
      level: 13,
      idRace: 7,
      classResources: {'Dano de Fúria': '+3'},
    });
    expect(f.riders[0]).to.containDeep({
      key: 'Fúria',
      flat: 3,
      applies: 'melee_str',
      requires_active: 'Fúria',
    });
    expect(f.melee_crit_extra_dice).to.equal(2 + 1);
    expect(
      buildCombatFeatures({...base, idClass: 1, level: 8})
        .melee_crit_extra_dice,
    ).to.equal(0);
  });

  it('Clérigo: Golpe Divino do domínio a partir do nv8 (2d8 no 14); Conhecimento não tem', () => {
    const war = buildCombatFeatures({
      ...base,
      idClass: 4,
      idSubclass: 'tempestade',
      level: 8,
    });
    expect(war.riders[0]).to.containDeep({
      key: 'Golpe Divino',
      dice: {count: 1, sides: 8},
      damage_type: 'elétrico ou trovão',
      once_per_turn: true,
    });
    expect(
      buildCombatFeatures({...base, idClass: 4, idSubclass: 'vida', level: 14})
        .riders[0].dice,
    ).to.eql({count: 2, sides: 8});
    expect(
      buildCombatFeatures({...base, idClass: 4, idSubclass: 'vida', level: 7})
        .riders,
    ).to.eql([]);
    expect(
      buildCombatFeatures({
        ...base,
        idClass: 4,
        idSubclass: 'conhecimento',
        level: 14,
      }).riders,
    ).to.eql([]);
  });

  it('Ranger nv20: Matador de Inimigos (+ mod. SAB, 1×/turno)', () => {
    const f = buildCombatFeatures({...base, idClass: 12, level: 20});
    expect(f.riders[0]).to.containDeep({
      key: 'Matador de Inimigos',
      flat: 2,
      once_per_turn: true,
    });
  });

  it('Paladino da Devoção: Arma Sagrada (+ mod. CAR no ataque, mínimo 1)', () => {
    const f = buildCombatFeatures({
      ...base,
      idClass: 11,
      idSubclass: 'devocao',
      level: 3,
    });
    expect(f.attack_bonuses).to.eql([
      {
        key: 'Arma Sagrada',
        name: 'Arma Sagrada',
        bonus: 3,
        requires_active: 'Arma Sagrada',
      },
    ]);
  });

  it('Campeão: crítico 19–20 no nv3 e 18–20 no nv15', () => {
    const champion = {...base, idSubclass: 'campeao'};
    expect(buildCombatFeatures({...champion, level: 3}).crit_min).to.equal(19);
    expect(buildCombatFeatures({...champion, level: 15}).crit_min).to.equal(18);
  });

  it('talentos: Mestre em Armas Grandes e Mestre-Atirador', () => {
    const f = buildCombatFeatures({
      ...base,
      featIds: ['mestre-armas-grandes', 'mestre-atirador'],
    });
    expect(f.power_attack).to.eql([
      {name: 'Mestre em Armas Grandes', applies: 'heavy_melee'},
      {name: 'Mestre-Atirador', applies: 'ranged'},
    ]);
  });

  it('Monge: ataque desarmado com o dado de Artes Marciais e o melhor de FOR/DES', () => {
    const f = buildCombatFeatures({
      ...base,
      idClass: 10,
      stats: stats({STR: 10, DEX: 18}),
      classResources: {'Artes Marciais': '1d6'},
    });
    expect(f.unarmed).to.eql({
      name: 'Ataque Desarmado',
      attack_bonus: 3 + 4,
      dice: {count: 1, sides: 6},
      damage_modifier: 4,
    });
  });

  it('efeitos ativos e usos por turno vêm do personagem', () => {
    const effects = {
      active: ['Fúria'],
      turn_uses: {'Ataque Furtivo': 'enc:1:p1'},
    };
    expect(
      buildCombatFeatures({...base, activeEffects: effects}).active_effects,
    ).to.eql(effects);
  });
});
