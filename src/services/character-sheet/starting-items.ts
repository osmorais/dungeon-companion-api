import {resolveBackground, resolveClass} from './calculator';

/**
 * Equipamento inicial da classe e do antecedente (`startingEquipment` / `startingItems`, texto do
 * livro) traduzido pros itens do catálogo `item` — é o que entra no inventário da sessão
 * (`player_inventory_item`) quando o personagem entra numa sessão. Cada nome do livro vira zero
 * ou mais itens com quantidade:
 * - pacotes (Aventureiro, Explorador, Diplomata, Padre, Estudioso) são abertos no conteúdo;
 * - armas, armaduras e escudos ficam de fora (`[]`): vêm das escolhas do wizard e ficam na ficha;
 *   munição que acompanha a arma ("Arco Curto com 20 flechas") entra como item;
 * - dinheiro ("Bolsa com 15 po") fica de fora: já é somado ao PO na criação.
 * Todo nome do livro precisa estar aqui e todo item de destino precisa existir no catálogo
 * (teste de integridade em `starting-items.unit.ts`, que lê o seed `database_inserts.sql`).
 */
export type StartingItem = {item: string; qty: number};

const one = (item: string, qty = 1): StartingItem => ({item, qty});

const DUNGEONEER_PACK = [
  one('Mochila'),
  one('Pé de cabra'),
  one('Martelo'),
  one('Píton', 10),
  one('Tocha', 10),
  one('Caixa de Fogo'),
  one('Rações de viagem (1 dia)', 10),
  one('Cantil'),
  one('Corda de cânhamo (15 metros)'),
];
const EXPLORER_PACK = [
  one('Mochila'),
  one('Saco de dormir'),
  one('Kit para Refeição'),
  one('Caixa de Fogo'),
  one('Tocha', 10),
  one('Rações de viagem (1 dia)', 10),
  one('Cantil'),
  one('Corda de cânhamo (15 metros)'),
];
const DIPLOMAT_PACK = [
  one('Baú'),
  one('Porta mapas ou pergaminhos', 2),
  one('Roupas finas'),
  one('Tinta (frasco de 30ml)'),
  one('Caneta tinteiro'),
  one('Lâmpada'),
  one('Óleo (frasco)', 2),
  one('Papel (uma folha)', 5),
  one('Perfume (frasco)'),
  one('Cera de Lacre'),
  one('Sabão'),
];
const PRIEST_PACK = [
  one('Mochila'),
  one('Cobertor de inverno'),
  one('Vela', 10),
  one('Caixa de Fogo'),
  one('Caixa de esmolas'),
  one('Incenso (vareta)', 2),
  one('Incensário'),
  one('Robes'),
  one('Rações de viagem (1 dia)', 2),
  one('Cantil'),
];
const SCHOLAR_PACK = [
  one('Mochila'),
  one('Livro'),
  one('Tinta (frasco de 30ml)'),
  one('Caneta tinteiro'),
  one('Pergaminho (uma folha)', 10),
  one('Saquinho de areia'),
  one('Faca pequena'),
];

