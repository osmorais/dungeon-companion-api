/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  buildSpellRoll,
  cantripTier,
  resolveSpellRollAtSlot,
  SPELL_MECHANICS,
} from '../../../services/character-sheet/spell-mechanics';

describe('spell-mechanics', () => {
  describe('integridade do catálogo', () => {
    it('ataque sempre tem tipo de ataque; acerto automático nunca tem', () => {
      for (const m of Object.values(SPELL_MECHANICS)) {
        if (m.kind === 'attack') {
          expect(['melee', 'ranged']).to.containEql(m.attack);
        } else {
          expect(m.attack).to.be.undefined();
        }
      }
    });

    it('dados, escalas e rótulos válidos', () => {
      for (const m of Object.values(SPELL_MECHANICS)) {
        if (!m.damage) continue;
        expect(m.damage.count).to.be.above(0);
        expect([4, 6, 8, 10, 12]).to.containEql(m.damage.sides);
        expect(m.damage.type).to.not.be.empty();
        if (m.instances) {
          expect(m.instances.base).to.be.above(0);
          expect(m.instances.label).to.not.be.empty();
        }
        expect(m.cantripScaling && m.upcast).to.not.be.ok(); // truque escala por nível, não por círculo
      }
    });

    it('ataque e automático sempre têm dano; resistência tem atributo, e "passou" só com dano', () => {
      for (const m of Object.values(SPELL_MECHANICS)) {
        if (m.kind !== 'save') {
          expect({name: m.name, damage: !!m.damage, save: !!m.save}).to.eql({
            name: m.name,
            damage: true,
            save: false,
          });
          continue;
        }
        expect(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']).to.containEql(
          m.save!.ability,
        );
        expect({name: m.name, onSuccess: !!m.save!.onSuccess}).to.eql({
          name: m.name,
          onSuccess: !!m.damage,
        });
      }
    });

    it('fora do catálogo: Contato Extraplanar (CD fixa) e as que somam dano no ataque com arma', () => {
      for (const id of [87, 118, 119, 120, 121, 122, 163, 174, 318]) {
        expect(SPELL_MECHANICS[id]).to.be.undefined();
      }
    });

    it('nomes únicos', () => {
      const names = Object.values(SPELL_MECHANICS).map(m => m.name);
      expect(new Set(names).size).to.equal(names.length);
    });
  });

  describe('cálculo da rolagem', () => {
    it('truque: dados ×1/×2/×3/×4 nos níveis 1/5/11/17', () => {
      expect([1, 4, 5, 10, 11, 16, 17, 20].map(cantripTier)).to.eql([
        1, 1, 2, 2, 3, 3, 4, 4,
      ]);
      const fireBolt = SPELL_MECHANICS[287];
      expect(resolveSpellRollAtSlot(fireBolt, 0, 0, 1, 3)).to.eql({
        instances: 1,
        dice_count: 1,
        dice_sides: 10,
        modifier: 0,
        extra_dice: [],
      });
      expect(
        resolveSpellRollAtSlot(fireBolt, 0, 0, 11, 3)!.dice_count,
      ).to.equal(3);
    });

    it('Rajada Mística: mais feixes pelo nível, 1d10 cada', () => {
      const eldritch = SPELL_MECHANICS[294];
      expect(
        [1, 5, 11, 17].map(lvl =>
          resolveSpellRollAtSlot(eldritch, 0, 0, lvl, 3),
        ),
      ).to.eql(
        [1, 2, 3, 4].map(instances => ({
          instances,
          dice_count: 1,
          dice_sides: 10,
          modifier: 0,
          extra_dice: [],
        })),
      );
    });

    it('"Em Níveis Superiores": +1 dado por círculo acima do base', () => {
      const orb = SPELL_MECHANICS[246];
      expect(
        [1, 2, 5].map(
          slot => resolveSpellRollAtSlot(orb, 1, slot, 3, 0)!.dice_count,
        ),
      ).to.eql([3, 4, 7]);
    });

    it('Arma Espiritual: +1d8 a cada 2 círculos e soma o modificador de conjuração', () => {
      const weapon = SPELL_MECHANICS[23];
      expect(
        [2, 3, 4, 6].map(slot => resolveSpellRollAtSlot(weapon, 2, slot, 3, 4)),
      ).to.eql(
        [1, 1, 2, 3].map(dice_count => ({
          instances: 1,
          dice_count,
          dice_sides: 8,
          modifier: 4,
          extra_dice: [],
        })),
      );
    });

    it('Raio Ardente: 3 raios de 2d6, +1 raio por círculo acima do 2º', () => {
      const ray = SPELL_MECHANICS[285];
      expect(resolveSpellRollAtSlot(ray, 2, 2, 3, 0)).to.eql({
        instances: 3,
        dice_count: 2,
        dice_sides: 6,
        modifier: 0,
        extra_dice: [],
      });
      expect(resolveSpellRollAtSlot(ray, 2, 4, 7, 0)!.instances).to.equal(5);
    });

    it('Mísseis Mágicos: 3 dardos de 1d4+1, +1 dardo por círculo acima do 1º', () => {
      const missiles = SPELL_MECHANICS[222];
      expect(resolveSpellRollAtSlot(missiles, 1, 1, 1, 3)).to.eql({
        instances: 3,
        dice_count: 1,
        dice_sides: 4,
        modifier: 1,
        extra_dice: [],
      });
      expect(resolveSpellRollAtSlot(missiles, 1, 3, 5, 3)!.instances).to.equal(
        5,
      );
    });

    it('Mão de Bigby (Punho Cerrado): +2d8 por círculo acima do 5º', () => {
      const hand = SPELL_MECHANICS[209];
      expect(
        [5, 6, 9].map(
          slot => resolveSpellRollAtSlot(hand, 5, slot, 9, 0)!.dice_count,
        ),
      ).to.eql([4, 6, 12]);
    });
  });

  describe('resistência', () => {
    it('Bola de Fogo: 8d6, +1d6 por círculo, metade se passar, CD do personagem', () => {
      const roll = buildSpellRoll(44, 3, 5, 3, 6, 14)!;
      expect(roll).to.containDeep({
        kind: 'save',
        attack_bonus: null,
        damage_type: 'fogo',
        save_ability: 'DEX',
        save_dc: 14,
        save_on_success: 'half',
      });
      expect(roll.by_slot['3'].dice_count).to.equal(8);
      expect(roll.by_slot['5'].dice_count).to.equal(10);
    });

    it('truques de resistência escalam pelo nível (Zombaria Viciosa usa Sabedoria, como no livro)', () => {
      const roll = buildSpellRoll(361, 0, 11, 3, 6, 14)!;
      expect(roll).to.containDeep({
        save_ability: 'WIS',
        save_on_success: 'none',
      });
      expect(roll.by_slot['0']).to.containDeep({dice_count: 3, dice_sides: 4});
    });

    it('Onda Troveante escala +1d8 por círculo (livro)', () => {
      expect(
        buildSpellRoll(244, 1, 3, 3, 5, 13)!.by_slot['3'].dice_count,
      ).to.equal(4);
    });

    it('bônus fixo e dados extras: Desintegrar +40, Dedo da Morte +30, Tempestade de Gelo +4d6', () => {
      expect(buildSpellRoll(113, 6, 11, 4, 8, 16)!.by_slot['7']).to.containDeep(
        {
          dice_count: 13,
          modifier: 40,
        },
      );
      expect(
        buildSpellRoll(111, 7, 13, 4, 9, 17)!.by_slot['7'].modifier,
      ).to.equal(30);
      const ice = buildSpellRoll(341, 4, 7, 3, 7, 15)!;
      expect(ice.by_slot['5']).to.containDeep({
        dice_count: 3,
        dice_sides: 8,
        extra_dice: [{count: 4, sides: 6}],
      });
    });

    it('Esquentar Metal e Enfraquecer Intelecto: dano total sempre', () => {
      expect(buildSpellRoll(155, 2, 3, 3, 5, 13)!.save_on_success).to.equal(
        'full',
      );
      expect(buildSpellRoll(142, 8, 15, 4, 9, 17)!.save_on_success).to.equal(
        'full',
      );
    });

    it('sem dano: só CD e atributo, nenhum dado', () => {
      expect(buildSpellRoll(184, 2, 3, 3, 5, 13)).to.eql({
        kind: 'save',
        attack_type: null,
        attack_bonus: null,
        damage_type: null,
        save_ability: 'WIS',
        save_dc: 13,
        save_on_success: null,
        instance_label: null,
        variant: null,
        by_slot: {},
      });
    });
  });

  describe('buildSpellRoll', () => {
    it('truque: só a chave "0", com o bônus de ataque do personagem', () => {
      expect(buildSpellRoll(346, 0, 5, 3, 6, 14)).to.eql({
        kind: 'attack',
        attack_type: 'melee',
        attack_bonus: 6,
        damage_type: 'elétrico',
        save_ability: null,
        save_dc: null,
        save_on_success: null,
        instance_label: null,
        variant: null,
        by_slot: {
          '0': {
            instances: 1,
            dice_count: 2,
            dice_sides: 8,
            modifier: 0,
            extra_dice: [],
          },
        },
      });
    });

    it('magia com círculo: uma entrada por círculo do base ao 9º', () => {
      const roll = buildSpellRoll(185, 1, 3, 2, 4, 12)!;
      expect(Object.keys(roll.by_slot)).to.eql([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
      ]);
      expect(roll.by_slot['9'].dice_count).to.equal(11);
    });

    it('acerto automático não tem bônus de ataque', () => {
      const roll = buildSpellRoll(222, 1, 1, 3, 5, 13)!;
      expect(roll).to.containDeep({
        kind: 'auto',
        attack_type: null,
        attack_bonus: null,
        instance_label: 'dardo',
      });
    });

    it('magia sem mecânica cadastrada', () => {
      expect(buildSpellRoll(999999, 1, 1, 3, 5, 13)).to.be.null();
    });
  });
});
