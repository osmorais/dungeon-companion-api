/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn, Trait} from '../../models/character-sheet-types';

export interface RaceRule {
  id_race: number;
  displayName: string;
  bonuses: Partial<Record<StatKeyEn, number>>;
  speed: string;
  traits: Trait[];
  weaponProficiencies?: string[];
  skillProficiencies?: string[];
  languages: string[];
}

export interface SubraceRule {
  bonuses: Partial<Record<StatKeyEn, number>>;
  traits: Trait[];
  weaponProficiencies?: string[];
}

export interface ClassRule {
  id_class: number;
  displayName: string;
  hitDie: number;
  savingThrows: StatKeyEn[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  isSpellcaster: boolean;
  spellcastingAbility?: StatKeyEn;
  spellSlotsLevel1: number;
  traits: Trait[];
  startingEquipment: string[];
  startingGold: number;
}

export interface BackgroundRule {
  id_background: number;
  displayName: string;
  skills: string[];
  tools: string[];
  languages: number;
  feature: Trait;
  startingItems: string[];
  startingGold: number;
}

export interface WeaponRule {
  displayName: string;
  damageDie: string;
  damageType: string;
  properties: string[];
  isRanged: boolean;
  isFinesse: boolean;
}

export interface ArmorRule {
  baseAC: number;
  armorType: 'none' | 'light' | 'medium' | 'heavy';
  maxDexBonus?: number;
}

// ---------------------------------------------------------------------------
// Races
// ---------------------------------------------------------------------------

//TO DO: Adicionar o id_race a partir do banco de dados e utilizar somente as regras.
export const RACES: Record<number, RaceRule> = {
  1: {
    id_race: 1,
    displayName: 'Anão',
    bonuses: {CON: 2},
    speed: '7,5m',
    languages: ['Comum', 'Anão'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena e na escuridão como se fosse meia-luz.'},
      {name: 'Resistência Anã', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra veneno e resistência a dano de veneno.'},
    ],
  },
  2: {
    id_race: 2,
    displayName: 'Elfo',
    bonuses: {DEX: 2},
    speed: '9m',
    languages: ['Comum', 'Élfico'],
    skillProficiencies: ['perception'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena e na escuridão como se fosse meia-luz.'},
      {name: 'Ancestralidade Feérica', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra ser enfeitiçado e a magia não pode adormecê-lo.'},
      {name: 'Transe', source: 'Raça', description: 'Elfos não precisam dormir. Em vez disso, meditam profundamente por 4 horas por dia.'},
    ],
  },
  3: {
    id_race: 3,
    displayName: 'Halfling',
    bonuses: {DEX: 2},
    speed: '7,5m',
    languages: ['Comum', 'Halfling'],
    traits: [
      {name: 'Sorte', source: 'Raça', description: 'Quando você rola 1 num d20 em um teste de atributo, teste de resistência ou jogada de ataque, você pode rolar novamente o dado e deve usar o novo resultado.'},
      {name: 'Bravura', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra medo.'},
    ],
  },
  4: {
    id_race: 4,
    displayName: 'Draconato',
    bonuses: {STR: 2, CHA: 1},
    speed: '9m',
    languages: ['Comum', 'Dracônico'],
    traits: [
      {name: 'Ancestralidade Dracônica', source: 'Raça', description: 'Você tem ancestralidade dracônica. Você pode usar uma ação para exalar energia destrutiva (Sopro de Fogo, CD 13).'},
      {name: 'Resistência Dracônica', source: 'Raça', description: 'Você tem resistência ao tipo de dano associado à sua ancestralidade dracônica.'},
    ],
  },
  5: {
    id_race: 5,
    displayName: 'Gnomo',
    bonuses: {INT: 2},
    speed: '7,5m',
    languages: ['Comum', 'Gnômico'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena.'},
      {name: 'Esperteza Gnômica', source: 'Raça', description: 'Você tem vantagem em todos os testes de resistência de Inteligência, Sabedoria e Carisma contra magia.'},
    ],
  },
  6: {
    id_race: 6,
    displayName: 'Meio-Elfo',
    bonuses: {CHA: 2},
    speed: '9m',
    languages: ['Comum', 'Élfico'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena.'},
      {name: 'Ancestralidade Feérica', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra ser enfeitiçado.'},
      {name: 'Habilidade Versátil', source: 'Raça', description: 'Você ganha proficiência em duas perícias à sua escolha.'},
    ],
  },
  7: {
    id_race: 7,
    displayName: 'Meio-Orc',
    bonuses: {STR: 2, CON: 1},
    speed: '9m',
    languages: ['Comum', 'Orc'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena.'},
      {name: 'Ameaçador', source: 'Raça', description: 'Você tem proficiência na perícia Intimidação.'},
      {name: 'Tolerância Inabalável', source: 'Raça', description: 'Quando um dano te reduziria a 0 pontos de vida, você pode usar sua reação para cair a 1 ponto de vida em vez disso.'},
    ],
  },
  8: {
    id_race: 8,
    displayName: 'Tiefling',
    bonuses: {CHA: 2, INT: 1},
    speed: '9m',
    languages: ['Comum', 'Infernal'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena.'},
      {name: 'Resistência Infernal', source: 'Raça', description: 'Você tem resistência a dano de fogo.'},
      {name: 'Legado Infernal', source: 'Raça', description: 'Você conhece o truque Taumaturgia. No nível 3, pode lançar Mãos Flamejantes uma vez por dia. No nível 5, pode lançar Escuridão uma vez por dia.'},
    ],
  },
  9: {
    id_race: 9,
    displayName: 'Humano',
    bonuses: {STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1},
    speed: '9m',
    languages: ['Comum'],
    traits: [],
  },
};

export const SUBRACES: Record<string, SubraceRule> = {
  'anao-da-colina': {bonuses: {WIS: 1}, traits: [{name: 'Tenacidade Anã', source: 'Sub-raça', description: 'Seu máximo de pontos de vida aumenta em 1, e ele aumenta em 1 toda vez que você ganha um nível.'}]},
  'anao-da-montanha': {bonuses: {STR: 2}, traits: [{name: 'Treinamento com Armaduras Anão', source: 'Sub-raça', description: 'Você tem proficiência com armaduras leves e médias.'}]},
  'alto-elfo': {bonuses: {INT: 1}, traits: [{name: 'Truque', source: 'Sub-raça', description: 'Você conhece um truque de mago à sua escolha.'}], weaponProficiencies: ['Espadas Longas', 'Espadas Curtas', 'Arcos Longos', 'Arcos Curtos']},
  'elfo-da-floresta': {bonuses: {WIS: 1}, traits: [{name: 'Passo Veloz', source: 'Sub-raça', description: 'Seu deslocamento base aumenta para 10,5m (35 pés).'}], weaponProficiencies: ['Espadas Longas', 'Espadas Curtas', 'Arcos Longos', 'Arcos Curtos']},
  'halfling-pes-leves': {bonuses: {CHA: 1}, traits: [{name: 'Furtividade Natural', source: 'Sub-raça', description: 'Você pode tentar se esconder mesmo quando está obscurecido apenas por uma criatura que seja pelo menos um tamanho maior que você.'}]},
  'halfling-robusto': {bonuses: {CON: 1}, traits: [{name: 'Resistência Robusto', source: 'Sub-raça', description: 'Você tem vantagem em testes de resistência contra veneno e tem resistência a dano de veneno.'}]},
  'gnomo-das-rochas': {bonuses: {CON: 1}, traits: [{name: 'Conhecimento Artificial', source: 'Sub-raça', description: 'Você tem proficiência com ferramentas de artesão.'}]},
  'gnomo-das-florestas': {bonuses: {DEX: 1}, traits: [{name: 'Ilusão Natural', source: 'Sub-raça', description: 'Você conhece o truque de mago Ilusão Menor.'}]},
};

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

//TO DO: Adicionar o id_class a partir do banco de dados e utilizar somente as regras.
export const CLASSES: Record<number, ClassRule> = {
  1: {
    id_class: 1,
    displayName: 'Bárbaro',
    hitDie: 12,
    savingThrows: ['STR', 'CON'],
    armorProficiencies: ['Leve', 'Média', 'Escudos'],
    weaponProficiencies: ['Armas Simples', 'Armas Marciais'],
    isSpellcaster: false,
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Fúria', source: 'Classe', description: 'Em seu turno, você pode entrar em fúria como uma ação bônus. Enquanto em fúria, você tem vantagem em testes de Força e jogadas de ataque de Força, e recebe bônus nas jogadas de dano.'},
      {name: 'Defesa sem Armadura', source: 'Classe', description: 'Enquanto não estiver usando armadura, sua CA é igual a 10 + modificador de Destreza + modificador de Constituição.'},
    ],
    startingEquipment: ['Machado Grande', 'Dois Machados de Mão', 'Pacote de Aventureiro', 'Quatro Azagaias'],
    startingGold: 0,
  },
  2: {
    id_class: 2,
    displayName: 'Bardo',
    hitDie: 8,
    savingThrows: ['DEX', 'CHA'],
    armorProficiencies: ['Leve'],
    weaponProficiencies: ['Armas Simples', 'Bestas de Mão', 'Espadas Curtas', 'Espadas Longas', 'Rapieiras'],
    isSpellcaster: true,
    spellcastingAbility: 'CHA',
    spellSlotsLevel1: 2,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Você aprendeu a desvendar e reconfigurar a magia em si. Você pode lançar truques e magias niveladas.'},
      {name: 'Inspiração Bárdica', source: 'Classe', description: 'Você pode inspirar outros através de palavras ou música. Para tanto, use uma ação bônus no seu turno para escolher uma criatura que não seja você numa distância de 18 metros.'},
    ],
    startingEquipment: ['Rapieira', 'Instrumento Musical', 'Couro Batido', 'Pacote do Diplomata'],
    startingGold: 5 * 4,
  },
  3: {
    id_class: 3,
    displayName: 'Bruxo',
    hitDie: 8,
    savingThrows: ['WIS', 'CHA'],
    armorProficiencies: ['Leve'],
    weaponProficiencies: ['Armas Simples'],
    isSpellcaster: true,
    spellcastingAbility: 'CHA',
    spellSlotsLevel1: 1,
    traits: [
      {name: 'Patrono Sobrenatural', source: 'Classe', description: 'Você fez um pacto com um ser sobrenatural de seu nível de poder, um ser cujos objetivos e motivações são diferentes dos mortais.'},
      {name: 'Magia do Pacto', source: 'Classe', description: 'Seu arcano pesquisado concedeu-lhe facilidade com feitiços. Você pode lançar feitiços de bruxo.'},
    ],
    startingEquipment: ['Besta Leve com 20 virotes', 'Bastão', 'Couro Batido', 'Foco Arcano', 'Pacote do Estudioso'],
    startingGold: 4 * 4,
  },
  4: {
    id_class: 4,
    displayName: 'Clérigo',
    hitDie: 8,
    savingThrows: ['WIS', 'CHA'],
    armorProficiencies: ['Leve', 'Média', 'Escudos'],
    weaponProficiencies: ['Armas Simples'],
    isSpellcaster: true,
    spellcastingAbility: 'WIS',
    spellSlotsLevel1: 2,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Como um conduit para o poder divino, você pode lançar feitiços de clérigo.'},
      {name: 'Domínio Divino', source: 'Classe', description: 'Escolha um domínio divino relacionado à sua divindade. Sua escolha lhe concede truques de domínio e outras características quando você a faz, no nível 1.'},
    ],
    startingEquipment: ['Maça', 'Escudo', 'Cota de Malha', 'Pacote do Padre'],
    startingGold: 5 * 4,
  },
  5: {
    id_class: 5,
    displayName: 'Druida',
    hitDie: 8,
    savingThrows: ['INT', 'WIS'],
    armorProficiencies: ['Leve (não-metal)', 'Média (não-metal)', 'Escudos (não-metal)'],
    weaponProficiencies: ['Clavas', 'Adagas', 'Dardos', 'Azagaias', 'Maças', 'Cajados', 'Cimitarras', 'Foices', 'Fundas', 'Lanças'],
    isSpellcaster: true,
    spellcastingAbility: 'WIS',
    spellSlotsLevel1: 2,
    traits: [
      {name: 'Druidico', source: 'Classe', description: 'Você conhece Druidico, a linguagem secreta dos druidas.'},
      {name: 'Conjuração', source: 'Classe', description: 'Em harmonia com a natureza, você pode lançar feitiços de druida.'},
    ],
    startingEquipment: ['Escudo de Madeira', 'Cimitarra', 'Couro Batido', 'Pacote do Explorador'],
    startingGold: 2 * 4,
  },
  6: {
    id_class: 6,
    displayName: 'Feiticeiro',
    hitDie: 6,
    savingThrows: ['CON', 'CHA'],
    armorProficiencies: ['Nenhuma'],
    weaponProficiencies: ['Adagas', 'Dardos', 'Fundas', 'Bastões', 'Bestas Leves'],
    isSpellcaster: true,
    spellcastingAbility: 'CHA',
    spellSlotsLevel1: 2,
    traits: [
      {name: 'Origem de Feitiçaria', source: 'Classe', description: 'Escolha uma origem de feitiçaria que descreve a fonte de seu poder mágico inato. Sua escolha concede características a você no 1º nível e novamente nos níveis 6, 14 e 18.'},
      {name: 'Conjuração', source: 'Classe', description: 'A magia é parte de você, fluindo diretamente da sua herança. Você pode lançar feitiços de feiticeiro.'},
    ],
    startingEquipment: ['Besta Leve com 20 virotes', 'Bastão', 'Foco Arcano', 'Pacote do Aventureiro'],
    startingGold: 3 * 4,
  },
  7: {
    id_class: 7,
    displayName: 'Guerreiro',
    hitDie: 10,
    savingThrows: ['STR', 'CON'],
    armorProficiencies: ['Todas as Armaduras', 'Escudos'],
    weaponProficiencies: ['Armas Simples', 'Armas Marciais'],
    isSpellcaster: false,
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Estilo de Combate', source: 'Classe', description: 'Você adota um estilo particular de combate como sua especialidade. Escolha uma das opções: Arqueria, Defesa, Duelo, Grande Arma, Proteção ou Combate com Duas Armas.'},
      {name: 'Retomar Fôlego', source: 'Classe', description: 'Você tem uma reserva de resistência que pode usar para se proteger. Em seu turno, você pode usar uma ação bônus para recuperar pontos de vida iguais a 1d10 + seu nível de guerreiro.'},
    ],
    startingEquipment: ['Cota de Malha', 'Escudo', 'Espada Longa', 'Besta Leve com 20 virotes', 'Pacote do Aventureiro'],
    startingGold: 5 * 4,
  },
  8: {
    id_class: 8,
    displayName: 'Ladino',
    hitDie: 8,
    savingThrows: ['DEX', 'INT'],
    armorProficiencies: ['Leve'],
    weaponProficiencies: ['Armas Simples', 'Bestas de Mão', 'Espadas Longas', 'Espadas Curtas', 'Rapieiras'],
    isSpellcaster: false,
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Especialização', source: 'Classe', description: 'Escolha duas das suas proficiências em perícias. Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas perícias.'},
      {name: 'Ataque Furtivo', source: 'Classe', description: 'Você sabe como encontrar e explorar a fraqueza de um inimigo distraído. Uma vez por turno, você pode causar 1d6 de dano extra a uma criatura que acertar com um ataque se você tiver vantagem.'},
      {name: 'Linguagem dos Ladrões', source: 'Classe', description: 'Você aprendeu a linguagem secreta dos ladrões, usada pelos membros das guildas de ladrões e outros criminosos similares.'},
    ],
    startingEquipment: ['Rapieira', 'Arco Curto com 20 flechas', 'Couro Batido', 'Duas Adagas', 'Ferramentas de Ladrão', 'Pacote do Aventureiro'],
    startingGold: 4 * 4,
  },
  9: {
    id_class: 9,
    displayName: 'Mago',
    hitDie: 6,
    savingThrows: ['INT', 'WIS'],
    armorProficiencies: ['Nenhuma'],
    weaponProficiencies: ['Adagas', 'Dardos', 'Fundas', 'Bastões', 'Bestas Leves'],
    isSpellcaster: true,
    spellcastingAbility: 'INT',
    spellSlotsLevel1: 2,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Como estudante da magia arcana, você possui um grimório com feitiços que você pode lançar.'},
      {name: 'Recuperação Arcana', source: 'Classe', description: 'Você aprendeu a recuperar parte de sua energia mágica estudando seu grimório. Uma vez por dia, quando você termina um descanso curto, pode recuperar espaços de magia.'},
    ],
    startingEquipment: ['Bastão', 'Grimório', 'Foco Arcano (Varinha)', 'Pacote de Estudioso', 'Tinteiro e Pena'],
    startingGold: 4 * 4,
  },
  10: {
    id_class: 10,
    displayName: 'Monge',
    hitDie: 8,
    savingThrows: ['STR', 'DEX'],
    armorProficiencies: ['Nenhuma'],
    weaponProficiencies: ['Armas Simples', 'Espadas Curtas'],
    isSpellcaster: false,
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Defesa sem Armadura', source: 'Classe', description: 'Enquanto não estiver vestindo armadura e não estiver empunhando um escudo, sua CA é igual a 10 + seu modificador de Destreza + seu modificador de Sabedoria.'},
      {name: 'Artes Marciais', source: 'Classe', description: 'Sua prática das artes marciais lhe dá o domínio de estilos de combate que usam ataques desarmados e armas de monge.'},
    ],
    startingEquipment: ['Espada Curta', 'Dez Dardos', 'Pacote do Aventureiro'],
    startingGold: 5 * 4,
  },
  11: {
    id_class: 11,
    displayName: 'Paladino',
    hitDie: 10,
    savingThrows: ['WIS', 'CHA'],
    armorProficiencies: ['Todas as Armaduras', 'Escudos'],
    weaponProficiencies: ['Armas Simples', 'Armas Marciais'],
    isSpellcaster: true,
    spellcastingAbility: 'CHA',
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Sentido Divino', source: 'Classe', description: 'A presença do forte mal registra nos seus sentidos como uma odor nauseante e o poder poderoso do bem soa como música celestial nos seus ouvidos.'},
      {name: 'Curar pelo Toque', source: 'Classe', description: 'A partir do 1º nível, você tem um reservatório de poder curativo que repõe quando você toma um descanso longo.'},
    ],
    startingEquipment: ['Espada Longa', 'Escudo', 'Cota de Malha', 'Símbolo Sagrado', 'Pacote do Padre'],
    startingGold: 5 * 4,
  },
  12: {
    id_class: 12,
    displayName: 'Ranger (Patrulheiro)',
    hitDie: 10,
    savingThrows: ['STR', 'DEX'],
    armorProficiencies: ['Leve', 'Média', 'Escudos'],
    weaponProficiencies: ['Armas Simples', 'Armas Marciais'],
    isSpellcaster: true,
    spellcastingAbility: 'WIS',
    spellSlotsLevel1: 0,
    traits: [
      {name: 'Inimigo Favorito', source: 'Classe', description: 'Você tem experiência significativa estudando, rastreando, caçando e até conversando com um determinado tipo de inimigo.'},
      {name: 'Explorador Natural', source: 'Classe', description: 'Você é particularmente familiarizado com um tipo de ambiente natural e é adepto em viajar e sobreviver nesses ambientes.'},
    ],
    startingEquipment: ['Cota de Escamas', 'Duas Espadas Curtas', 'Pacote do Explorador', 'Arco Longo com 20 flechas'],
    startingGold: 5 * 4,
  },
};

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