export const STARTING_ITEM_MAP: Record<string, StartingItem[]> = {
  // Pacotes
  'Pacote de Aventureiro': DUNGEONEER_PACK,
  'Pacote do Aventureiro': DUNGEONEER_PACK,
  'Pacote do Explorador': EXPLORER_PACK,
  'Pacote do Diplomata': DIPLOMAT_PACK,
  'Pacote do Padre': PRIEST_PACK,
  'Pacote do Estudioso': SCHOLAR_PACK,
  'Pacote de Estudioso': SCHOLAR_PACK,

  // Armas e armaduras (vêm do wizard) — só a munição entra
  'Machado Grande': [],
  'Dois Machados de Mão': [],
  'Quatro Azagaias': [],
  Rapieira: [],
  Bastão: [],
  Bordão: [],
  Maça: [],
  Cimitarra: [],
  'Espada Longa': [],
  'Espada Curta': [],
  'Duas Espadas Curtas': [],
  'Duas Adagas': [],
  'Dez Dardos': [],
  'Clava (malagueta)': [],
  'Besta Leve com 20 virotes': [one('Munição: Virotes (20)')],
  'Arco Curto com 20 flechas': [one('Munição: Flechas (20)')],
  'Arco Longo com 20 flechas': [one('Munição: Flechas (20)')],
  'Couro Batido': [],
  'Cota de Malha': [],
  'Cota de Escamas': [],
  Escudo: [],
  'Escudo de Madeira': [],

  // Dinheiro (já somado ao PO na criação)
  'Bolsa com 10 po': [],
  'Bolsa com 15 po': [],
  'Bolsa com 25 po': [],
  '5 po': [],

  // Focos, ferramentas e kits
  'Foco Arcano': [one('Foco arcano: Cristal')],
  'Foco Arcano (Varinha)': [one('Foco arcano: Varinha')],
  'Símbolo Sagrado': [one('Símbolo sagrado: Amuleto')],
  Grimório: [one('Grimório')],
  'Instrumento Musical': [one('Instrumento musical')],
  'Instrumento musical': [one('Instrumento musical')],
  'Ferramentas de Ladrão': [one('Ferramentas de ladrão')],
  'Ferramentas de artesão': [one('Ferramentas de artesão')],
  'Ferramentas de Artesão': [one('Ferramentas de artesão')],
  'Kit de Disfarce': [one('Kit de disfarce')],
  'Ferramentas de Trapaça': [one('Ferramentas de trapaça')],
  'Kit de herbalismo': [one('Kit de herbalismo')],
  'Tinteiro e Pena': [one('Tinta (frasco de 30ml)'), one('Caneta tinteiro')],
  'Vidro de tinta': [one('Tinta (frasco de 30ml)')],
  Pena: [one('Caneta tinteiro')],

  // Roupas
  'Roupas comuns': [one('Roupas comuns')],
  'Roupas Comuns': [one('Roupas comuns')],
  'Roupas Escuras com Capuz': [one('Roupas comuns')],
  'Roupas de viajante': [one('Roupas de viajante')],
  'Roupas Finas': [one('Roupas finas')],
  Traje: [one('Roupas de entretenimento')],
  Vestimentas: [one('Robes')],

  // Equipamento de aventura
  'Pé de Cabra': [one('Pé de cabra')],
  'Cobertor de inverno': [one('Cobertor de inverno')],
  'Armadilha de caça': [one('Armadilha de caça')],
  Pá: [one('Pá')],
  'Pote de Ferro': [one('Panela de ferro')],
  '15m de corda de seda': [one('Corda de seda (15 metros)')],
  'Estojo de pergaminho': [one('Porta mapas ou pergaminhos')],
  'Anel de Sinete': [one('Sinete')],

  // Lembranças do antecedente
  'Livro de Preces': [one('Livro de orações')],
  'Incenso (5 varetas)': [one('Incenso (vareta)', 5)],
  'Carta de apresentação': [one('Carta de apresentação')],
  'Presente de admirador': [one('Presente de admirador')],
  'Troféu de animal': [one('Troféu de animal')],
  'Amuleto da sorte': [one('Amuleto da sorte')],
  'Pergaminho de Linhagem': [one('Pergaminho de linhagem')],
  'Faca pequena': [one('Faca pequena')],
  'Faca Pequena': [one('Faca pequena')],
  'Mapa da cidade natal': [one('Mapa da cidade natal')],
  'Rato de estimação': [one('Rato de estimação')],
  'Carta de Colega': [one('Carta de um colega')],
  'Insígnia de Patente': [one('Insígnia de patente')],
  'Troféu de Inimigo': [one('Troféu de inimigo')],
  'Dados de osso ou baralho': [one('Jogo de dados ou baralho')],
};

/**
 * Armas do equipamento inicial (nome do livro → arma da tabela `weapon`) — entram na ficha
 * (`character_weapon`) na criação, junto com as que o jogador marcou no wizard, sem repetir.
 * Quantidade não importa na ficha ("Quatro Azagaias" vira uma linha de Azagaia).
 */
export const STARTING_WEAPON_MAP: Record<string, string> = {
  'Machado Grande': 'Machado Grande',
  'Dois Machados de Mão': 'Machadinha',
  'Quatro Azagaias': 'Azagaia',
  Rapieira: 'Rapieira',
  'Besta Leve com 20 virotes': 'Besta Leve',
  Bastão: 'Bordão',
  Bordão: 'Bordão',
  Maça: 'Maça',
  Cimitarra: 'Cimitarra',
  'Espada Longa': 'Espada Longa',
  'Espada Curta': 'Espada Curta',
  'Duas Espadas Curtas': 'Espada Curta',
  'Duas Adagas': 'Adaga',
  'Dez Dardos': 'Dardo',
  'Arco Curto com 20 flechas': 'Arco Curto',
  'Arco Longo com 20 flechas': 'Arco Longo',
  'Clava (malagueta)': 'Porrete',
};

/** Nomes (tabela `weapon`) das armas do kit da classe e do antecedente, sem repetir. */
export function startingWeaponNames(
  idClass: number,
  idBackground: number | null,
): string[] {
  const names = [
    ...resolveClass(idClass).startingEquipment,
    ...(idBackground ? resolveBackground(idBackground).startingItems : []),
  ];
  return kitWeapons(names);
}

/** Armas (tabela `weapon`) de uma lista de equipamento do livro, sem repetir. */
export function kitWeapons(equipmentNames: string[]): string[] {
  return [
    ...new Set(
      equipmentNames.flatMap(n =>
        STARTING_WEAPON_MAP[n] ? [STARTING_WEAPON_MAP[n]] : [],
      ),
    ),
  ];
}

/** Itens do catálogo (somados por nome) que o personagem recebe ao entrar numa sessão. */
export function startingInventory(
  idClass: number,
  idBackground: number | null,
): StartingItem[] {
  const names = [
    ...resolveClass(idClass).startingEquipment,
    ...(idBackground ? resolveBackground(idBackground).startingItems : []),
  ];
  const totals = new Map<string, number>();
  for (const name of names) {
    for (const {item, qty} of STARTING_ITEM_MAP[name] ?? []) {
      totals.set(item, (totals.get(item) ?? 0) + qty);
    }
  }
  return [...totals].map(([item, qty]) => ({item, qty}));
}
