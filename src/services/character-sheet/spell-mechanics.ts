/* eslint-disable @typescript-eslint/naming-convention */
import {SpellRoll} from '../../models/character-options-types';
import {StatKeyEn} from '../../models/character-sheet-types';

/**
 * Mecânica de rolagem das magias — o que o modal de rolagem precisa pra lançar a magia sem o
 * jogador montar os dados na mão (ver `docs/dungeon-companion-magias-mecanicas.md`). A tabela
 * `spell` do banco guarda só o texto; a regra fica aqui, igual a `rules.ts`/`feats.ts`.
 *
 * Fase 1: magias de **ataque mágico** e de **acerto automático**. Fase 2: magias de
 * **resistência** — com dano (o modal mostra a CD e rola o dano) e sem dano (só a CD no anúncio).
 * Fase 3: **cura** (dado + modificador de conjuração; PV temporários na Vitalidade Falsa), com o
 * Discípulo da Vida e a Cura Suprema do Clérigo do Domínio da Vida.
 * Fase 4: magias que **somam dano no ataque** (`kind: 'rider'`) — as Destruições (gastam o espaço
 * no acerto, como a Destruição Divina) e Bruxaria/Marca do Caçador/Manto do Cruzado (lançadas
 * antes; o jogador marca no acerto).
 * Efeitos além do dano imediato (ex.: metade do dano ao errar na Flecha Ácida, cura do Toque
 * Vampírico, dano repetido do Raio de Bruxa, condições) continuam só na descrição — o mestre
 * aplica. Os números seguem o livro (`docs/magias.txt`).
 */
export interface SpellMechanics {
  /** Nome como está na tabela `spell` — só pra leitura e pros testes; a chave é o `id_spell`. */
  name: string;
  kind: 'attack' | 'auto' | 'save' | 'heal' | 'rider';
  /** Só `kind: 'rider'`: quando soma (`next_hit`: só no próximo acerto, gasta o espaço nesse
   *  momento; `each_hit`: em todo acerto enquanto durar) e em que ataque (corpo a corpo com arma,
   *  qualquer arma, ou qualquer ataque — Bruxaria vale também pra ataque mágico). A resistência
   *  do alvo (se houver) usa `save`, sem `onSuccess` (o dano extra não muda). */
  rider?: {
    trigger: 'next_hit' | 'each_hit';
    attack: 'melee_weapon' | 'weapon' | 'any';
  };
  /** Só `kind: 'attack'`. */
  attack?: 'melee' | 'ranged';
  /** Só `kind: 'save'`. `onSuccess`: metade do dano, nenhum dano, ou dano total sempre (a
   *  resistência só evita o efeito extra, ex.: Esquentar Metal). Sem dano: sem `onSuccess`. */
  save?: {ability: StatKeyEn; onSuccess?: 'half' | 'none' | 'full'};
  /** Dano no círculo base (truque: no nível 1 do personagem), por raio/dardo. Ausente só em
   *  magia de resistência sem dano. */
  damage?: {count: number; sides: number; type: string};
  /** Só `kind: 'heal'`: dados de cura no círculo base; `tempHp` = PV temporários (Vitalidade Falsa). */
  heal?: {count: number; sides: number; tempHp?: boolean};
  /** Bônus fixo a mais por círculo acima do base (Vitalidade Falsa: +5 PV temporários). */
  bonusPerSlotAbove?: number;
  /** Segundo grupo de dados que não escala (Tempestade de Gelo: 2d8 concussão + 4d6 frio). */
  extraDice?: {count: number; sides: number};
  /** Soma o modificador do atributo de conjuração ao dano (ex.: Arma Espiritual). */
  addCastingMod?: boolean;
  /** Bônus fixo no dano de cada raio/dardo (Mísseis Mágicos: +1). */
  bonus?: number;
  /** Mais de uma rolagem por conjuração (raios, feixes, dardos). */
  instances?: {
    base: number;
    /** +N a cada círculo acima do base (Raio Ardente, Mísseis Mágicos). */
    perSlotAbove?: number;
    /** 1/2/3/4 nos níveis 1/5/11/17 do personagem (Rajada Mística). */
    byCharacterLevel?: boolean;
    label: string;
  };
  /** "Em Níveis Superiores": +`count` dados a cada `every` círculos acima do base (padrão 1). */
  upcast?: {count: number; every?: number};
  /** Truque: dados ×2/×3/×4 nos níveis 5/11/17 do personagem. */
  cantripScaling?: boolean;
  /** Qual opção da magia o modal rola, quando ela tem várias (Mão de Bigby). */
  variant?: string;
}

