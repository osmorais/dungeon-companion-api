/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  attacksPerAction,
  bardicInspirationSides,
  buildCombatFeatures,
  buildSpellWeaponEffect,
  ELEMENTAL_WEAPON_TYPES,
  SPELL_WEAPON_SPELLS,
  spellBoonMaxTargets,
  applySpellArmorClass,
  damageDefensesFor,
  darkvisionFor,
} from '../../../services/character-sheet/combat-features';
import {
  collectTraits,
  resolveBackground,
  resolveClass,
  resolveRace,
  resolveSubclass,
} from '../../../services/character-sheet/calculator';
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
      attacks_per_action: 1,
      cunning_action: false,
      animal_companion: false,
      darkvision_m: null,
    });
  });

  describe('seção E: Ataque Extra, Ação Ardilosa, visão no escuro', () => {
    it('ataques por ação pelo traço de maior número', () => {
      expect(attacksPerAction([])).to.equal(1);
      expect(attacksPerAction([{name: 'Ataque Extra'}])).to.equal(2);
      expect(
        attacksPerAction([{name: 'Ataque Extra'}, {name: 'Ataque Extra (2)'}]),
      ).to.equal(3);
      expect(
        attacksPerAction([
          {name: 'Ataque Extra'},
          {name: 'Ataque Extra (2)'},
          {name: 'Ataque Extra (3)'},
        ]),
      ).to.equal(4);
      expect(attacksPerAction([{name: 'Ataque Extraordinário'}])).to.equal(1);
    });

    it('pelas regras: Guerreiro 2 no nv5, 3 no nv11, 4 no nv20; Monge 2 no nv5; Ladino 1', () => {
      const attacksAt = (idClass: number, level: number) =>
        attacksPerAction(
          collectTraits(
            resolveRace(9),
            null,
            resolveClass(idClass),
            resolveBackground(1),
            level,
          ),
        );
      expect([4, 5, 11, 20].map(level => attacksAt(7, level))).to.eql([
        1, 2, 3, 4,
      ]);
      expect([4, 5].map(level => attacksAt(10, level))).to.eql([1, 2]);
      expect(attacksAt(8, 20)).to.equal(1);
    });

    it('Ação Ardilosa: só com o traço (Ladino nv2)', () => {
      const traitsAt = (level: number) =>
        collectTraits(
          resolveRace(9),
          null,
          resolveClass(8),
          resolveBackground(1),
          level,
          resolveSubclass(8, null),
        );
      expect(
        buildCombatFeatures({...base, idClass: 8, traits: traitsAt(1)})
          .cunning_action,
      ).to.be.false();
      expect(
        buildCombatFeatures({...base, idClass: 8, traits: traitsAt(2)})
          .cunning_action,
      ).to.be.true();
    });

    it('visão no escuro pela raça: 18 m em quem tem, null em Humano e Halfling', () => {
      expect(
        [1, 2, 5, 6, 7, 8].map(idRace =>
          darkvisionFor({idRace, subrace: null}),
        ),
      ).to.eql([18, 18, 18, 18, 18, 18]);
      expect(darkvisionFor({idRace: 9, subrace: null})).to.be.null();
      expect(
        darkvisionFor({idRace: 3, subrace: 'halfling-robusto'}),
      ).to.be.null();
      expect(buildCombatFeatures({...base, idRace: 1}).darkvision_m).to.equal(
        18,
      );
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

  it('cada vantagem diz contra o que vale; Fúria vale sempre (sem contexto)', () => {
    const against = (
      overrides: Partial<Parameters<typeof buildCombatFeatures>[0]>,
    ) =>
      buildCombatFeatures({...base, ...overrides}).d20_reminders.map(
        r => r.against,
      );
    expect(against({idRace: 2})).to.eql(['charm']);
    expect(against({idRace: 3})).to.eql(['fear']);
    expect(against({idRace: 5})).to.eql(['magic']);
    expect(against({idClass: 1, level: 2})).to.eql(['visible']);
    expect(
      against({
        idClass: 1,
        level: 1,
        activeEffects: {active: ['Fúria'], turn_uses: {}},
      }),
    ).to.eql([null, null]);
  });

  it('lembretes de vantagem: raça, Sentido de Perigo e Fúria ativa', () => {
    const dwarf = buildCombatFeatures({...base, idRace: 1});
    expect(dwarf.d20_reminders).to.eql([
      {
        applies: 'save',
        abilities: null,
        against: 'poison',
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

  describe('magias na arma (Arma Mágica, Arma Elemental)', () => {
    it('mesmos ids e elementos do web (roll-modal/spell-weapon.ts)', () => {
      expect(Object.keys(SPELL_WEAPON_SPELLS).map(Number).sort()).to.eql([
        22, 24,
      ]);
      expect([...ELEMENTAL_WEAPON_TYPES]).to.eql([
        'ácido',
        'elétrico',
        'frio',
        'fogo',
        'trovejante',
      ]);
    });

    it('Arma Mágica: +1 no ataque e no dano, +2 no 4º círculo, +3 no 6º', () => {
      expect(
        [2, 3, 4, 5, 6, 9].map(
          slot => buildSpellWeaponEffect(24, slot)!.attack_bonus,
        ),
      ).to.eql([1, 1, 2, 2, 3, 3]);
      expect(buildSpellWeaponEffect(24, 6)).to.eql({
        id_spell: 24,
        name: 'Arma Mágica',
        slot_level: 6,
        attack_bonus: 3,
        damage_bonus: 3,
        dice: null,
        damage_type: null,
      });
    });

    it('Arma Elemental: +1/1d4, +2/2d4 no 5º e 6º, +3/3d4 no 7º+, do elemento escolhido', () => {
      expect(
        [3, 4, 5, 6, 7, 9].map(slot => {
          const e = buildSpellWeaponEffect(22, slot, 'frio')!;
          return [e.attack_bonus, e.dice!.count];
        }),
      ).to.eql([
        [1, 1],
        [1, 1],
        [2, 2],
        [2, 2],
        [3, 3],
        [3, 3],
      ]);
      expect(buildSpellWeaponEffect(22, 3, 'trovejante')).to.containDeep({
        name: 'Arma Elemental (trovejante)',
        damage_bonus: 0,
        dice: {count: 1, sides: 4},
        damage_type: 'trovejante',
      });
    });

    it('recusa círculo abaixo do da magia, acima do 9º, elemento inválido e outra magia', () => {
      expect(buildSpellWeaponEffect(24, 1)).to.be.null();
      expect(buildSpellWeaponEffect(24, 10)).to.be.null();
      expect(buildSpellWeaponEffect(24, 2.5)).to.be.null();
      expect(buildSpellWeaponEffect(22, 2, 'fogo')).to.be.null();
      expect(buildSpellWeaponEffect(22, 3)).to.be.null();
      expect(buildSpellWeaponEffect(22, 3, 'radiante')).to.be.null();
      expect(buildSpellWeaponEffect(49, 3)).to.be.null();
    });
  });

  describe('magias de apoio (Bênção, Orientação, Resistência)', () => {
    it('Bênção: 3 alvos no 1º círculo, +1 por círculo acima', () => {
      expect([1, 2, 3, 9].map(slot => spellBoonMaxTargets(42, slot))).to.eql([
        3, 4, 5, 11,
      ]);
      expect(spellBoonMaxTargets(42, 0)).to.be.null();
      expect(spellBoonMaxTargets(42, 10)).to.be.null();
    });

    it('magias de CA: um alvo, no círculo da magia ou maior', () => {
      expect(spellBoonMaxTargets(25, 1)).to.equal(1); // Armadura Arcana
      expect(spellBoonMaxTargets(146, 3)).to.equal(1); // Escudo da Fé não ganha alvo
      expect(spellBoonMaxTargets(145, 1)).to.equal(1); // Escudo Arcano
      expect(spellBoonMaxTargets(261, 1)).to.be.null(); // Pele de Árvore é 2º
      expect(spellBoonMaxTargets(351, 3)).to.equal(1); // Velocidade
    });

    it('CA: Armadura Arcana troca a base (sem armadura), somas e mínimo da Pele de Árvore', () => {
      const ctx = {
        wearingArmour: false,
        hasShield: false,
        dexMod: 2,
        wildShape: false,
      };
      const fx = (e: Record<string, unknown>) => ({
        active: [],
        turn_uses: {},
        ...e,
      });
      const by = {from: 'Elara'};
      expect(applySpellArmorClass(12, null, ctx)).to.equal(12);
      expect(applySpellArmorClass(12, fx({mage_armor: by}), ctx)).to.equal(15);
      expect(
        applySpellArmorClass(12, fx({mage_armor: by}), {
          ...ctx,
          hasShield: true,
        }),
      ).to.equal(17);
      // Defesa sem Armadura maior que 13 + DES: fica a maior
      expect(applySpellArmorClass(17, fx({mage_armor: by}), ctx)).to.equal(17);
      // de armadura ou em Forma Selvagem a Armadura Arcana não vale
      expect(
        applySpellArmorClass(16, fx({mage_armor: by}), {
          ...ctx,
          wearingArmour: true,
          dexMod: 5,
        }),
      ).to.equal(16);
      expect(
        applySpellArmorClass(11, fx({mage_armor: by}), {
          ...ctx,
          wildShape: true,
        }),
      ).to.equal(11);
      expect(
        applySpellArmorClass(
          15,
          fx({shield_of_faith: by, haste: by, shield: by}),
          ctx,
        ),
      ).to.equal(15 + 2 + 2 + 5);
      expect(applySpellArmorClass(12, fx({barkskin: by}), ctx)).to.equal(16);
      expect(applySpellArmorClass(18, fx({barkskin: by}), ctx)).to.equal(18);
    });

    it('Velocidade: vantagem em resistência de Destreza', () => {
      const features = buildCombatFeatures({
        ...base,
        activeEffects: {active: [], turn_uses: {}, haste: {from: 'Elara'}},
      } as Parameters<typeof buildCombatFeatures>[0]);
      expect(features.d20_reminders).to.containDeep([
        {
          applies: 'save',
          abilities: ['DEX'],
          against: null,
          text: 'Vantagem (Velocidade)',
        },
      ]);
    });

    it('Orientação e Resistência: truques de um alvo', () => {
      expect(spellBoonMaxTargets(247, 0)).to.equal(1);
      expect(spellBoonMaxTargets(305, 0)).to.equal(1);
      expect(spellBoonMaxTargets(305, 1)).to.be.null();
      expect(spellBoonMaxTargets(49, 1)).to.be.null();
    });
  });
});
