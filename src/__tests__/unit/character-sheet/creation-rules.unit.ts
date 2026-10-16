/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  CLASS_SKILL_CHOICES,
  RACE_ABILITY_BONUS_CHOICE,
  RACE_EXTRA_SKILL_CHOICES,
  SUBCLASS_HEAVY_ARMOR,
  armorProficiency,
  creationSpellLimits,
  validateAbilityBonusChoice,
  validateArmourChoice,
  validateSkillChoices,
  validateSpellChoices,
} from '../../../services/character-sheet/creation-rules';
import {
  CLASSES,
  SUBCLASSES,
  SUBRACES,
} from '../../../services/character-sheet/rules';
import {normalizeSkill} from '../../../services/character-sheet/calculator';
import {CLASS_SPELL_LISTS} from '../../../services/character-sheet/class-spell-lists';

describe('creation-rules', () => {
  it('toda classe tem cota de perícias; listas só com perícias conhecidas', () => {
    const known = new Set(
      [
        'Atletismo',
        'Acrobacia',
        'Furtividade',
        'Prestidigitação',
        'Arcanismo',
        'História',
        'Investigação',
        'Natureza',
        'Religião',
        'Adestrar Animais',
        'Intuição',
        'Medicina',
        'Percepção',
        'Sobrevivência',
        'Atuação',
        'Enganação',
        'Intimidação',
        'Persuasão',
      ].map(normalizeSkill),
    );
    for (const c of Object.values(CLASSES)) {
      const rule = CLASS_SKILL_CHOICES[c.id_class];
      expect({cls: c.displayName, ok: !!rule && rule.count > 0}).to.eql({
        cls: c.displayName,
        ok: true,
      });
      for (const k of rule.from)
        expect({k, known: known.has(k)}).to.eql({k, known: true});
    }
  });

  it('cota por classe igual à do web (skill-rules.ts / rules-constants.spec.ts)', () => {
    expect(
      Object.fromEntries(
        Object.entries(CLASS_SKILL_CHOICES).map(([id, r]) => [id, r.count]),
      ),
    ).to.eql({
      1: 2,
      2: 3,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      7: 2,
      8: 4,
      9: 2,
      10: 2,
      11: 2,
      12: 3,
    });
    expect(RACE_EXTRA_SKILL_CHOICES).to.eql({6: 2});
    expect(RACE_ABILITY_BONUS_CHOICE).to.eql({
      6: {count: 2, amount: 1, exclude: ['CHA']},
    });
    expect([...SUBCLASS_HEAVY_ARMOR].sort()).to.eql([
      'guerra',
      'natureza',
      'tempestade',
      'vida',
    ]);
  });

  describe('Meio-Elfo: +1 em dois atributos', () => {
    it('aceita dois diferentes (menos CAR)', () => {
      expect(validateAbilityBonusChoice(6, ['STR', 'DEX'])).to.eql([
        'STR',
        'DEX',
      ]);
    });
    it('recusa faltando, repetido, CAR ou atributo inválido', () => {
      expect(() => validateAbilityBonusChoice(6, undefined)).to.throw(
        /2 atributos diferentes/,
      );
      expect(() => validateAbilityBonusChoice(6, ['STR'])).to.throw(
        /2 atributos/,
      );
      expect(() => validateAbilityBonusChoice(6, ['STR', 'STR'])).to.throw(
        /diferentes/,
      );
      expect(() => validateAbilityBonusChoice(6, ['STR', 'CHA'])).to.throw(
        /inválido/,
      );
      expect(() =>
        validateAbilityBonusChoice(6, ['STR', 'XYZ' as never]),
      ).to.throw(/inválido/);
    });
    it('outra raça não escolhe', () => {
      expect(validateAbilityBonusChoice(9, undefined)).to.eql([]);
      expect(() => validateAbilityBonusChoice(9, ['STR', 'DEX'])).to.throw(
        /não escolhe/,
      );
    });
  });

  describe('perícias', () => {
    it('dentro da cota e da lista da classe', () => {
      validateSkillChoices(1, 9, ['athletics', 'survival']);
      validateSkillChoices(1, 9, ['athletics']); // a menos é aceito (o wizard exige o total)
    });
    it('recusa perícias demais, repetidas ou fora da lista', () => {
      expect(() =>
        validateSkillChoices(1, 9, ['athletics', 'survival', 'nature']),
      ).to.throw(/demais/);
      expect(() =>
        validateSkillChoices(1, 9, ['athletics', 'athletics']),
      ).to.throw(/repetida/);
      expect(() =>
        validateSkillChoices(1, 9, ['athletics', 'arcana']),
      ).to.throw(/fora da lista/);
    });
    it('Bardo escolhe 3 quaisquer; Meio-Elfo ganha 2 livres fora da lista', () => {
      validateSkillChoices(2, 9, ['arcana', 'stealth', 'medicine']);
      validateSkillChoices(1, 6, [
        'athletics',
        'survival',
        'arcana',
        'stealth',
      ]);
      expect(() =>
        validateSkillChoices(1, 6, [
          'athletics',
          'arcana',
          'stealth',
          'history',
        ]),
      ).to.throw(/fora da lista/);
      expect(() =>
        validateSkillChoices(1, 6, [
          'athletics',
          'survival',
          'arcana',
          'stealth',
          'nature',
        ]),
      ).to.throw(/demais/);
    });
  });

  describe('magias no nível 1', () => {
    it('cota por classe + truque racial', () => {
      expect(creationSpellLimits(CLASSES[2], 9, null)).to.containDeep({
        cantrips: 2,
        leveled: 4,
        maxCircle: 1,
      }); // Bardo
      expect(creationSpellLimits(CLASSES[9], 9, null)).to.containDeep({
        cantrips: 3,
        leveled: 6,
        maxCircle: 1,
      }); // Mago
      expect(creationSpellLimits(CLASSES[4], 9, null)).to.containDeep({
        cantrips: 3,
        leveled: 0,
        maxCircle: 1,
      }); // Clérigo
      expect(creationSpellLimits(CLASSES[7], 9, null)).to.containDeep({
        cantrips: 0,
        leveled: 0,
        maxCircle: 1,
      }); // Guerreiro
      expect(creationSpellLimits(CLASSES[7], 8, null).cantrips).to.equal(1); // Tiefling
      expect(creationSpellLimits(CLASSES[9], 2, 'alto-elfo').cantrips).to.equal(
        4,
      );
      expect(
        creationSpellLimits(CLASSES[7], 5, 'gnomo-das-florestas').cantrips,
      ).to.equal(1);
    });
    const limits = {
      cantrips: 1,
      leveled: 1,
      maxCircle: 1,
      classList: [1, 2, 3, 4, 5],
      racial: null,
    };
    it('lista da classe: Guerreiro não conjura (lista vazia); Bardo usa a lista dele', () => {
      expect(creationSpellLimits(CLASSES[7], 9, null).classList).to.eql([]);
      expect(creationSpellLimits(CLASSES[2], 9, null).classList).to.equal(
        CLASS_SPELL_LISTS[2],
      );
    });
    it('magia fora da lista da classe é recusada; só o truque racial passa', () => {
      const bard = {...limits, classList: [9001, 9002]};
      expect(() =>
        validateSpellChoices(bard, [{id_spell: 99, spell_level: 0}], [99]),
      ).to.throw(/fora da lista/);
      const tiefling = {...bard, cantrips: 2, racial: {fixedSpellId: 333}};
      validateSpellChoices(
        tiefling,
        [
          {id_spell: 9001, spell_level: 0},
          {id_spell: 333, spell_level: 0},
        ],
        [9001, 333],
      );
      expect(() =>
        validateSpellChoices(
          tiefling,
          [
            {id_spell: 333, spell_level: 0},
            {id_spell: 99, spell_level: 0},
          ],
          [333, 99],
        ),
      ).to.throw(/fora da lista/);
      // Alto Elfo: qualquer truque de mago, mas não magia de círculo nem truque de outra lista
      const highElf = {...bard, cantrips: 1, racial: {spellListClassId: 9}};
      const wizardCantrip = CLASS_SPELL_LISTS[9][0];
      validateSpellChoices(
        highElf,
        [{id_spell: wizardCantrip, spell_level: 0}],
        [wizardCantrip],
      );
      expect(() =>
        validateSpellChoices(
          highElf,
          [{id_spell: wizardCantrip, spell_level: 1}],
          [wizardCantrip],
        ),
      ).to.throw(/fora da lista/);
    });
    it('listas iguais às do web (contagem e soma dos ids por classe)', () => {
      const summary = Object.fromEntries(
        Object.entries(CLASS_SPELL_LISTS).map(([id, ids]) => [
          id,
          [ids.length, ids.reduce((a, b) => a + b, 0)],
        ]),
      );
      expect(summary).to.eql({
        2: [107, 20563],
        3: [69, 13877],
        4: [113, 20889],
        5: [114, 20970],
        6: [120, 24446],
        9: [196, 38604],
        11: [55, 8461],
        12: [45, 7674],
      });
      for (const ids of Object.values(CLASS_SPELL_LISTS)) {
        expect(new Set(ids).size).to.equal(ids.length);
      }
    });
    it('aceita dentro da cota', () => {
      validateSpellChoices(
        limits,
        [
          {id_spell: 1, spell_level: 0},
          {id_spell: 2, spell_level: 1},
        ],
        [1, 2],
      );
    });
    it('recusa inexistente, repetida, círculo alto e cota estourada', () => {
      expect(() => validateSpellChoices(limits, [], [1])).to.throw(
        /inexistente/,
      );
      expect(() =>
        validateSpellChoices(limits, [{id_spell: 1, spell_level: 0}], [1, 1]),
      ).to.throw(/repetida/);
      expect(() =>
        validateSpellChoices(limits, [{id_spell: 3, spell_level: 3}], [3]),
      ).to.throw(/círculo/);
      expect(() =>
        validateSpellChoices(
          limits,
          [
            {id_spell: 1, spell_level: 0},
            {id_spell: 4, spell_level: 0},
          ],
          [1, 4],
        ),
      ).to.throw(/Truques demais/);
      expect(() =>
        validateSpellChoices(
          limits,
          [
            {id_spell: 2, spell_level: 1},
            {id_spell: 5, spell_level: 1},
          ],
          [2, 5],
        ),
      ).to.throw(/Magias demais/);
    });
  });

  describe('armadura', () => {
    it('proficiências da classe, da sub-raça e do domínio', () => {
      const wizard = armorProficiency(CLASSES[9], null, null);
      expect([...wizard.types]).to.eql([]);
      expect(wizard.shield).to.be.false();
      const fighter = armorProficiency(CLASSES[7], null, null);
      expect([...fighter.types].sort()).to.eql(['Leve', 'Média', 'Pesada']);
      expect(fighter.shield).to.be.true();
      const druid = armorProficiency(CLASSES[5], null, null); // "(não-metal)" conta como a categoria
      expect([...druid.types].sort()).to.eql(['Leve', 'Média']);
      expect(druid.shield).to.be.true();
      const mountainDwarfWizard = armorProficiency(
        CLASSES[9],
        SUBRACES['anao-da-montanha'],
        null,
      );
      expect([...mountainDwarfWizard.types].sort()).to.eql(['Leve', 'Média']);
      const lifeCleric = armorProficiency(CLASSES[4], null, 'vida');
      expect(lifeCleric.types.has('Pesada')).to.be.true();
      expect(
        armorProficiency(CLASSES[4], null, 'luz').types.has('Pesada'),
      ).to.be.false();
    });
    it('domínios com armadura pesada existem nas subclasses do Clérigo', () => {
      const ids = SUBCLASSES[4].map(s => s.id_subclass);
      for (const id of ['guerra', 'natureza', 'tempestade', 'vida'])
        expect(ids).to.containEql(id);
    });
    it('recusa armadura ou escudo sem proficiência', () => {
      const rogue = armorProficiency(CLASSES[8], null, null);
      validateArmourChoice(rogue, 'Armadura Leve', false);
      validateArmourChoice(rogue, null, false);
      expect(() =>
        validateArmourChoice(rogue, 'Armadura Média', false),
      ).to.throw(/Armadura Média/);
      expect(() => validateArmourChoice(rogue, null, true)).to.throw(/escudo/);
    });
  });
});