export const SPELL_MECHANICS: Record<number, SpellMechanics> = {
  // Truques
  59: {
    name: 'Chicote de Espinhos',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 6, type: 'perfurante'},
    cantripScaling: true,
  },
  101: {
    name: 'Criar Chamas',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'fogo'},
    cantripScaling: true,
  },
  287: {
    name: 'Raio de Fogo',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 10, type: 'fogo'},
    cantripScaling: true,
  },
  288: {
    name: 'Raio de Gelo',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'frio'},
    cantripScaling: true,
  },
  294: {
    name: 'Rajada Mística',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 10, type: 'energia'},
    instances: {base: 1, byCharacterLevel: true, label: 'feixe'},
  },
  345: {
    name: 'Toque Arrepiante',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 8, type: 'necrótico'},
    cantripScaling: true,
  },
  346: {
    name: 'Toque Chocante',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 8, type: 'elétrico'},
    cantripScaling: true,
  },

  // 1º círculo
  185: {
    name: 'Infligir Ferimentos',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 10, type: 'necrótico'},
    upcast: {count: 1},
  },
  222: {
    name: 'Mísseis Mágicos',
    kind: 'auto',
    damage: {count: 1, sides: 4, type: 'energia'},
    bonus: 1,
    instances: {base: 3, perSlotAbove: 1, label: 'dardo'},
  },
  246: {
    name: 'Orbe Cromática',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 3, sides: 8, type: 'à escolha'},
    upcast: {count: 1},
  },
  284: {
    name: 'Raio Adoecente',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 2, sides: 8, type: 'veneno'},
    upcast: {count: 1},
  },
  286: {
    name: 'Raio de Bruxa',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 1, sides: 12, type: 'elétrico'},
    upcast: {count: 1},
  },
  290: {
    name: 'Raio Guiador',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 4, sides: 6, type: 'radiante'},
    upcast: {count: 1},
  },

  // 2º círculo
  23: {
    name: 'Arma Espiritual',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 1, sides: 8, type: 'energia'},
    addCastingMod: true,
    upcast: {count: 1, every: 2},
  },
  162: {
    name: 'Flecha Ácida de Melf',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 4, sides: 4, type: 'ácido'},
    upcast: {count: 1},
  },
  285: {
    name: 'Raio Ardente',
    kind: 'attack',
    attack: 'ranged',
    damage: {count: 2, sides: 6, type: 'fogo'},
    instances: {base: 3, perSlotAbove: 1, label: 'raio'},
  },

  193: {
    name: 'Lâmina Flamejante',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 6, type: 'fogo'},
    upcast: {count: 1, every: 2},
  },

  // 3º círculo em diante
  347: {
    name: 'Toque Vampírico',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 6, type: 'necrótico'},
    upcast: {count: 1},
  },
  209: {
    name: 'Mão de Bigby',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 4, sides: 8, type: 'energia'},
    upcast: {count: 2},
    variant: 'Punho Cerrado',
  },
  152: {
    name: 'Espada de Mordenkainen',
    kind: 'attack',
    attack: 'melee',
    damage: {count: 3, sides: 10, type: 'energia'},
  },

  // -------------------------------------------------------------------------
  // Resistência com dano (fase 2)
  // -------------------------------------------------------------------------
  // Truques
  58: save('Chama Sagrada', 'DEX', 'none', 1, 8, 'radiante', {
    cantripScaling: true,
  }),
  154: save('Espirro Ácido', 'DEX', 'none', 1, 6, 'ácido', {
    cantripScaling: true,
  }),
  293: save('Rajada de Veneno', 'CON', 'none', 1, 12, 'veneno', {
    cantripScaling: true,
  }),
  361: save('Zombaria Viciosa', 'WIS', 'none', 1, 4, 'psíquico', {
    cantripScaling: true,
  }),
  // 1º círculo
  48: save('Braços de Hadar', 'STR', 'half', 2, 6, 'necrótico', {
    upcast: {count: 1},
  }),
  210: save('Mãos Flamejantes', 'DEX', 'half', 3, 6, 'fogo', {
    upcast: {count: 1},
  }),
  244: save('Onda Troveante', 'CON', 'half', 2, 8, 'trovejante', {
    upcast: {count: 1},
  }),
  304: save('Repreensão Infernal', 'DEX', 'half', 2, 10, 'fogo', {
    upcast: {count: 1},
  }),
  332: save('Sussurros Dissonantes', 'WIS', 'half', 3, 6, 'psíquico', {
    upcast: {count: 1},
  }),
  // 2º círculo
  114: save('Despedaçar', 'CON', 'half', 3, 8, 'trovejante', {
    upcast: {count: 1},
  }),
  150: save('Esfera Flamejante', 'DEX', 'half', 2, 6, 'fogo', {
    upcast: {count: 1},
  }),
  // O dano não tem resistência; a de Constituição só evita largar o objeto.
  155: save('Esquentar Metal', 'CON', 'full', 2, 8, 'fogo', {
    upcast: {count: 1},
  }),
  291: save('Raio Lunar', 'CON', 'half', 2, 10, 'radiante', {
    upcast: {count: 1},
  }),
  // 3º círculo
  44: save('Bola de Fogo', 'DEX', 'half', 8, 6, 'fogo', {upcast: {count: 1}}),
  94: save('Convocar Relâmpagos', 'DEX', 'half', 3, 10, 'elétrico', {
    upcast: {count: 1},
  }),
  153: save(
    'Espíritos Guardiões',
    'WIS',
    'half',
    3,
    8,
    'radiante ou necrótico',
    {upcast: {count: 1}},
  ),
  // Só o ácido do fim do turno tem resistência; o 2d6 de frio do início do turno é automático.
  165: save('Fome de Hadar', 'DEX', 'none', 2, 6, 'ácido'),
  171: save('Glifo de Vigilância', 'DEX', 'half', 5, 8, 'à escolha', {
    upcast: {count: 1},
    variant: 'Runa Explosiva',
  }),
  301: save('Relâmpago', 'DEX', 'half', 8, 6, 'elétrico', {upcast: {count: 1}}),
  // 4º círculo
  28: save('Assassino Fantasmagórico', 'WIS', 'none', 4, 10, 'psíquico', {
    upcast: {count: 1},
  }),
  230: save('Muralha de Fogo', 'DEX', 'half', 5, 8, 'fogo', {
    upcast: {count: 1},
  }),
  341: save('Tempestade de Gelo', 'DEX', 'half', 2, 8, 'concussão + 4d6 frio', {
    upcast: {count: 1},
    extraDice: {count: 4, sides: 6},
  }),
  342: save('Tentáculos Negros de Evard', 'DEX', 'none', 3, 6, 'contundente'),
  // 5º círculo
  67: save('Coluna de Chamas', 'DEX', 'half', 8, 6, 'fogo + radiante', {
    upcast: {count: 1},
  }),
  73: save('Cone de Frio', 'CON', 'half', 8, 8, 'frio', {upcast: {count: 1}}),
  82: save('Conjurar Saraivada', 'DEX', 'half', 8, 8, 'da munição'),
  237: save('Névoa Mortal', 'CON', 'half', 5, 8, 'veneno', {
    upcast: {count: 1},
  }),
  // 5d6 trovejante + 5d6 radiante/necrótico (o livro imprimiu "5d5" por engano).
  243: save(
    'Onda Destrutiva',
    'CON',
    'half',
    10,
    6,
    'trovejante + radiante ou necrótico',
  ),
  270: save('Praga de Insetos', 'CON', 'half', 4, 10, 'perfurante', {
    upcast: {count: 1},
  }),
  // 6º círculo
  61: save('Círculo da Morte', 'CON', 'half', 8, 6, 'necrótico', {
    upcast: {count: 2},
  }),
  // "Em Níveis Superiores" acrescenta alvos, não dados.
  97: save('Corrente de Relâmpagos', 'DEX', 'half', 10, 8, 'elétrico'),
  113: save('Desintegrar', 'DEX', 'none', 10, 6, 'energia', {
    upcast: {count: 3},
    bonus: 40,
  }),
  132: save('Doença Plena', 'CON', 'half', 14, 6, 'necrótico'),
  149: save('Esfera Congelante de Otiluke', 'CON', 'half', 10, 6, 'frio', {
    upcast: {count: 1},
  }),
  229: save('Muralha de Espinhos', 'DEX', 'half', 7, 8, 'perfurante', {
    upcast: {count: 1},
  }),
  231: save('Muralha de Gelo', 'DEX', 'half', 10, 6, 'frio', {
    upcast: {count: 2},
  }),
  292: save('Raio Solar', 'CON', 'half', 6, 8, 'radiante'),
  // 7º círculo
  45: save('Bola de Fogo Controlável', 'DEX', 'half', 12, 6, 'fogo', {
    upcast: {count: 1},
  }),
  111: save('Dedo da Morte', 'CON', 'half', 7, 8, 'necrótico', {bonus: 30}),
  340: save('Tempestade de Fogo', 'DEX', 'half', 7, 10, 'fogo'),
  // 8º círculo
  // O dano não tem resistência; a de Inteligência evita o efeito no intelecto.
  142: save('Enfraquecer Intelecto', 'INT', 'full', 4, 6, 'psíquico'),
  157: save('Explosão Solar', 'CON', 'half', 12, 6, 'radiante'),
  241: save('Nuvem Incendiária', 'DEX', 'half', 10, 8, 'fogo'),
  350: save('Tsunami', 'STR', 'half', 6, 10, 'concussão'),
  // 9º círculo
  60: save('Chuva de Meteoros', 'DEX', 'half', 40, 6, 'fogo + concussão'),
  138: save('Encarnação Fantasmagórica', 'WIS', 'none', 4, 10, 'psíquico'),

  // -------------------------------------------------------------------------
  // Somam dano no ataque (fase 4). Fora: Golpe Constritor, Saraivada de Espinhos e Flecha
  // Relampejante (dano por turno/em área, não um dado a mais no acerto) e Arma Elemental (mexe
  // também no bônus de ataque).
  // -------------------------------------------------------------------------
  119: rider(
    'Destruição Colérica',
    'next_hit',
    'melee_weapon',
    1,
    6,
    'psíquico',
    {save: {ability: 'WIS'}},
  ),
  121: rider(
    'Destruição Lancinante',
    'next_hit',
    'melee_weapon',
    1,
    6,
    'fogo',
    {save: {ability: 'CON'}, upcast: {count: 1}},
  ),
  122: rider(
    'Destruição Troveante',
    'next_hit',
    'melee_weapon',
    2,
    6,
    'trovejante',
    {save: {ability: 'STR'}},
  ),
  118: rider('Destruição Cegante', 'next_hit', 'weapon', 3, 8, 'radiante', {
    save: {ability: 'CON'},
  }),
  120: rider(
    'Destruição Estonteante',
    'next_hit',
    'melee_weapon',
    4,
    6,
    'psíquico',
    {save: {ability: 'WIS'}},
  ),
  // O livro traduzido traz 5d6 (o original em inglês é 5d10) — segue o livro.
  117: rider('Destruição Banidora', 'next_hit', 'weapon', 5, 6, 'energia'),
  49: rider('Bruxaria', 'each_hit', 'any', 1, 6, 'necrótico'),
  213: rider('Marca do Caçador', 'each_hit', 'weapon', 1, 6, 'da arma'),
  208: rider('Manto do Cruzado', 'each_hit', 'weapon', 1, 4, 'radiante'),

  // -------------------------------------------------------------------------
  // Cura (fase 3). Fora: as de valor fixo, sem dado (Cura Completa, Palavra de Poder Curar,
  // Cura Completa em Massa, Armadura de Agathys) e a cura do Toque Vampírico (metade do dano).
  // -------------------------------------------------------------------------
  108: heal('Curar Ferimentos', 1, 8, {upcast: {count: 1}}),
  249: heal('Palavra Curativa', 1, 4, {upcast: {count: 1}}),
  359: {
    name: 'Vitalidade Falsa',
    kind: 'heal',
    heal: {count: 1, sides: 4, tempHp: true},
    bonus: 4,
    bonusPerSlotAbove: 5,
  },
  245: heal('Oração Curativa', 2, 8, {upcast: {count: 1}}),
  250: heal('Palavra Curativa em Massa', 1, 4, {upcast: {count: 1}}),
  // Ação bônus a cada turno: 2d6, sem modificador.
  35: {name: 'Aura de Vitalidade', kind: 'heal', heal: {count: 2, sides: 6}},
  109: heal('Curar Ferimentos em Massa', 3, 8, {upcast: {count: 1}}),
  // Cura imediata; depois 1 PV no começo de cada turno do alvo (o mestre aplica).
  300: {
    name: 'Regeneração',
    kind: 'heal',
    heal: {count: 4, sides: 8},
    bonus: 15,
  },

  // -------------------------------------------------------------------------
  // Resistência sem dano rolável (fase 2): o anúncio mostra a CD. Inclui magias com dano
  // condicional/especial demais pra um botão de rolar (Símbolo, Terremoto, Muralha Prismática…).
  // Fora: Contato Extraplanar (CD fixa 15, não a do conjurador) e as que somam dano no próximo
  // ataque com arma (Destruições, Golpe Constritor, Saraivada de Espinhos, Flecha Relampejante —
  // fase 4).
  // -------------------------------------------------------------------------
  11: saveOnly('Amizade Animal', 'WIS'), // 1º
  68: saveOnly('Comando', 'WIS'), // 1º
  86: saveOnly('Constrição', 'STR'), // 1º
  137: saveOnly('Duelo Compelido', 'WIS'), // 1º
  141: saveOnly('Enfeitiçar Pessoa', 'WIS'), // 1º
  164: saveOnly('Fogo das Fadas', 'DEX'), // 1º
  264: saveOnly('Perdição', 'CHA'), // 1º
  313: saveOnly('Riso Histérico de Tasha', 'WIS'), // 1º
  316: saveOnly('Santuário', 'WIS'), // 1º
  21: saveOnly('Área Escorregadia', 'DEX'), // 1º
  2: saveOnly('Acalmar Emoções', 'CHA'), // 2º
  32: saveOnly('Aumentar/Reduzir', 'CON'), // 2º
  54: saveOnly('Cativar', 'WIS'), // 2º
  56: saveOnly('Cegueira/Surdez', 'CON'), // 2º
  95: saveOnly('Coroa da Loucura', 'WIS'), // 2º
  166: saveOnly('Força Fantasmagórica', 'INT'), // 2º
  184: saveOnly('Imobilizar Pessoa', 'WIS'), // 2º
  196: saveOnly('Levitação', 'CON'), // 2º
  203: saveOnly('Lufada de Vento', 'STR'), // 2º
  289: saveOnly('Raio do Enfraquecimento', 'CON'), // 2º
  334: saveOnly('Teia', 'DEX'), // 2º
  362: saveOnly('Zona da Verdade', 'CHA'), // 2º
  64: saveOnly('Círculo Mágico', 'CHA'), // 3º
  194: saveOnly('Lentidão', 'WIS'), // 3º
  214: saveOnly('Medo', 'WIS'), // 3º
  235: saveOnly('Nevasca', 'DEX'), // 3º
  236: saveOnly('Névoa Fétida', 'CON'), // 3º
  248: saveOnly('Padrão Hipnótico', 'WIS'), // 3º
  314: saveOnly('Rogar Maldição', 'WIS'), // 3º
  39: saveOnly('Banimento', 'CHA'), // 4º
  70: saveOnly('Compulsão', 'WIS'), // 4º
  74: saveOnly('Confusão', 'WIS'), // 4º
  90: saveOnly('Controlar a Água', 'STR'), // 4º
  133: saveOnly('Dominar Besta', 'WIS'), // 4º
  151: saveOnly('Esfera Resiliente de Otiluke', 'DEX'), // 4º
  175: saveOnly('Guardião da Fé', 'DEX'), // 4º
  356: saveOnly('Vinha Esmagadora', 'DEX'), // 4º
  131: saveOnly('Dissipar o Bem e Mal', 'CHA'), // 5º
  135: saveOnly('Dominar Pessoa', 'WIS'), // 5º
  183: saveOnly('Imobilizar Monstro', 'WIS'), // 5º
  221: saveOnly('Missão', 'WIS'), // 5º
  223: saveOnly('Modificar Memória', 'WIS'), // 5º
  232: saveOnly('Muralha de Pedra', 'DEX'), // 5º
  269: saveOnly('Praga', 'CON'), // 5º
  328: saveOnly('Sonho', 'WIS'), // 5º
  13: saveOnly('Âncora Planar', 'CHA'), // 5º
  30: saveOnly('Ataque Visual', 'WIS'), // 6º
  55: saveOnly('Carne para Pedra', 'CON'), // 6º
  110: saveOnly('Dança Irresistível de Otto', 'WIS'), // 6º
  296: saveOnly('Recipiente Arcano', 'CHA'), // 6º
  331: saveOnly('Sugestão em Massa', 'WIS'), // 6º
  187: saveOnly('Inverter a Gravidade', 'DEX'), // 7º
  255: saveOnly('Palavra Divina', 'CHA'), // 7º
  272: saveOnly('Prisão de Energia', 'CHA'), // 7º
  295: saveOnly('Rajada Prismática', 'DEX'), // 7º
  324: saveOnly('Símbolo', 'WIS'), // 7º
  353: saveOnly('Viagem Planar', 'CHA'), // 7º
  17: saveOnly('Antipatia/Simpatia', 'WIS'), // 8º
  37: saveOnly('Aura Sagrada', 'CON'), // 8º
  134: saveOnly('Dominar Monstro', 'WIS'), // 8º
  251: saveOnly('Palavra de Poder Atordoar', 'CON'), // 8º
  343: saveOnly('Terremoto', 'CON'), // 8º
  19: saveOnly('Aprisionamento', 'WIS'), // 9º
  219: saveOnly('Metamorfose Verdadeira', 'WIS'), // 9º
  234: saveOnly('Muralha Prismática', 'CON'), // 9º
  339: saveOnly('Tempestade da Vingança', 'CON'), // 9º
};

