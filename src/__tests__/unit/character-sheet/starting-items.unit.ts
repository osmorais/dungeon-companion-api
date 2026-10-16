/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from '@loopback/testlab';
import {readFileSync} from 'fs';
import {join} from 'path';
import {
  STARTING_ITEM_MAP,
  startingInventory,
} from '../../../services/character-sheet/starting-items';
import {BACKGROUNDS, CLASSES} from '../../../services/character-sheet/rules';

/** Nomes da tabela `item` no seed (fonte de verdade do catálogo, igual a produção). */
function catalogNames(): Set<string> {
  const seed = readFileSync(
    join(process.cwd(), 'docs/database/database_inserts.sql'),
    'utf8',
  );
  const start = seed.search(/INSERT INTO item/i);
  const block = seed.slice(start, start + seed.slice(start).search(/;\r?\n/));
  return new Set(
    [...block.matchAll(/\((\d+), '((?:[^']|'')*)'/g)].map(m =>
      m[2].replace(/''/g, "'"),
    ),
  );
}

describe('starting-items', () => {
  it('todo item inicial de classe e antecedente está mapeado', () => {
    const names = [
      ...Object.values(CLASSES).flatMap(c => c.startingEquipment),
      ...Object.values(BACKGROUNDS).flatMap(b => b.startingItems),
    ];
    const missing = names.filter(n => !(n in STARTING_ITEM_MAP));
    expect(missing).to.eql([]);
  });

  it('todo item de destino existe no catálogo (seed)', () => {
    const catalog = catalogNames();
    const targets = new Set(
      Object.values(STARTING_ITEM_MAP).flatMap(list => list.map(i => i.item)),
    );
    expect([...targets].filter(t => !catalog.has(t))).to.eql([]);
  });

  it('Guerreiro Soldado: pacote aberto, munição da besta, sem armas/armadura/dinheiro', () => {
    const inv = Object.fromEntries(
      startingInventory(7, 13).map(i => [i.item, i.qty]),
    );
    expect(inv).to.eql({
      'Munição: Virotes (20)': 1,
      Mochila: 1,
      'Pé de cabra': 1,
      Martelo: 1,
      Píton: 10,
      Tocha: 10,
      'Caixa de Fogo': 1,
      'Rações de viagem (1 dia)': 10,
      Cantil: 1,
      'Corda de cânhamo (15 metros)': 1,
      'Insígnia de patente': 1,
      'Troféu de inimigo': 1,
      'Jogo de dados ou baralho': 1,
    });
  });

  it('quantidades se somam entre classe e antecedente (Mago Sábio: tinta e pena)', () => {
    const inv = Object.fromEntries(
      startingInventory(9, 12).map(i => [i.item, i.qty]),
    );
    // Pacote do Estudioso (1) + "Tinteiro e Pena" (1) + Sábio "Vidro de tinta" (1)
    expect(inv['Tinta (frasco de 30ml)']).to.equal(3);
    expect(inv['Caneta tinteiro']).to.equal(3);
    expect(inv['Faca pequena']).to.equal(2); // pacote + Sábio
    expect(inv['Grimório']).to.equal(1);
    expect(inv['Foco arcano: Varinha']).to.equal(1);
  });

  it('Clérigo Acólito: Pacote do Padre + incenso somado; sem antecedente só a classe', () => {
    const inv = Object.fromEntries(
      startingInventory(4, 1).map(i => [i.item, i.qty]),
    );
    expect(inv['Incenso (vareta)']).to.equal(2 + 5);
    expect(inv['Robes']).to.equal(2); // pacote + Vestimentas
    expect(inv['Símbolo sagrado: Amuleto']).to.equal(1);
    expect(
      startingInventory(4, null).some(i => i.item === 'Livro de orações'),
    ).to.be.false();
  });
});
