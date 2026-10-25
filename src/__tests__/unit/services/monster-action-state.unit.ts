/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {
  applyActionOp,
  emptyActionState,
  legendaryCount,
  MonsterActionState,
  normalizeActionState,
  parseActionOp,
  startOfMonsterTurn,
} from '../../../services/monster-action-state';

/** Ficha no formato do bestiário com uma habilidade de cada tipo de uso. */
const DRAGAO = {
  name: 'Dragão',
  special_abilities: [
    {name: 'Resistência Lendária', usage: {type: 'per_day', times: 3}},
  ],
  actions: [
    {name: 'Mordida', usage: null},
    {name: 'Sopro de Fogo', usage: {type: 'recharge', min: 5}},
    {name: 'Forma Assustadora', usage: {type: 'rest', rest: 'curto ou longo'}},
  ],
  reactions: [{name: 'Aparar', usage: null}],
  legendary_count: 3,
  legendary_actions: [
    {name: 'Detectar', usage: null},
    {name: 'Ataque de Asa', usage: {type: 'cost', actions: 2}},
  ],
};

function apply(
  state: MonsterActionState,
  op: Parameters<typeof applyActionOp>[2],
) {
  const result = applyActionOp(DRAGAO, state, op);
  if ('error' in result) throw new Error(result.error);
  return result.state;
}

function error(
  state: MonsterActionState,
  op: Parameters<typeof applyActionOp>[2],
) {
  const result = applyActionOp(DRAGAO, state, op);
  return 'error' in result ? result.error : null;
}

describe('usos das ações do monstro', () => {
  it('estado gravado vazio ou de versão antiga vira o estado completo', () => {
    expect(normalizeActionState(null)).to.eql(emptyActionState());
    expect(
      normalizeActionState({uses: {Sopro: 2, Ruim: 'x'}, recharge: ['A', 3]}),
    ).to.eql({...emptyActionState(), uses: {Sopro: 2}, recharge: ['A']});
  });

  it('por dia: gasta até o limite e depois recusa', () => {
    let s = emptyActionState();
    for (let i = 0; i < 3; i++)
      s = apply(s, {op: 'use', ability: 'Resistência Lendária'});
    expect(s.uses['Resistência Lendária']).to.equal(3);
    expect(error(s, {op: 'use', ability: 'Resistência Lendária'})).to.match(
      /3x/,
    );
  });

  it('por descanso vale 1 uso; restaurar devolve', () => {
    let s = apply(emptyActionState(), {
      op: 'use',
      ability: 'Forma Assustadora',
    });
    expect(error(s, {op: 'use', ability: 'Forma Assustadora'})).to.match(/1x/);
    s = apply(s, {op: 'restore', ability: 'Forma Assustadora'});
    expect(s.uses).to.eql({});
  });

  it('recarga: gasta e fica indisponível até recarregar', () => {
    const s = apply(emptyActionState(), {op: 'use', ability: 'Sopro de Fogo'});
    expect(s.recharge).to.eql(['Sopro de Fogo']);
    expect(error(s, {op: 'use', ability: 'Sopro de Fogo'})).to.match(
      /não recarregou/,
    );
  });

  it('sem limite ou fora da ficha: erro', () => {
    expect(error(emptyActionState(), {op: 'use', ability: 'Mordida'})).to.match(
      /não tem limite/,
    );
    expect(error(emptyActionState(), {op: 'use', ability: 'Nada'})).to.match(
      /não está na ficha/,
    );
  });

  it('lendárias: custo da ficha (padrão 1) até o total por rodada', () => {
    let s = apply(emptyActionState(), {
      op: 'legendary',
      ability: 'Ataque de Asa',
    });
    expect(s.legendary_used).to.equal(2);
    s = apply(s, {op: 'legendary', ability: 'Detectar'});
    expect(s.legendary_used).to.equal(3);
    expect(error(s, {op: 'legendary', ability: 'Detectar'})).to.match(
      /Restam 0/,
    );
    expect(
      error(emptyActionState(), {op: 'legendary', ability: 'Mordida'}),
    ).to.match(/não está na ficha/);
  });

  it('reação: uma por rodada; covil liga e desliga', () => {
    const s = apply(emptyActionState(), {op: 'reaction'});
    expect(s.reaction_used).to.be.true();
    expect(error(s, {op: 'reaction'})).to.match(/já foi usada/);
    expect(apply(s, {op: 'lair', on: true}).in_lair).to.be.true();
  });

  it('descanso zera tudo, menos o covil', () => {
    const gasto: MonsterActionState = {
      uses: {'Resistência Lendária': 2},
      recharge: ['Sopro de Fogo'],
      legendary_used: 2,
      reaction_used: true,
      in_lair: true,
    };
    expect(apply(gasto, {op: 'rest'})).to.eql({
      ...emptyActionState(),
      in_lair: true,
    });
  });

  it('início do turno: d6 de recarga (5–6 recarrega) e devolve lendárias e reação', () => {
    const gasto: MonsterActionState = {
      ...emptyActionState(),
      recharge: ['Sopro de Fogo'],
      legendary_used: 3,
      reaction_used: true,
    };
    const falhou = startOfMonsterTurn(DRAGAO, gasto, () => 4);
    expect(falhou.rolls).to.eql([
      {ability: 'Sopro de Fogo', roll: 4, min: 5, recharged: false},
    ]);
    expect(falhou.state).to.eql({
      ...emptyActionState(),
      recharge: ['Sopro de Fogo'],
    });
    const recarregou = startOfMonsterTurn(DRAGAO, gasto, () => 5);
    expect(recarregou.state.recharge).to.eql([]);
  });

  it('total de lendárias: o da ficha, ou 3; sem lendárias, 0', () => {
    expect(legendaryCount(DRAGAO)).to.equal(3);
    expect(legendaryCount({...DRAGAO, legendary_count: null})).to.equal(3);
    expect(legendaryCount({actions: []})).to.equal(0);
  });

  it('corpo da requisição: só operações conhecidas e bem formadas', () => {
    expect(parseActionOp({op: 'use', ability: 'Sopro'})).to.eql({
      op: 'use',
      ability: 'Sopro',
    });
    expect(parseActionOp({op: 'lair', on: true})).to.eql({
      op: 'lair',
      on: true,
    });
    expect(parseActionOp({op: 'rest'})).to.eql({op: 'rest'});
    expect(parseActionOp({op: 'use'})).to.be.null();
    expect(parseActionOp({op: 'lair', on: 'sim'})).to.be.null();
    expect(parseActionOp({op: 'apagar'})).to.be.null();
    expect(parseActionOp(null)).to.be.null();
  });
});