//TO DO: Adicionar o id_background a partir do banco de dados e utilizar somente as regras.
export const BACKGROUNDS: Record<number, BackgroundRule> = {
  1: {
    id_background: 1,
    displayName: 'Acólito',
    skills: ['insight', 'religion'],
    tools: ['Nenhuma'],
    languages: 2,
    feature: {
      name: 'Abrigo dos Fiéis', 
      source: 'Antecedente', 
      description: 'Como acólito, você comanda o respeito daqueles que compartilham de sua fé. Você e seus aventureiros podem esperar receber cura e cuidados gratuitos no templo.'
    },
    startingItems: ['Símbolo Sagrado', 'Livro de Preces', 'Incenso (5 varetas)', 'Vestimentas', 'Roupas comuns', 'Bolsa com 15 po'],
    startingGold: 15,
  },
  2: {
    id_background: 2,
    displayName: 'Artesão de Guilda',
    skills: ['insight', 'persuasion'],
    tools: ['Ferramentas de Artesão'],
    languages: 1,
    feature: {
      name: 'Associação de Guilda',
      source: 'Antecedente',
      description: 'Como membro de uma guilda, você tem acesso aos benefícios de membresia, incluindo moradia e suporte político/jurídico.'
    },
    startingItems: ['Ferramentas de artesão', 'Carta de apresentação', 'Roupas de viajante', 'Bolsa com 15 po'],
    startingGold: 15,
  },
  3: {
    id_background: 3,
    displayName: 'Artista',
    skills: ['acrobatics', 'performance'],
    tools: ['Kit de Disfarce', 'Um tipo de instrumento musical'],
    languages: 0,
    feature: {
      name: 'Pelo Olhar do Público',
      source: 'Antecedente',
      description: 'Você sempre consegue encontrar um lugar para se apresentar e receber comida e alojamento em troca.'
    },
    startingItems: ['Instrumento musical', 'Presente de admirador', 'Traje', 'Bolsa com 15 po'],
    startingGold: 15,
  },
  4: {
    id_background: 4,
    displayName: 'Charlatão',
    skills: ['deception', 'sleight_of_hand'],
    tools: ['Kit de Disfarce', 'Kit de Falsificação'],
    languages: 0,
    feature: {
      name: 'Falsa Identidade', 
      source: 'Antecedente', 
      description: 'Você criou uma segunda identidade que inclui documentação, contatos estabelecidos e disfarces.'
    },
    startingItems: ['Roupas Finas', 'Kit de Disfarce', 'Ferramentas de Trapaça', 'Bolsa com 15 po'],
    startingGold: 15,
  },
  5: {
    id_background: 5,
    displayName: 'Criminoso',
    skills: ['deception', 'stealth'],
    tools: ['Um tipo de kit de jogo', 'Ferramentas de Ladrão'],
    languages: 0,
    feature: {
      name: 'Contato Criminal', 
      source: 'Antecedente', 
      description: 'Você tem um contato confiável e de confiança que age como seu intermediário na rede criminal.'
    },
    startingItems: ['Pé de Cabra', 'Roupas Escuras com Capuz', 'Bolsa com 15 po'],
    startingGold: 15,
  },
  6: {
    id_background: 6,
    displayName: 'Eremita',
    skills: ['medicine', 'religion'],
    tools: ['Kit de Herbalismo'],
    languages: 1,
    feature: {
      name: 'Descoberta',
      source: 'Antecedente',
      description: 'Você descobriu um segredo único após seu tempo de reclusão.'
    },
    startingItems: ['Estojo de pergaminho', 'Cobertor de inverno', 'Kit de herbalismo', '5 po'],
    startingGold: 5,
  },
  7: {
    id_background: 7,
    displayName: 'Forasteiro',
    skills: ['athletics', 'survival'],
    tools: ['Um tipo de instrumento musical'],
    languages: 1,
    feature: {
      name: 'Andarilho',
      source: 'Antecedente',
      description: 'Você tem uma memória excelente para mapas e geografia.'
    },
    startingItems: ['Bordão', 'Armadilha de caça', 'Troféu de animal', 'Bolsa com 10 po'],
    startingGold: 10,
  },
  8: {
    id_background: 8,
    displayName: 'Herói do Povo',
    skills: ['animal_handling', 'survival'],
    tools: ['Ferramentas de Artesão', 'Veículos Terrestres'],
    languages: 0,
    feature: {
      name: 'Hospitalidade Rústica', 
      source: 'Antecedente', 
      description: 'Desde sua origem humilde, o povo confia e está do seu lado.'
    },
    startingItems: ['Ferramentas de Artesão', 'Pá', 'Pote de Ferro', 'Roupas Comuns', 'Bolsa com 10 po'],
    startingGold: 10,
  },
  9: {
    id_background: 9,
    displayName: 'Marinheiro',
    skills: ['athletics', 'perception'],
    tools: ['Ferramentas de Navegador', 'Veículos Aquáticos'],
    languages: 0,
    feature: {
      name: 'Passagem de Navio',
      source: 'Antecedente',
      description: 'Você pode conseguir passagem gratuita em um navio para você e seus companheiros.'
    },
    startingItems: ['Clava (malagueta)', '15m de corda de seda', 'Amuleto da sorte', 'Bolsa com 10 po'],
    startingGold: 10,
  },
  10: {
    id_background: 10,
    displayName: 'Nobre',
    skills: ['history', 'persuasion'],
    tools: ['Um tipo de kit de jogo'],
    languages: 1,
    feature: {
      name: 'Posição de Privilégio', 
      source: 'Antecedente', 
      description: 'Graças à sua posição nobre, pessoas tendem a pensar o melhor de você. Você é bem-vindo na alta sociedade.'
    },
    startingItems: ['Roupas Finas', 'Anel de Sinete', 'Pergaminho de Linhagem', 'Bolsa com 25 po'],
    startingGold: 25,
  },
  11: {
    id_background: 11,
    displayName: 'Órfão',
    skills: ['stealth', 'sleight_of_hand'],
    tools: ['Kit de Disfarce', 'Ferramentas de Ladrão'],
    languages: 0,
    feature: {
      name: 'Segredos da Cidade',
      source: 'Antecedente',
      description: 'Você conhece os caminhos e passagens secretas da cidade onde cresceu.'
    },
    startingItems: ['Faca pequena', 'Mapa da cidade natal', 'Rato de estimação', 'Bolsa com 10 po'],
    startingGold: 10,
  },
  12: {
    id_background: 12,
    displayName: 'Sábio',
    skills: ['arcana', 'history'],
    tools: ['Nenhuma'],
    languages: 2,
    feature: {
      name: 'Pesquisador', 
      source: 'Antecedente', 
      description: 'Quando você tenta aprender ou relembrar um conhecimento, você frequentemente sabe onde obter essa informação.'
    },
    startingItems: ['Vidro de tinta', 'Pena', 'Faca Pequena', 'Carta de Colega', 'Bolsa com 10 po'],
    startingGold: 10,
  },
  13: {
    id_background: 13,
    displayName: 'Soldado',
    skills: ['athletics', 'intimidation'],
    tools: ['Veículos Terrestres', 'Um tipo de kit de jogo'],
    languages: 0,
    feature: {
      name: 'Patente Militar', 
      source: 'Antecedente', 
      description: 'Você tem uma patente militar. Soldados leais a sua antiga organização ainda reconhecem sua autoridade.'
    },
    startingItems: ['Insígnia de Patente', 'Troféu de Inimigo', 'Dados de osso ou baralho', 'Bolsa com 10 po'],
    startingGold: 10,
  },
};

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

