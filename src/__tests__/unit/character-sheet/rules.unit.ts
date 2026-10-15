/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  CLASSES,
  CLASS_SPELLS,
  FULL_LIST_PREPARED_CASTER_CLASS_IDS,
  KNOWN_CASTER_CLASS_IDS,
  SPELL_SLOTS,
  SUBCLASSES,
  THIRD_CASTER_SLOTS,
  TRACKABLE_RESOURCES,
  XP_THRESHOLDS,
  firstSubclassChoiceLevel,
  getKnownClassAbilities,
  getWizardSpellbookSize,
  hasArcaneSecretsChoice,
  maxTrackableResourceUses,
  xpNeededForLevel,
} from '../../../services/character-sheet/rules';
import {FEATS} from '../../../services/character-sheet/feats';

const LEVELS = Array.from({length: 20}, (_, i) => i + 1);
const CLASS_IDS = Object.keys(CLASSES).map(Number);

describe('rules', () => {
  describe('integridade dos dados de classe', () => {
    it('as 12 classes existem com id igual à chave', () => {
      expect(CLASS_IDS.sort((a, b) => a - b)).to.eql([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ]);
      for (const id of CLASS_IDS) expect(CLASSES[id].id_class).to.equal(id);
    });

    it('toda classe tem featuresByLevel completo de 1 a 20', () => {
      for (const id of CLASS_IDS) {
        for (const level of LEVELS) {
          expect(CLASSES[id].featuresByLevel?.[level]).to.not.be.undefined();
        }
      }
    });

    it('níveis de ASI seguem o PHB (Guerreiro extra em 6/14, Ladino extra em 10)', () => {
      const asiLevels = (id: number) =>
        LEVELS.filter(l => CLASSES[id].featuresByLevel![l].isAsiLevel);
      for (const id of CLASS_IDS) {
        if (id === 7) expect(asiLevels(id)).to.eql([4, 6, 8, 12, 14, 16, 19]);
        else if (id === 8) expect(asiLevels(id)).to.eql([4, 8, 10, 12, 16, 19]);
        else expect(asiLevels(id)).to.eql([4, 8, 12, 16, 19]);
      }
    });

    it('nível de escolha de subclasse: Bruxo/Clérigo/Feiticeiro 1, Druida/Mago 2, resto 3', () => {
      const expected: Record<number, number> = {
        1: 3,
        2: 3,
        3: 1,
        4: 1,
        5: 2,
        6: 1,
        7: 3,
        8: 3,
        9: 2,
        10: 3,
        11: 3,
        12: 3,
      };
      for (const id of CLASS_IDS)
        expect(firstSubclassChoiceLevel(CLASSES[id])).to.equal(expected[id]);
    });

    it('toda classe tem ao menos uma subclasse, com ids únicos', () => {
      for (const id of CLASS_IDS) {
        const ids = (SUBCLASSES[id] ?? []).map(s => s.id_subclass);
        expect(ids.length).to.be.above(0);
        expect(new Set(ids).size).to.equal(ids.length);
      }
    });

    it('Estilo de Luta: Guerreiro nv1, Paladino e Ranger nv2', () => {
      expect(CLASSES[7].fightingStyleChoice?.level).to.equal(1);
      expect(CLASSES[11].fightingStyleChoice?.level).to.equal(2);
      expect(CLASSES[12].fightingStyleChoice?.level).to.equal(2);
      expect(CLASSES[11].fightingStyleChoice?.options).to.not.containEql(
        'Arqueria',
      );
    });
  });

  describe('espaços de magia', () => {
    it('toda classe conjuradora tem tabela de 1 a 20', () => {
      for (const id of CLASS_IDS.filter(c => CLASSES[c].isSpellcaster)) {
        for (const level of LEVELS)
          expect(SPELL_SLOTS[id]?.[level]).to.not.be.undefined();
      }
      for (const level of LEVELS)
        expect(THIRD_CASTER_SLOTS[level]).to.not.be.undefined();
    });

    it('conjurador completo: nv1 = 2 espaços de 1º, nv20 chega ao 9º círculo', () => {
      expect(SPELL_SLOTS[9][1]).to.eql({level_1: 2});
      expect(SPELL_SLOTS[9][20]).to.containDeep({level_1: 4, level_9: 1});
    });

    it('Bruxo nv5 tem 2 espaços de 3º; Paladino nv1 nenhum; terço-conjurador nv3 = 2 de 1º', () => {
      expect(SPELL_SLOTS[3][5]).to.eql({level_3: 2});
      expect(SPELL_SLOTS[11][1]).to.eql({});
      expect(SPELL_SLOTS[11][2]).to.eql({level_1: 2});
      expect(THIRD_CASTER_SLOTS[3]).to.eql({level_1: 2});
    });

    it('agrupamentos de conjuradores não se sobrepõem', () => {
      for (const id of KNOWN_CASTER_CLASS_IDS)
        expect(FULL_LIST_PREPARED_CASTER_CLASS_IDS.has(id)).to.be.false();
      expect([...FULL_LIST_PREPARED_CASTER_CLASS_IDS].sort()).to.eql(
        Object.keys(CLASS_SPELLS).map(Number).sort(),
      );
    });

    it('grimório do Mago: 6 no nv1, +2 por nível', () => {
      expect(getWizardSpellbookSize(1)).to.equal(6);
      expect(getWizardSpellbookSize(5)).to.equal(14);
      expect(getWizardSpellbookSize(20)).to.equal(44);
    });
  });

  describe('maxTrackableResourceUses', () => {
    it('número fixo, ilimitado e ausente', () => {
      expect(maxTrackableResourceUses({Fúrias: '3'}, 'Fúrias')).to.equal(3);
      expect(
        maxTrackableResourceUses({Fúrias: 'Ilimitadas'}, 'Fúrias'),
      ).to.equal('unlimited');
      expect(maxTrackableResourceUses({}, 'Fúrias')).to.be.null();
      expect(maxTrackableResourceUses(undefined, 'Fúrias')).to.be.null();
      expect(
        maxTrackableResourceUses({'Pontos de Chi': '–'}, 'Pontos de Chi'),
      ).to.be.null();
    });

    it('fórmula mod:ATRIBUTO(+N), mínimo 1', () => {
      expect(maxTrackableResourceUses({x: 'mod:CHA'}, 'x', {CHA: 16})).to.equal(
        3,
      );
      expect(
        maxTrackableResourceUses({x: 'mod:CHA+1'}, 'x', {CHA: 16}),
      ).to.equal(4);
      expect(maxTrackableResourceUses({x: 'mod:CHA'}, 'x', {CHA: 8})).to.equal(
        1,
      );
      expect(maxTrackableResourceUses({x: 'mod:CHA'}, 'x')).to.equal(1);
    });

    it('toda chave de TRACKABLE_RESOURCES aparece em algum resources da classe ou subclasse', () => {
      const missing: string[] = [];
      for (const [classId, resources] of Object.entries(TRACKABLE_RESOURCES)) {
        const id = Number(classId);
        const levelData = [
          ...LEVELS.map(l => CLASSES[id].featuresByLevel?.[l]),
          ...(SUBCLASSES[id] ?? []).flatMap(s =>
            Object.values(s.featuresByLevel),
          ),
        ];
        for (const resource of resources) {
          if (!levelData.some(d => d?.resources?.[resource.key] !== undefined))
            missing.push(`${id}:${resource.key}`);
        }
      }
      expect(missing).to.eql([]);
    });

    it('valores conhecidos por nível (regressão de tabela)', () => {
      const res = (id: number, level: number) =>
        CLASSES[id].featuresByLevel![level].resources;
      expect(maxTrackableResourceUses(res(1, 1), 'Fúrias')).to.equal(2);
      expect(maxTrackableResourceUses(res(1, 20), 'Fúrias')).to.equal(
        'unlimited',
      );
      expect(maxTrackableResourceUses(res(7, 1), 'Surto de Ação')).to.be.null();
      expect(maxTrackableResourceUses(res(7, 20), 'Surto de Ação')).to.equal(2);
      expect(maxTrackableResourceUses(res(7, 20), 'Indomável')).to.equal(3);
      expect(maxTrackableResourceUses(res(10, 5), 'Pontos de Chi')).to.equal(5);
      expect(maxTrackableResourceUses(res(11, 5), 'Curar pelo Toque')).to.equal(
        25,
      );
      expect(
        maxTrackableResourceUses(res(11, 2), 'Canalizar Divindade'),
      ).to.be.null();
      expect(
        maxTrackableResourceUses(res(11, 3), 'Canalizar Divindade'),
      ).to.equal(1);
      expect(maxTrackableResourceUses(res(5, 20), 'Forma Selvagem')).to.equal(
        'unlimited',
      );
    });

    it('recargas: Guerreiro Indomável só no longo, Monge chi no curto', () => {
      const fighter = Object.fromEntries(
        TRACKABLE_RESOURCES[7].map(r => [r.key, r.rechargeOn]),
      );
      expect(fighter).to.eql({
        'Retomar Fôlego': 'short_rest',
        'Surto de Ação': 'short_rest',
        Indomável: 'long_rest',
      });
      expect(
        TRACKABLE_RESOURCES[10].find(r => r.key === 'Pontos de Chi')
          ?.rechargeOn,
      ).to.equal('short_rest');
    });
  });

  describe('getKnownClassAbilities', () => {
    it('filtra por nível aprendido', () => {
      expect(getKnownClassAbilities(10, 1)).to.eql([]);
      const names = getKnownClassAbilities(10, 5).map(a => a.name);
      expect(names).to.containEql('Rajada de Golpes');
      expect(names).to.containEql('Ataque Atordoante');
    });

    it('habilidade de subclasse só aparece pra subclasse certa', () => {
      const openHand = getKnownClassAbilities(10, 17, 'mao-aberta').map(
        a => a.name,
      );
      const shadow = getKnownClassAbilities(10, 17, 'sombra').map(a => a.name);
      expect(openHand).to.containEql('Palma Vibrante');
      expect(openHand).to.not.containEql('Artes Sombrias');
      expect(shadow).to.containEql('Artes Sombrias');
      expect(shadow).to.not.containEql('Palma Vibrante');
    });

    it('toda habilidade consome um recurso rastreável da própria classe', () => {
      const orphans: string[] = [];
      for (const id of CLASS_IDS) {
        const keys = new Set((TRACKABLE_RESOURCES[id] ?? []).map(r => r.key));
        for (const ability of getKnownClassAbilities(id, 20, null)) {
          if (!keys.has(ability.resourceKey))
            orphans.push(`${id}:${ability.name}->${ability.resourceKey}`);
        }
      }
      expect(orphans).to.eql([]);
    });

    it('classe sem tabela de habilidades devolve lista vazia', () => {
      expect(getKnownClassAbilities(12, 20)).to.eql([]);
    });
  });

  describe('XP e Segredos Mágicos', () => {
    it('tabela de XP do PHB', () => {
      expect(XP_THRESHOLDS[1]).to.equal(0);
      expect(XP_THRESHOLDS[2]).to.equal(300);
      expect(XP_THRESHOLDS[20]).to.equal(355000);
      for (const level of LEVELS.slice(1))
        expect(XP_THRESHOLDS[level]).to.be.above(XP_THRESHOLDS[level - 1]);
    });

    it('xpNeededForLevel devolve o XP do próximo nível, null no 20', () => {
      expect(xpNeededForLevel(1)).to.equal(300);
      expect(xpNeededForLevel(19)).to.equal(355000);
      expect(xpNeededForLevel(20)).to.be.null();
    });

    it('Segredos Mágicos só pro Bardo nos níveis 10/14/18', () => {
      expect([9, 10, 14, 18, 19].map(l => hasArcaneSecretsChoice(2, l))).to.eql(
        [false, true, true, true, false],
      );
      expect(hasArcaneSecretsChoice(9, 10)).to.be.false();
    });
  });

  describe('talentos', () => {
    it('chave igual ao id_feat em todo o catálogo', () => {
      for (const [key, feat] of Object.entries(FEATS))
        expect(feat.id_feat).to.equal(key);
    });

    it('bônus mecânicos: Vigoroso +2 PV/nível, Alerta +5 iniciativa, Observador +5 percepção passiva', () => {
      expect(FEATS.duro.hpBonusPerLevel).to.equal(2);
      expect(FEATS.alerta.initiativeBonus).to.equal(5);
      expect(FEATS.observador.passivePerceptionBonus).to.equal(5);
    });
  });
});