/** Magia de resistência com dano. */
function save(
  name: string,
  ability: StatKeyEn,
  onSuccess: 'half' | 'none' | 'full',
  count: number,
  sides: number,
  type: string,
  extra: Partial<SpellMechanics> = {},
): SpellMechanics {
  return {
    name,
    kind: 'save',
    save: {ability, onSuccess},
    damage: {count, sides, type},
    ...extra,
  };
}

/** Magia que soma dados ao dano de um ataque. */
function rider(
  name: string,
  trigger: 'next_hit' | 'each_hit',
  attack: 'melee_weapon' | 'weapon' | 'any',
  count: number,
  sides: number,
  type: string,
  extra: Partial<SpellMechanics> = {},
): SpellMechanics {
  return {
    name,
    kind: 'rider',
    rider: {trigger, attack},
    damage: {count, sides, type},
    ...extra,
  };
}

/** Magia de cura com dado + modificador de conjuração. */
function heal(
  name: string,
  count: number,
  sides: number,
  extra: Partial<SpellMechanics> = {},
): SpellMechanics {
  return {
    name,
    kind: 'heal',
    heal: {count, sides},
    addCastingMod: true,
    ...extra,
  };
}

/** Magia de resistência sem dano rolável — só a CD no anúncio. */
function saveOnly(name: string, ability: StatKeyEn): SpellMechanics {
  return {name, kind: 'save', save: {ability}};
}