//TO DO: Substituir esse array pelo get do banco de dados.
export const WEAPONS: Record<string, WeaponRule> = {
  adaga: {displayName: 'Adaga', damageDie: '1d4', damageType: 'Perfurante', properties: ['Acuidade', 'Leve', 'Arremesso (6/18m)'], isRanged: false, isFinesse: true},
  'espada-curta': {displayName: 'Espada Curta', damageDie: '1d6', damageType: 'Perfurante', properties: ['Acuidade', 'Leve'], isRanged: false, isFinesse: true},
  'espada-longa': {displayName: 'Espada Longa', damageDie: '1d8', damageType: 'Cortante', properties: ['Versátil (1d10)'], isRanged: false, isFinesse: false},
  rapieira: {displayName: 'Rapieira', damageDie: '1d8', damageType: 'Perfurante', properties: ['Acuidade'], isRanged: false, isFinesse: true},
  'machado-de-mao': {displayName: 'Machado de Mão', damageDie: '1d6', damageType: 'Cortante', properties: ['Leve', 'Arremesso (6/18m)'], isRanged: false, isFinesse: false},
  'machado-grande': {displayName: 'Machado Grande', damageDie: '1d12', damageType: 'Cortante', properties: ['Pesada', 'Duas Mãos'], isRanged: false, isFinesse: false},
  'arco-longo': {displayName: 'Arco Longo', damageDie: '1d8', damageType: 'Perfurante', properties: ['Munição (45/180m)', 'Pesada', 'Duas Mãos'], isRanged: true, isFinesse: false},
  'arco-curto': {displayName: 'Arco Curto', damageDie: '1d6', damageType: 'Perfurante', properties: ['Munição (24/96m)', 'Duas Mãos'], isRanged: true, isFinesse: false},
  'besta-leve': {displayName: 'Besta Leve', damageDie: '1d8', damageType: 'Perfurante', properties: ['Munição (24/96m)', 'Recarga', 'Duas Mãos'], isRanged: true, isFinesse: false},
  cajado: {displayName: 'Cajado', damageDie: '1d6', damageType: 'Concussão', properties: ['Versátil (1d8)'], isRanged: false, isFinesse: false},
  bastao: {displayName: 'Bastão', damageDie: '1d6', damageType: 'Concussão', properties: ['Versátil (1d8)'], isRanged: false, isFinesse: false},
  clava: {displayName: 'Clava', damageDie: '1d4', damageType: 'Concussão', properties: ['Leve'], isRanged: false, isFinesse: false},
  maca: {displayName: 'Maça', damageDie: '1d6', damageType: 'Concussão', properties: [], isRanged: false, isFinesse: false},
  lanca: {displayName: 'Lança', damageDie: '1d6', damageType: 'Perfurante', properties: ['Arremesso (6/18m)', 'Versátil (1d8)'], isRanged: false, isFinesse: false},
};

