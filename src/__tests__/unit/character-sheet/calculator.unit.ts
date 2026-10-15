/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  applyLevelBasedAttributeBonuses,
  applyRacialBonuses,
  buildAttributeBlocks,
  buildLanguages,
  buildSpellcasting,
  buildWeaponActions,
  calcArmorClass,
  calcAuraOfProtectionBonus,
  calcDraconicResilienceHpBonus,
  calcMaxHP,
  calcRolledLevelUpHp,
  calcSpeedBonusMeters,
  collectProficientSkills,
  collectTraits,
  formatSpeedWithBonus,
  getMod,
  getProfBonus,
  grantsAllSavingThrowProficiency,
  grantsExtraSavingThrowProficiency,
  normalizeKey,
  normalizeSkill,
  resolveBackground,
  resolveClass,
  resolveRace,
  resolveSubclass,
  resolveSubrace,
} from '../../../services/character-sheet/calculator';
import {
  CLASSES,
  THIRD_CASTER_SLOTS,
} from '../../../services/character-sheet/rules';
import {FinalStats} from '../../../models/character-sheet-types';
import {armour, skill, spell, stats, weapon} from '../fixtures';

describe('calculator', () => {
  describe('normalização', () => {
    it('normalizeKey remove acento, espaço e caractere especial', () => {
      expect(normalizeKey('Anão da Colina')).to.equal('anao-da-colina');
      expect(normalizeKey('  Halfling Pés-Leves ')).to.equal(
        '-halfling-pes-leves-',
      );
    });

    it('normalizeSkill mapeia nome em português pra chave em inglês', () => {
      expect(normalizeSkill('Percepção')).to.equal('perception');
      expect(normalizeSkill('Adestrar Animais')).to.equal('animal_handling');
      expect(normalizeSkill('Prestidigitação')).to.equal('sleight_of_hand');
      expect(normalizeSkill('Pericia Nova')).to.equal('pericia_nova');
    });
  });

  describe('resolve*', () => {
    it('resolve raça/classe/antecedente por id e lança erro pra id inexistente', () => {
      expect(resolveRace(1).displayName).to.equal('Anão');
      expect(resolveClass(7).displayName).to.equal('Guerreiro');
      expect(resolveBackground(13).displayName).to.equal('Soldado');
      expect(() => resolveRace(999)).to.throw(/raça não encontrado/);
      expect(() => resolveClass(999)).to.throw(/classe não encontrado/);
      expect(() => resolveBackground(999)).to.throw(
        /antecedente não encontrado/,
      );
    });

    it('resolveSubrace aceita nome de exibição e devolve null quando não existe', () => {
      expect(resolveSubrace('Anão da Colina')?.hpBonusPerLevel).to.equal(1);
      expect(resolveSubrace(undefined)).to.be.null();
      expect(resolveSubrace('Inexistente')).to.be.null();
    });

    it('resolveSubclass só acha subclasse da própria classe', () => {
      expect(resolveSubclass(10, 'mao-aberta')?.id_subclass).to.equal(
        'mao-aberta',
      );
      expect(resolveSubclass(4, 'mao-aberta')).to.be.null();
      expect(resolveSubclass(10, null)).to.be.null();
    });
  });

  describe('getMod / getProfBonus', () => {
    it('modificador de atributo segue a tabela do PHB', () => {
      const table: [number, number][] = [
        [1, -5],
        [8, -1],
        [9, -1],
        [10, 0],
        [11, 0],
        [12, 1],
        [15, 2],
        [20, 5],
        [30, 10],
      ];
      for (const [score, mod] of table) expect(getMod(score)).to.equal(mod);
    });

    it('bônus de proficiência escala de 2 a 6 nos níveis certos', () => {
      const expected = [
        2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
      ];
      expect(expected.map((_, i) => getProfBonus(i + 1))).to.eql(expected);
    });
  });

  describe('atributos', () => {
    it('soma bônus de raça e sub-raça sobre os valores base (chaves em português)', () => {
      const result = applyRacialBonuses(
        {FOR: 15, DES: 14, CON: 13, INT: 12, SAB: 10, CAR: 8},
        resolveRace(1),
        resolveSubrace('Anão da Colina'),
      );
      expect(result).to.eql({
        STR: 15,
        DEX: 14,
        CON: 15,
        INT: 12,
        WIS: 11,
        CHA: 8,
      });
    });

    it('atributo ausente cai pra 8', () => {
      const result = applyRacialBonuses({}, resolveRace(9), null);
      expect(result).to.eql({STR: 9, DEX: 9, CON: 9, INT: 9, WIS: 9, CHA: 9});
    });

    it('Campeão Primitivo: Bárbaro nv20 ganha +4 FOR/CON limitado a 24', () => {
      const base = stats({STR: 22, CON: 18});
      expect(applyLevelBasedAttributeBonuses(base, 1, 20)).to.containDeep({
        STR: 24,
        CON: 22,
      });
      expect(applyLevelBasedAttributeBonuses(base, 1, 19)).to.eql(base);
      expect(applyLevelBasedAttributeBonuses(base, 7, 20)).to.eql(base);
    });
  });

  describe('testes de resistência', () => {
    it('Alma de Diamante: Monge nv14+ proficiente em todas', () => {
      expect(grantsAllSavingThrowProficiency(10, 14)).to.be.true();
      expect(grantsAllSavingThrowProficiency(10, 13)).to.be.false();
      expect(grantsAllSavingThrowProficiency(8, 20)).to.be.false();
    });

    it('Aura de Proteção: Paladino nv6+ soma mod. CAR (mínimo +1)', () => {
      expect(calcAuraOfProtectionBonus(11, 6, 3)).to.equal(3);
      expect(calcAuraOfProtectionBonus(11, 6, -1)).to.equal(1);
      expect(calcAuraOfProtectionBonus(11, 5, 3)).to.equal(0);
      expect(calcAuraOfProtectionBonus(4, 20, 3)).to.equal(0);
    });

    it('Mente Escorregadia: Ladino nv15+ ganha proficiência em SAB', () => {
      expect(grantsExtraSavingThrowProficiency(8, 15)).to.equal('WIS');
      expect(grantsExtraSavingThrowProficiency(8, 14)).to.be.null();
      expect(grantsExtraSavingThrowProficiency(1, 20)).to.be.null();
    });

    it('buildAttributeBlocks aplica proficiência da classe, aura e proficiência extra', () => {
      const s = stats({STR: 16, DEX: 12, WIS: 14, CHA: 16});
      const blocks = buildAttributeBlocks(s, CLASSES[11], 3, false, 3, 'DEX');
      expect(blocks.STR).to.eql({
        score: 16,
        modifier: 3,
        save: 3 + 3,
        save_proficiency: false,
      });
      expect(blocks.WIS).to.eql({
        score: 14,
        modifier: 2,
        save: 2 + 3 + 3,
        save_proficiency: true,
      });
      expect(blocks.CHA.save).to.equal(3 + 3 + 3);
      expect(blocks.DEX).to.eql({
        score: 12,
        modifier: 1,
        save: 1 + 3 + 3,
        save_proficiency: true,
      });
    });

    it('buildAttributeBlocks com allSavesProficient marca todos', () => {
      const blocks = buildAttributeBlocks(stats(), CLASSES[10], 5, true);
      for (const block of Object.values(blocks))
        expect(block.save_proficiency).to.be.true();
    });
  });

  describe('deslocamento', () => {
    const barbarian = CLASSES[1].featuresByLevel;
    const monk = CLASSES[10].featuresByLevel;

    it('Movimento Rápido: Bárbaro nv5+ ganha 3m, exceto com armadura pesada', () => {
      expect(calcSpeedBonusMeters(1, 5, barbarian, null, false)).to.equal(3);
      expect(
        calcSpeedBonusMeters(1, 5, barbarian, 'Armadura Média', true),
      ).to.equal(3);
      expect(
        calcSpeedBonusMeters(1, 5, barbarian, 'Armadura Pesada', false),
      ).to.equal(0);
      expect(calcSpeedBonusMeters(1, 4, barbarian, null, false)).to.equal(0);
    });

    it('Deslocamento sem Armadura do Monge vem da tabela e some com armadura ou escudo', () => {
      expect(calcSpeedBonusMeters(10, 1, monk, null, false)).to.equal(0);
      expect(calcSpeedBonusMeters(10, 2, monk, null, false)).to.equal(3);
      expect(calcSpeedBonusMeters(10, 6, monk, null, false)).to.equal(4.5);
      expect(calcSpeedBonusMeters(10, 20, monk, null, false)).to.equal(9);
      expect(
        calcSpeedBonusMeters(10, 6, monk, 'Armadura Leve', false),
      ).to.equal(0);
      expect(calcSpeedBonusMeters(10, 6, monk, null, true)).to.equal(0);
    });

    it('outras classes não ganham bônus', () => {
      expect(
        calcSpeedBonusMeters(7, 20, CLASSES[7].featuresByLevel, null, false),
      ).to.equal(0);
    });

    it('formatSpeedWithBonus soma e mantém vírgula decimal', () => {
      expect(formatSpeedWithBonus('9m', 0)).to.equal('9m');
      expect(formatSpeedWithBonus('9m', 3)).to.equal('12m');
      expect(formatSpeedWithBonus('7,5m', 3)).to.equal('10,5m');
      expect(formatSpeedWithBonus('9m', 4.5)).to.equal('13,5m');
    });
  });

  describe('calcArmorClass', () => {
    const s = stats({DEX: 16, CON: 14, WIS: 16});

    it('sem armadura: 10 + DES, com variações de Bárbaro/Monge/Linhagem Dracônica', () => {
      expect(calcArmorClass(null, s, false, 7)).to.equal(13);
      expect(calcArmorClass(null, s, false, 1)).to.equal(15);
      expect(calcArmorClass(null, s, false, 10)).to.equal(16);
      expect(
        calcArmorClass(null, s, false, 6, null, 'linhagem-draconica'),
      ).to.equal(16);
      expect(
        calcArmorClass(null, s, false, 6, null, 'magia-selvagem'),
      ).to.equal(13);
    });

    it('armadura leve soma DES inteira, média limita DES, pesada ignora DES', () => {
      expect(calcArmorClass(armour('Armadura Leve', 11), s, false, 7)).to.equal(
        14,
      );
      expect(
        calcArmorClass(armour('Armadura Média', 14, 2), s, false, 7),
      ).to.equal(16);
      expect(
        calcArmorClass(
          armour('Armadura Média', 14, null),
          stats({DEX: 18}),
          false,
          7,
        ),
      ).to.equal(16);
      expect(
        calcArmorClass(armour('Armadura Pesada', 18), s, false, 7),
      ).to.equal(18);
    });

    it('escudo soma +2 e Estilo Defesa soma +1 só com armadura', () => {
      expect(
        calcArmorClass(armour('Armadura Pesada', 18), s, true, 7),
      ).to.equal(20);
      expect(
        calcArmorClass(armour('Armadura Pesada', 18), s, true, 7, 'Defesa'),
      ).to.equal(21);
      expect(calcArmorClass(null, s, false, 7, 'Defesa')).to.equal(13);
    });
  });

  describe('pontos de vida', () => {
    it('calcMaxHP: dado cheio no nv1 + média arredondada pra cima nos seguintes', () => {
      expect(calcMaxHP(10, 1, 2)).to.equal(12);
      expect(calcMaxHP(10, 3, 2)).to.equal(12 + 2 * (6 + 2));
      expect(calcMaxHP(8, 1, 0, 1)).to.equal(9);
      expect(calcMaxHP(6, 1, -5)).to.equal(1);
    });

    it('calcRolledLevelUpHp soma dado + CON + bônus, mínimo 1', () => {
      expect(calcRolledLevelUpHp(7, 2)).to.equal(9);
      expect(calcRolledLevelUpHp(4, 1, 1)).to.equal(6);
      expect(calcRolledLevelUpHp(1, -3)).to.equal(1);
    });

    it('Resiliência Dracônica dá +1 PV por nível só na Linhagem Dracônica', () => {
      expect(calcDraconicResilienceHpBonus('linhagem-draconica')).to.equal(1);
      expect(calcDraconicResilienceHpBonus('magia-selvagem')).to.equal(0);
      expect(calcDraconicResilienceHpBonus(null)).to.equal(0);
    });
  });

  describe('buildWeaponActions', () => {
    const s = stats({STR: 16, DEX: 14});

    it('corpo a corpo usa FOR, acuidade usa o maior, munição usa DES', () => {
      const [sword, rapier, bow] = buildWeaponActions(
        [
          weapon('Espada Longa', 'Versátil (1d10)'),
          weapon('Rapieira', 'Acuidade'),
          weapon('Arco Longo', 'Munição (alcance 45/180), Pesada, Duas Mãos'),
        ],
        s,
        2,
      );
      expect([
        sword.attack_bonus,
        sword.damage_modifier,
        sword.isRanged,
      ]).to.eql([5, 3, false]);
      expect([rapier.attack_bonus, rapier.damage_modifier]).to.eql([5, 3]);
      expect([bow.attack_bonus, bow.damage_modifier, bow.isRanged]).to.eql([
        4,
        2,
        true,
      ]);
    });

    it('Arqueria soma +2 no ataque à distância', () => {
      const [bow, sword] = buildWeaponActions(
        [
          weapon('Arco Curto', 'Munição'),
          weapon('Espada Curta', 'Acuidade, Leve'),
        ],
        s,
        2,
        'Arqueria',
      );
      expect(bow.attack_bonus).to.equal(6);
      expect(sword.attack_bonus).to.equal(5);
    });

    it('Duelo soma +2 no dano só com uma única arma corpo a corpo de uma mão', () => {
      const [single] = buildWeaponActions(
        [weapon('Espada Longa', 'Versátil (1d10)')],
        s,
        2,
        'Duelo',
      );
      expect(single.damage_modifier).to.equal(5);

      const [greatsword] = buildWeaponActions(
        [weapon('Montante', 'Pesada, Duas Mãos')],
        s,
        2,
        'Duelo',
      );
      expect(greatsword.damage_modifier).to.equal(3);

      const [first] = buildWeaponActions(
        [weapon('Espada Longa', null), weapon('Adaga', 'Acuidade')],
        s,
        2,
        'Duelo',
      );
      expect(first.damage_modifier).to.equal(3);
    });
  });

  describe('collectTraits', () => {
    it('inclui traços de raça, classe, antecedente e features por nível de classe/subclasse', () => {
      const subclass = resolveSubclass(10, 'mao-aberta');
      const traits = collectTraits(
        resolveRace(9),
        null,
        CLASSES[10],
        resolveBackground(1),
        6,
        subclass,
      );
      const sources = traits.map(t => t.source);
      expect(sources).to.containEql('Classe (Nível 2)');
      expect(sources).to.containEql('Classe (Nível 6)');
      expect(
        sources.some(src =>
          src?.startsWith(`${subclass!.displayName} (Nível 6)`),
        ),
      ).to.be.true();
      expect(sources).to.not.containEql('Classe (Nível 7)');
      expect(traits.map(t => t.name)).to.containEql('Integridade Corporal');
    });

    it('preenche Estilo de Luta escolhido e CDs fixas calculadas', () => {
      const s = stats({CHA: 16, WIS: 16});
      const fighter = collectTraits(
        resolveRace(9),
        null,
        CLASSES[7],
        resolveBackground(13),
        1,
        null,
        'Defesa',
      );
      expect(
        fighter.find(t => t.name === 'Estilo de Luta')?.description,
      ).to.startWith('Escolhido: Defesa.');

      // Paladino ganha o Estilo de Luta no nv2 (feature de nível, não traço de nv1) — regressão já corrigida antes.
      const paladin = collectTraits(
        resolveRace(9),
        null,
        CLASSES[11],
        resolveBackground(13),
        2,
        null,
        'Duelo',
      );
      expect(
        paladin.find(t => t.name === 'Estilo de Luta')?.description,
      ).to.startWith('Escolhido: Duelo.');

      const berserker = collectTraits(
        resolveRace(9),
        null,
        CLASSES[1],
        resolveBackground(13),
        10,
        resolveSubclass(1, 'furioso'),
        null,
        4,
        s,
      );
      const presence = berserker.find(t => t.name === 'Presença Intimidante');
      expect(presence?.description).to.match(/CD 15/);

      const openHand = collectTraits(
        resolveRace(9),
        null,
        CLASSES[10],
        resolveBackground(13),
        11,
        resolveSubclass(10, 'mao-aberta'),
        null,
        4,
        s,
      );
      expect(
        openHand.find(t => t.name === 'Tranquilidade')?.description,
      ).to.match(/CD 15/);
    });
  });

  describe('buildSpellcasting', () => {
    const s: FinalStats = stats({INT: 16, WIS: 14, CHA: 16});

    it('classe não conjuradora devolve is_spellcaster false', () => {
      expect(buildSpellcasting(CLASSES[7], 7, 1, [], s, 2)).to.eql({
        is_spellcaster: false,
      });
    });

    it('Mago nv1: CD/ataque, espaços, truques e magias agrupadas por círculo', () => {
      const result = buildSpellcasting(
        CLASSES[9],
        9,
        1,
        [spell(1, 'Raio de Fogo', 0), spell(2, 'Mísseis Mágicos', 1)],
        s,
        2,
        {level_1: 1},
      );
      expect(result).to.containDeep({
        is_spellcaster: true,
        spellcasting_ability: 'INT',
        spell_save_dc: 13,
        spell_attack_bonus: 5,
        slots_total: {level_1: 2},
        slots_expended: {level_1: 1},
        spells_known: {
          cantrips: ['Raio de Fogo'],
          level_1: ['Mísseis Mágicos'],
        },
        prepares_spells: true,
        max_prepared_spells: 4,
      });
    });

    it('Paladino nv1 não tem espaços de magia', () => {
      const result = buildSpellcasting(CLASSES[11], 11, 1, [], s, 2);
      expect(result.is_spellcaster).to.be.true();
      if (result.is_spellcaster) {
        expect(result.slots_total).to.be.undefined();
        expect(result.spells_known).to.be.undefined();
      }
    });

    it('override de subclasse (Cavaleiro Arcano) usa INT e tabela de terço-conjurador', () => {
      const result = buildSpellcasting(
        CLASSES[7],
        7,
        3,
        [],
        s,
        2,
        {},
        {ability: 'INT', slotsTable: THIRD_CASTER_SLOTS},
      );
      expect(result).to.containDeep({
        is_spellcaster: true,
        spellcasting_ability: 'INT',
        slots_total: {level_1: 2},
        prepares_spells: false,
      });
      if (result.is_spellcaster)
        expect(result.max_prepared_spells).to.be.undefined();
    });
  });

  describe('idiomas e perícias', () => {
    it('buildLanguages soma idiomas à escolha do antecedente sem duplicar', () => {
      const langs = buildLanguages(resolveRace(9), resolveBackground(12));
      expect(langs).to.containEql('Idioma à escolha 1');
      expect(langs).to.containEql('Idioma à escolha 2');
      expect(new Set(langs).size).to.equal(langs.length);
    });

    it('collectProficientSkills une escolhidas, antecedente e raça sem duplicar', () => {
      const result = collectProficientSkills(
        [skill(1, 'Percepção'), skill(2, 'Intuição')],
        resolveBackground(1),
        resolveRace(2),
      );
      expect(result.sort()).to.eql(['insight', 'perception', 'religion']);
    });
  });
});
