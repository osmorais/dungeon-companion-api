import {expect} from '@loopback/testlab';
import {
  applyStats,
  keptD20,
  manualHpStats,
  RANKING_CATEGORIES,
  RANKING_STATS,
  rollStats,
} from '../../../services/ranking-stats';

describe('ranking-stats', () => {
  const d20 = (rolls: number[], advantage_state = 'normal' as const) => ({
    roll_type: 'attack' as const,
    dice_notation: '1d20',
    rolls,
    advantage_state,
  });

  describe('keptD20', () => {
    it('vantagem fica com o maior, desvantagem com o menor', () => {
      expect(keptD20({...d20([3, 17]), advantage_state: 'advantage'})).to.equal(
        17,
      );
      expect(
        keptD20({...d20([3, 17]), advantage_state: 'disadvantage'}),
      ).to.equal(3);
      expect(keptD20(d20([11]))).to.equal(11);
    });

    it('dano, cura e outros dados não são d20', () => {
      expect(keptD20({...d20([6]), roll_type: 'damage'})).to.be.null();
      expect(keptD20({...d20([6]), dice_notation: '2d6'})).to.be.null();
      expect(keptD20({...d20([20]), dice_notation: '1d20 + 1d4'})).to.be.null();
      expect(keptD20({...d20([15]), dice_notation: '1d20+5'})).to.equal(15);
    });
  });

  it('rollStats: conta rolagem, d20, 20 e 1 naturais', () => {
    expect(rollStats({...d20([20]), total: 25})).to.eql({
      rolls_count: 1,
      d20_count: 1,
      d20_sum: 20,
      nat20: 1,
    });
    expect(rollStats({...d20([1]), total: 4})).to.eql({
      rolls_count: 1,
      d20_count: 1,
      d20_sum: 1,
      nat1: 1,
    });
  });

  it('rollStats: dano e cura contam na rolagem, mesmo sem aplicar', () => {
    const dmg = {
      ...d20([4, 6]),
      roll_type: 'damage' as const,
      dice_notation: '2d6',
      total: 13,
    };
    expect(rollStats(dmg)).to.eql({
      rolls_count: 1,
      damage_dealt: 13,
      biggest_hit: 13,
    });
    const heal = {
      ...d20([5]),
      roll_type: 'heal' as const,
      dice_notation: '1d8',
      total: 8,
    };
    expect(rollStats(heal)).to.eql({rolls_count: 1, healing_done: 8});
    expect(rollStats({...dmg, total: 0})).to.eql({rolls_count: 1});
  });

  describe('applyStats', () => {
    it('aplicar o golpe final num monstro conta monstro derrotado (o dano já contou na rolagem)', () => {
      const {actor, target} = applyStats({
        kind: 'damage',
        targetKind: 'monster',
        before: {current: 8, temp: 0},
        after: {current: 0, temp: 0},
      });
      expect(actor).to.eql({monsters_defeated: 1});
      expect(target).to.eql({});
    });

    it('bater em monstro já caído ou em NPC não conta derrota', () => {
      const caido = applyStats({
        kind: 'damage',
        targetKind: 'monster',
        before: {current: 0, temp: 0},
        after: {current: 0, temp: 0},
      });
      expect(caido.actor).to.eql({});
      const npc = applyStats({
        kind: 'damage',
        targetKind: 'npc',
        before: {current: 5, temp: 0},
        after: {current: 0, temp: 0},
      });
      expect(npc.actor).to.eql({});
    });

    it('dano em jogador: temporários também contam como dano sofrido', () => {
      const {actor, target} = applyStats({
        kind: 'damage',
        targetKind: 'player',
        before: {current: 10, temp: 4},
        after: {current: 8, temp: 0},
      });
      expect(actor).to.eql({});
      expect(target).to.eql({damage_taken: 6});
    });

    it('aplicar cura não soma de novo (já contou na rolagem)', () => {
      const {actor} = applyStats({
        kind: 'heal',
        targetKind: 'player',
        before: {current: 25, temp: 0},
        after: {current: 30, temp: 0},
      });
      expect(actor).to.eql({});
    });
  });

  it('manualHpStats: queda é dano sofrido; chegar a 0 conta queda; subir não conta', () => {
    expect(manualHpStats({current: 10, temp: 0}, {current: 0, temp: 0})).to.eql(
      {
        damage_taken: 10,
        knockouts: 1,
      },
    );
    expect(manualHpStats({current: 5, temp: 0}, {current: 9, temp: 0})).to.eql(
      {},
    );
  });

  it('categorias só usam colunas que existem', () => {
    const keys = new Set(RANKING_CATEGORIES.map(c => c.key));
    expect(keys.size).to.equal(RANKING_CATEGORIES.length);
    for (const def of RANKING_CATEGORIES) {
      const cols = [
        ...`${def.value} ${def.where ?? ''}`.matchAll(/s\.(\w+)/g),
      ].map(m => m[1]);
      for (const col of cols)
        expect(RANKING_STATS as readonly string[]).to.containEql(col);
    }
  });
});