/** Multiplicador de truque pelo nível do personagem: 1/2/3/4 nos níveis 1/5/11/17. */
export function cantripTier(characterLevel: number): number {
  if (characterLevel >= 17) return 4;
  if (characterLevel >= 11) return 3;
  if (characterLevel >= 5) return 2;
  return 1;
}

/** Rolagem de uma conjuração num círculo específico (`slotLevel`; truque usa o próprio nível 0). */
export function resolveSpellRollAtSlot(
  mechanics: SpellMechanics,
  spellLevel: number,
  slotLevel: number,
  characterLevel: number,
  castingMod: number,
  healing: HealingFeatures = NO_HEALING_FEATURES,
): SpellRoll['by_slot'][string] | null {
  const dice = mechanics.damage ?? mechanics.heal;
  if (!dice) return null;
  const above = Math.max(0, slotLevel - spellLevel);
  const tier = cantripTier(characterLevel);
  let diceCount = dice.count;
  if (mechanics.upcast)
    diceCount +=
      mechanics.upcast.count *
      Math.floor(above / (mechanics.upcast.every ?? 1));
  if (mechanics.cantripScaling) diceCount *= tier;

  const inst = mechanics.instances;
  const instances = !inst
    ? 1
    : inst.byCharacterLevel
      ? tier
      : inst.base + (inst.perSlotAbove ?? 0) * above;

  return {
    instances,
    dice_count: diceCount,
    dice_sides: dice.sides,
    modifier:
      (mechanics.addCastingMod ? castingMod : 0) +
      (mechanics.bonus ?? 0) +
      (mechanics.bonusPerSlotAbove ?? 0) * above +
      (restoresHp(mechanics) && healing.discipleOfLife && slotLevel >= 1
        ? 2 + slotLevel
        : 0),
    extra_dice: mechanics.extraDice ? [mechanics.extraDice] : [],
  };
}

