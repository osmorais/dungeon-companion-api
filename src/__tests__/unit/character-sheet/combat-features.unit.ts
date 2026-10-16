/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  bardicInspirationSides,
  buildCombatFeatures,
  damageDefensesFor,
} from '../../../services/character-sheet/combat-features';
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
      d20_reminders: [],
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

  it('Inspiração Bárdica: d6, d8 (5), d10 (10), d12 (15)', () => {
    expect([1, 4, 5, 9, 10, 14, 15, 20].map(bardicInspirationSides)).to.eql([
      6, 6, 8, 8, 10, 10, 12, 12,
    ]);
  });

  it('lembretes de vantagem: raça, Sentido de Perigo e Fúria ativa', () => {
    const dwarf = buildCombatFeatures({...base, idRace: 1});
    expect(dwarf.d20_reminders).to.eql([
      {
        applies: 'save',
        abilities: null,
        text: 'Vantagem contra veneno (Resistência Anã)',
      },
    ]);
    const gnome = buildCombatFeatures({...base, idRace: 5});
    expect(gnome.d20_reminders[0].abilities).to.eql(['INT', 'WIS', 'CHA']);
    const raging = buildCombatFeatures({
      ...base,
      idClass: 1,
      level: 2,
      activeEffects: {active: ['Fúria'], turn_uses: {}},
    });
    expect(raging.d20_reminders.map(r => `${r.applies}:${r.text}`)).to.eql([
      'save:Vantagem contra efeitos que você vê, como armadilhas e magias (Sentido de Perigo)',
      'save:Vantagem (Fúria)',
      'check:Vantagem (Fúria)',
    ]);
    expect(
      buildCombatFeatures({
        ...base,
        subrace: 'halfling-robusto',
        idRace: 3,
      }).d20_reminders.map(r => r.text),
    ).to.eql([
      'Vantagem contra veneno (Resistência Robusto)',
      'Vantagem contra medo (Bravura)',
    ]);
  });

  it('defesas ao receber dano: resistências de raça, Fúria, Esquiva Sobrenatural e Evasão', () => {
    const def = (extra: Partial<Parameters<typeof damageDefensesFor>[0]>) =>
      damageDefensesFor({
        idRace: 9,
        subrace: null,
        idClass: 7,
        level: 1,
        activeEffects: null,
        ...extra,
      });
    expect(def({})).to.eql({
      resistances: [],
      uncanny_dodge: false,
      evasion: false,
    });
    expect(def({idRace: 1}).resistances).to.eql(['veneno']);
    expect(def({idRace: 3, subrace: 'halfling-robusto'}).resistances).to.eql([
      'veneno',
    ]);
    expect(def({idRace: 8}).resistances).to.eql(['fogo']);
    expect(def({idRace: 4}).resistances).to.eql(['fogo']);
    expect(def({idClass: 1}).resistances).to.eql([]);
    expect(
      def({idClass: 1, activeEffects: {active: ['Fúria'], turn_uses: {}}})
        .resistances,
    ).to.eql(['contundente', 'cortante', 'perfurante']);
    expect(def({idClass: 8, level: 5})).to.containDeep({
      uncanny_dodge: true,
      evasion: false,
    });
    expect(def({idClass: 8, level: 7})).to.containDeep({evasion: true});
    expect(def({idClass: 10, level: 7})).to.containDeep({
      uncanny_dodge: false,
      evasion: true,
    });
  });
});