// ---------------------------------------------------------------------------
// Armor
// ---------------------------------------------------------------------------

//TO DO: Substituir esse array pelo get do banco de dados.
export const ARMOR: Record<string, ArmorRule> = {
  nenhuma: {baseAC: 10, armorType: 'none'},
  'couro-batido': {baseAC: 12, armorType: 'light'},
  'camisademalia': {baseAC: 13, armorType: 'medium', maxDexBonus: 2},
  'cotademalia': {baseAC: 16, armorType: 'heavy', maxDexBonus: 0},
  'armaduradeplacas': {baseAC: 18, armorType: 'heavy', maxDexBonus: 0},
  'couro': {baseAC: 11, armorType: 'light'},
  'cotadeescamas': {baseAC: 14, armorType: 'medium', maxDexBonus: 2},
};

// ---------------------------------------------------------------------------
// Skill definitions
// ---------------------------------------------------------------------------

//TO DO: Substituir esse array pelo get do banco de dados.
export const SKILLS: Record<string, StatKeyEn> = {
  acrobatics: 'DEX',
  animal_handling: 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  sleight_of_hand: 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
};

// ---------------------------------------------------------------------------
// Spell slots by class and level (simplified: level 1-5)
// ---------------------------------------------------------------------------

export const SPELL_SLOTS: Record<string, Record<number, Record<string, number>>> = {
  mago: {
    1: {level_1: 2},
    2: {level_1: 3},
    3: {level_1: 4, level_2: 2},
    4: {level_1: 4, level_2: 3},
    5: {level_1: 4, level_2: 3, level_3: 2},
  },
  clerigo: {
    1: {level_1: 2},
    2: {level_1: 3},
    3: {level_1: 4, level_2: 2},
    4: {level_1: 4, level_2: 3},
    5: {level_1: 4, level_2: 3, level_3: 2},
  },
  bardo: {
    1: {level_1: 2},
    2: {level_1: 3},
    3: {level_1: 4, level_2: 2},
    4: {level_1: 4, level_2: 3},
    5: {level_1: 4, level_2: 3, level_3: 2},
  },
  druida: {
    1: {level_1: 2},
    2: {level_1: 3},
    3: {level_1: 4, level_2: 2},
    4: {level_1: 4, level_2: 3},
    5: {level_1: 4, level_2: 3, level_3: 2},
  },
  feiticeiro: {
    1: {level_1: 2},
    2: {level_1: 3},
    3: {level_1: 4, level_2: 2},
    4: {level_1: 4, level_2: 3},
    5: {level_1: 4, level_2: 3, level_3: 2},
  },
  bruxo: {
    1: {level_1: 1},
    2: {level_1: 2},
    3: {level_1: 0, level_2: 2},
    4: {level_1: 0, level_2: 2},
    5: {level_1: 0, level_2: 0, level_3: 2},
  },
};