/** Características que mexem na cura das magias do personagem (Clérigo do Domínio da Vida). */
export interface HealingFeatures {
  /** Discípulo da Vida (nv1): +2 + círculo do espaço em magia de 1º círculo ou maior. */
  discipleOfLife: boolean;
  /** Cura Suprema (nv17): usa o valor máximo dos dados em vez de rolar. */
  supremeHealing: boolean;
}

const NO_HEALING_FEATURES: HealingFeatures = {
  discipleOfLife: false,
  supremeHealing: false,
};

/** Cura de verdade (PV), não PV temporários. */
function restoresHp(mechanics: SpellMechanics): boolean {
  return mechanics.kind === 'heal' && !mechanics.heal?.tempHp;
}

/** Domínio da Vida: Discípulo da Vida desde o nv1 e Cura Suprema a partir do nv17. */
export function healingFeaturesFor(
  idClass: number,
  idSubclass: string | null | undefined,
  level: number,
): HealingFeatures {
  const life = idClass === 4 && idSubclass === 'vida';
  return {discipleOfLife: life, supremeHealing: life && level >= 17};
}

/**
 * Rolagem pronta pra ficha: bônus de ataque / CD do personagem e os dados por círculo em que a
 * magia pode ser lançada (truque: só a chave "0", já escalado pelo nível; resistência sem dano:
 * `by_slot` vazio). `null` se a magia não tem mecânica cadastrada.
 */
export function buildSpellRoll(
  idSpell: number,
  spellLevel: number,
  characterLevel: number,
  castingMod: number,
  spellAttackBonus: number,
  spellSaveDc: number,
  healing: HealingFeatures = NO_HEALING_FEATURES,
): SpellRoll | null {
  const mechanics = SPELL_MECHANICS[idSpell];
  if (!mechanics) return null;
  const slotLevels =
    spellLevel === 0
      ? [0]
      : Array.from({length: 10 - spellLevel}, (_, i) => spellLevel + i);
  return {
    kind: mechanics.kind,
    attack_type: mechanics.attack ?? null,
    attack_bonus: mechanics.kind === 'attack' ? spellAttackBonus : null,
    damage_type: mechanics.damage?.type ?? null,
    heal: mechanics.heal ? (mechanics.heal.tempHp ? 'temp_hp' : 'hp') : null,
    rider_trigger: mechanics.rider?.trigger ?? null,
    rider_attack: mechanics.rider?.attack ?? null,
    maximize: restoresHp(mechanics) && healing.supremeHealing,
    save_ability: mechanics.save?.ability ?? null,
    save_dc: mechanics.save ? spellSaveDc : null,
    save_on_success: mechanics.save?.onSuccess ?? null,
    instance_label: mechanics.instances?.label ?? null,
    variant: mechanics.variant ?? null,
    by_slot: Object.fromEntries(
      slotLevels.flatMap(slot => {
        const entry = resolveSpellRollAtSlot(
          mechanics,
          spellLevel,
          slot,
          characterLevel,
          castingMod,
          healing,
        );
        return entry ? [[String(slot), entry]] : [];
      }),
    ),
  };
}
