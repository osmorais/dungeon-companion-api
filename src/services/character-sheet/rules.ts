/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn, Trait} from '../../models/character-sheet-types';

/** Escolha de 1 ferramenta entre uma lista fixa (ex: Anão — ferreiro/cervejeiro/pedreiro). */
export interface ToolProficiencyChoice {
  options: string[];
}

export interface RaceRule {
  id_race: number;
  displayName: string;
  bonuses: Partial<Record<StatKeyEn, number>>;
  speed: string;
  traits: Trait[];
  weaponProficiencies?: string[];
  skillProficiencies?: string[];
  languages: string[];
  subraces?: string[];
  toolProficiencyChoice?: ToolProficiencyChoice;
}

export interface SubraceRule {
  displayName: string;
  bonuses: Partial<Record<StatKeyEn, number>>;
  traits: Trait[];
  weaponProficiencies?: string[];
  armorProficiencies?: string[];
  toolProficiencies?: string[];
  speedOverride?: string;
  hpBonusPerLevel?: number;
}

export interface ClassLevelFeature {
  name: string;
  description: string;
}

/**
 * Especialização/Aptidão (Ladino nível 1 e 6, Bardo nível 2 e 9) ou Bênção do Conhecimento
 * (Clérigo, Domínio do Conhecimento) — dobra o bônus de proficiência em `count` perícias.
 * Sem `pool`, a escolha é restrita a perícias já treinadas pelo personagem (Especialização/
 * Aptidão). Com `pool` (chaves normalizadas de `normalizeSkill`), concede proficiência nova
 * nessas perícias específicas, mesmo que não fossem treinadas antes (Bênção do Conhecimento).
 */
export interface ExpertiseGrant {
  count: number;
  pool?: string[];
}

export interface ClassLevelData {
  /** Features novas concedidas *neste* nível (vazio se o nível só traz ASI e/ou é escala numérica de recurso). */
  features: ClassLevelFeature[];
  /** Nível de Incremento no Valor de Habilidade (ASI) — tratado genericamente pelo sistema de level-up, não por classe. */
  isAsiLevel: boolean;
  /**
   * Nível concede uma característica de subclasse (ex: "Característica de Caminho Primitivo").
   * O primeiro nível marcado assim pra cada classe (`firstSubclassChoiceLevel`) é onde a
   * subclasse é escolhida; os demais são onde ela concede uma feature nova (ver `SUBCLASSES`).
   */
  isSubclassFeatureLevel: boolean;
  /** Recursos de classe que escalam com o nível (ex: {"Fúrias": "3", "Dano de Fúria": "+2"}), pra exibição na ficha. */
  resources?: Record<string, string>;
  /** Ver `ExpertiseGrant`. */
  expertise?: ExpertiseGrant;
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
  /** Precisa escolher magias preparadas a cada dia (Clérigo/Druida/Paladino/Mago); os demais conjuradores já "sabem" suas magias fixas. */
  preparesSpells: boolean;
  traits: Trait[];
  /**
   * Progressão nível a nível (1-20), fonte: PHB. Preenchida classe por classe, confirmada com o
   * usuário antes de cada uma — ver `docs/dungeon-companion-levelup-plan.md`. Nível 1 aqui
   * duplica o conteúdo de `traits` (mantido por compatibilidade com o fluxo de criação); as duas
   * listas devem ser mantidas em sincronia manualmente pra uma classe já preenchida.
   */
  featuresByLevel?: Record<number, ClassLevelData>;
  /** Escolha de Estilo de Combate — `level` é o nível em que a classe realmente ganha essa escolha (1 pro Guerreiro, 2 pro Paladino/Ranger). */
  fightingStyleChoice?: {level: number; options: string[]};
  startingEquipment: string[];
  /** Riqueza inicial alternativa (tabela "Riqueza Inicial por Classe" do PHB) — rolado pelo jogador na criação, em vez de pegar o equipamento fixo. Ex: Guerreiro = 5d4×10 PO. */
  startingGoldDice: {count: number; sides: number; multiplier: number};
}

export interface SubclassLevelData {
  features: ClassLevelFeature[];
  resources?: Record<string, string>;
  /** Ver `ExpertiseGrant`. */
  expertise?: ExpertiseGrant;
}

/**
 * Conjuração concedida por uma subclasse (ex: Cavaleiro Arcano, Trapaceiro Arcano) em vez de
 * pela classe base — "terço-conjuradores". Sempre no modelo "conhece um total fixo de magias"
 * (igual Bardo/Bruxo/Feiticeiro/Ranger), nunca prepara como Clérigo/Druida/Paladino/Mago.
 */
export interface SubclassSpellcasting {
  spellcastingAbility: StatKeyEn;
  /** id_class de onde a lista de magias elegíveis vem (ex: 9 = Mago). */
  spellListClassId: number;
  /** Restringe a lista acima só a essas escolas (ex: ['Evocação', 'Abjuração']); vazio = lista inteira. */
  allowedSchools: string[];
}

export interface SubclassRule {
  id_subclass: string;
  displayName: string;
  /** Igual `ClassRule.featuresByLevel`, mas só nos níveis de subclasse da classe (ver `isSubclassFeatureLevel`). */
  featuresByLevel: Record<number, SubclassLevelData>;
  spellcasting?: SubclassSpellcasting;
}

/** Primeiro nível marcado com `isSubclassFeatureLevel: true` pra uma classe — é onde a subclasse é escolhida. */
export function firstSubclassChoiceLevel(classRule: ClassRule): number | null {
  const levels = Object.entries(classRule.featuresByLevel ?? {})
    .filter(([, data]) => data.isSubclassFeatureLevel)
    .map(([level]) => parseInt(level, 10));
  return levels.length ? Math.min(...levels) : null;
}

export type RestType = 'short_rest' | 'long_rest';

/**
 * Recurso consumível com contador de uso rastreado na ficha (Fúria/Pontos de Chi/Canalizar
 * Divindade/...) — `key` bate com a mesma chave usada em `resources` de `featuresByLevel`, de
 * onde vem o máximo disponível em cada nível (sem precisar duplicar uma segunda tabela). Uma
 * classe pode ter mais de um recurso rastreável ao mesmo tempo (ex: Guerreiro com Retomar
 * Fôlego + Surto de Ação + Indomável) — por isso a lista, em vez de um só por classe.
 */
export interface TrackableResource {
  key: string;
  rechargeOn: RestType;
}

export const TRACKABLE_RESOURCES: Record<number, TrackableResource[]> = {
  1: [{key: 'Fúrias', rechargeOn: 'long_rest'}], // Bárbaro
  3: [{key: 'Mestre Místico', rechargeOn: 'long_rest'}], // Bruxo (nv20)
  // Feiticeiro — Restauração Mística (nv20) devolveria só 4 pontos num descanso curto, não
  // recarrega tudo; o motor só modela recarga total, então isso fica de fora (simplificação
  // aceita, só afeta personagem de nível 20 tomando um descanso curto).
  6: [{key: 'Pontos de Feitiçaria', rechargeOn: 'long_rest'}],
  // Bardo — RAW só recarrega em descanso curto a partir do nível 5 (Fonte de Inspiração); como
  // o motor de recursos não modela recarga condicionada a nível, simplifica pra sempre recarregar
  // em descanso curto (levemente generoso nos níveis 1-4, decisão aceita no escopo "Média").
  2: [{key: 'Inspiração Bárdica', rechargeOn: 'short_rest'}],
  4: [{key: 'Canalizar Divindade', rechargeOn: 'short_rest'}], // Clérigo
  5: [
    {key: 'Forma Selvagem', rechargeOn: 'short_rest'},
    // Recuperação Natural só existe no Círculo da Terra — a chave só aparece no `resources`
    // dessa subclasse (mesmo esquema da Integridade Corporal do Monge).
    {key: 'Recuperação Natural', rechargeOn: 'long_rest'},
  ],
  7: [
    // Guerreiro — os três recarregam em descanso curto ou longo, exceto Indomável (só longo).
    {key: 'Retomar Fôlego', rechargeOn: 'short_rest'},
    {key: 'Surto de Ação', rechargeOn: 'short_rest'},
    {key: 'Indomável', rechargeOn: 'long_rest'},
  ],
  // Mago — RAW é 1×/dia (reseta em descanso longo); a recuperação em si (qual espaço volta)
  // continua manual, o jogador ajusta pelo próprio controle de espaços de magia já existente.
  9: [{key: 'Recuperação Arcana', rechargeOn: 'long_rest'}],
  10: [
    {key: 'Pontos de Chi', rechargeOn: 'short_rest'}, // Monge
    // Integridade Corporal só existe nas subclasses que a concedem (Mão Aberta) — a chave só
    // aparece no `resources` delas, então não vaza pros monges de outra tradição (ver
    // `buildResourceTrackers`, que mescla resources de classe + subclasse antes de resolver).
    {key: 'Integridade Corporal', rechargeOn: 'long_rest'},
  ],
  11: [
    // Paladino — os três só recarregam em descanso longo.
    {key: 'Sentido Divino', rechargeOn: 'long_rest'},
    {key: 'Curar pelo Toque', rechargeOn: 'long_rest'},
    {key: 'Toque Purificador', rechargeOn: 'long_rest'},
  ],
};

/**
 * `null` = nem classe nem subclasse têm esse recurso nesse nível; `'unlimited'` = usos
 * ilimitados (ex: Fúria do Bárbaro no nível 20). O valor em `resources` normalmente é um número
 * fixo por nível (tabela), mas pode ser uma fórmula `mod:CHA` ou `mod:CHA+1` (Inspiração de
 * Bardo = mod. Carisma; Sentido Divino do Paladino = 1 + mod. Carisma) — nesse caso `stats`
 * (pontuação bruta do atributo, não o modificador já calculado) precisa ser informado.
 * `resources` já vem mesclado (classe + subclasse, ver `buildResourceTrackers`) — isso é o que
 * permite um recurso existir só numa subclasse específica (ex: Integridade Corporal, só na Mão
 * Aberta) sem vazar pras outras subclasses da mesma classe.
 */
export function maxTrackableResourceUses(
  resources: Record<string, string> | undefined,
  resourceKey: string,
  stats?: Partial<Record<StatKeyEn, number>>,
): number | 'unlimited' | null {
  const raw = resources?.[resourceKey];
  if (!raw) return null;
  if (raw.toLowerCase() === 'ilimitadas') return 'unlimited';
  const modMatch = /^mod:(STR|DEX|CON|INT|WIS|CHA)(?:\+(\d+))?$/.exec(raw);
  if (modMatch) {
    const score = stats?.[modMatch[1] as StatKeyEn] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    const bonus = modMatch[2] ? parseInt(modMatch[2], 10) : 0;
    return Math.max(1, modifier + bonus);
  }
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Característica ativável gastando um recurso consumível da classe (hoje só as de Pontos de
 * Chi do Monge — Rajada de Golpes/Defesa Paciente/Passo do Vento/Ataque Atordoante/Corpo Vazio).
 * `resourceKey` diz qual dos `TRACKABLE_RESOURCES` daquela classe ela consome (útil quando a
 * classe tem mais de um recurso rastreável). Não inclui as reativas (Defletir Projéteis,
 * rerolagem de Alma de Diamante), que só fazem sentido em resposta a um gatilho específico e
 * continuam só como texto informativo.
 */
export interface ChiAbility {
  name: string;
  description: string;
  chiCost: number;
  levelLearned: number;
  resourceKey: string;
  /** Se definido, só existe pra essa subclasse (ex: Palma Vibrante = só Mão Aberta); ausente = disponível pra qualquer subclasse da classe. */
  subclassId?: string;
}

export const MONK_CHI_ABILITIES: ChiAbility[] = [
  {
    name: 'Rajada de Golpes',
    description: 'Imediatamente após você realizar a ação de Ataque no seu turno, você pode gastar 1 ponto de chi para realizar dois golpes desarmados com uma ação bônus.',
    chiCost: 1,
    levelLearned: 2,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Defesa Paciente',
    description: 'Você pode gastar 1 ponto de chi para realizar a ação de Esquivar, com uma ação bônus, no seu turno.',
    chiCost: 1,
    levelLearned: 2,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Passo do Vento',
    description: 'Você pode gastar 1 ponto de chi para realizar a Ação de Desengajar ou Disparada, com uma ação bônus, no seu turno, e sua distância de salto é dobrada nesse turno.',
    chiCost: 1,
    levelLearned: 2,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Ataque Atordoante',
    description: 'Você pode gastar 1 ponto de chi para tentar atordoar um alvo que atingir com um ataque corpo a corpo. O alvo deve fazer um teste de resistência de Constituição ou ficará atordoado até o final do seu próximo turno.',
    chiCost: 1,
    levelLearned: 5,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Corpo Vazio (Invisibilidade)',
    description: 'Você pode gastar 4 pontos de chi para se tornar invisível por 1 minuto.',
    chiCost: 4,
    levelLearned: 18,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Corpo Vazio (Projeção Astral)',
    description: 'Você pode gastar 8 pontos de chi para viajar astralmente (efeito similar ao da magia Projeção Astral, sem exigir componentes materiais).',
    chiCost: 8,
    levelLearned: 18,
    resourceKey: 'Pontos de Chi',
  },
  {
    name: 'Artes Sombrias',
    description: 'Você pode gastar 2 pontos de chi para conjurar trevas, visão no escuro, passos sem rastro ou silêncio, sem componentes materiais.',
    chiCost: 2,
    levelLearned: 3,
    resourceKey: 'Pontos de Chi',
    subclassId: 'sombra',
  },
  {
    name: 'Técnica de Mão Oculta',
    description: 'Quando acertar uma criatura com um ataque garantido pela ação de Rajada de Golpes, pode gastar 1 ponto de chi para impor o efeito da magia escuridão num espaço adjacente a ela ou que ela ocupe.',
    chiCost: 1,
    levelLearned: 11,
    resourceKey: 'Pontos de Chi',
    subclassId: 'sombra',
  },
  {
    name: 'Palma Vibrante',
    description: 'Quando acertar uma criatura com um ataque corpo-a-corpo desarmado, pode gastar 3 pontos de chi para iniciar vibrações letais que duram dias iguais ao seu nível de monge. Depois, pode usar uma ação para forçar um teste de resistência de Constituição (CD de golpes de chi): se falhar, a criatura cai a 0 PV; se for bem-sucedida, sofre 10d10 de dano de concussão.',
    chiCost: 3,
    levelLearned: 17,
    resourceKey: 'Pontos de Chi',
    subclassId: 'mao-aberta',
  },
];

export function getKnownChiAbilities(classKey: number, level: number, idSubclass?: string | null): ChiAbility[] {
  if (classKey !== CLASSES[10].id_class) return [];
  return MONK_CHI_ABILITIES.filter(a => level >= a.levelLearned && (!a.subclassId || a.subclassId === idSubclass));
}

/**
 * Segredos Mágicos (Bardo, nível 10/14/18): as 2 magias aprendidas nesses níveis podem vir de
 * QUALQUER lista de classe conjuradora, não só a do bardo — o resto do fluxo de escolha de
 * magia já funciona por contagem (`Magias Conhecidas` em `resources`), só falta abrir o pool.
 */
export function hasArcaneSecretsChoice(classKey: number, level: number): boolean {
  return classKey === CLASSES[2].id_class && [10, 14, 18].includes(level);
}

/** XP total mínimo pra estar *no* nível (tabela oficial do PHB, igual pra todas as classes). */
export const XP_THRESHOLDS: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000, 9: 48000, 10: 64000,
  11: 85000, 12: 100000, 13: 120000, 14: 140000, 15: 165000, 16: 195000, 17: 225000, 18: 265000,
  19: 305000, 20: 355000,
};

/** `null` já está no nível máximo (20) — não existe "próximo nível" pra exigir XP. */
export function xpNeededForLevel(level: number): number | null {
  return XP_THRESHOLDS[level + 1] ?? null;
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

export const RACES: Record<number, RaceRule> = {
  1: {
    id_race: 1,
    displayName: 'Anão',
    bonuses: {CON: 2},
    speed: '7,5m',
    languages: ['Comum', 'Anão'],
    subraces: ['anao-da-colina', 'anao-da-montanha'],
    weaponProficiencies: ['Machados de Batalha', 'Machadinhas', 'Martelos leves', 'Martelos de guerra'],
    traits: [
      {name: 'Visão no Escuro', source: 'Raça', description: 'Você enxerga na meia-luz a até 18 metros como se fosse luz plena e na escuridão como se fosse meia-luz.'},
      {name: 'Resistência Anã', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra veneno e resistência a dano de veneno.'},
      {name: 'Especialização em Rochas', source: 'Raça', description: 'Sempre que você realizar um teste de Inteligência (História) relacionado à origem \
        de um trabalho em pedra, você é considerado proficiente na perícia História e adiciona o dobro do seu \
        bônus de proficiência ao teste, ao invés do seu bônus de proficiência normal.'},
      {name: 'Proficiência com Ferramentas', source: 'Raça', description: 'Você tem \
        proficiência em uma ferramenta de artesão à sua escolha \
        entre: ferramentas de ferreiro, suprimentos de cervejeiro \
        ou ferramentas de pedreiro. '},
    ],
    toolProficiencyChoice: {options: ['Ferramentas de Ferreiro', 'Suprimentos de Cervejeiro', 'Ferramentas de Pedreiro']},
  },
  2: {
    id_race: 2,
    displayName: 'Elfo',
    bonuses: {DEX: 2},
    speed: '9m',
    languages: ['Comum', 'Élfico'],
    subraces: ['alto-elfo', 'elfo-da-floresta'],
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
    subraces: ['halfling-pes-leves', 'halfling-robusto'],
    traits: [
      {name: 'Sortudo', source: 'Raça', description: 'Quando você rola 1 num d20 em um teste de atributo, teste de resistência ou jogada de ataque, você pode rolar novamente o dado e deve usar o novo resultado.'},
      {name: 'Bravura', source: 'Raça', description: 'Você tem vantagem em testes de resistência contra medo.'},
      {name: 'Agilidade Halfling', source: 'Raça', description: 'Você pode mover-se através do \
        espaço de qualquer criatura que for de um tamanho maior que o seu.'},
    ],
  },
  4: {
    id_race: 4,
    displayName: 'Draconato',
    bonuses: {STR: 2, CHA: 1},
    speed: '9m',
    languages: ['Comum', 'Dracônico'],
    traits: [
      {name: 'Ancestral Dracônica', source: 'Raça', description: 'Você tem ancestralidade dracônica. Você pode usar uma ação para exalar energia destrutiva (Sopro de Fogo, CD 13).'},
      {name: 'Resistência Dracônica', source: 'Raça', description: 'Você tem resistência ao tipo de dano associado à sua ancestralidade dracônica.'},
      {name: 'Arma de Sopro', source: 'Raça', description: 'Você pode usar uma ação para exalar energia destrutiva. Seu ancestral dracônico \
        determina o tamanho, formado e tipo de dano que você expele. Quando você usa sua arma de sopro, cada criatura na área exalada deve \
        realizar um teste de resistência, o tipo do teste é determinado pelo seu ancestral dracônico. A CD do teste de resistência é 8 + seu modificador de \
        Constituição + seu bônus de proficiência. Uma criatura sofre 2d6 de dano num fracasso e metade desse dano num sucesso. O dano aumenta para 3d6 no 6° nível,\
        4d6 no 11° nível e 5d6 no 16° nível. Depois de usar sua arma de sopro, você não poderá utilizá-la novamente até completar um descanso curto ou longo. '},
    ],
  },
  5: {
    id_race: 5,
    displayName: 'Gnomo',
    bonuses: {INT: 2},
    speed: '7,5m',
    languages: ['Comum', 'Gnômico'],
    subraces: ['gnomo-das-rochas', 'gnomo-das-florestas'],
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
      {name: 'Resistência Implacável', source: 'Raça', description: 'Quando um dano te reduziria a 0 pontos de vida, você pode usar sua reação para cair a 1 ponto de vida em vez disso.'},
      {name: 'Ataques Selvagens', source: 'Raça', description: 'Quando você atinge um ataque crítico com uma arma corpo-a-corpo, você pode rolar um \
        dos dados de dano da arma mais uma vez e adicioná-lo ao dano extra causado pelo acerto crítico. '},
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
  'anao-da-colina':      {displayName: 'Anão da Colina',      bonuses: {WIS: 1}, hpBonusPerLevel: 1, traits: [{name: 'Tenacidade Anã', source: 'Sub-raça', description: 'Seu máximo de pontos de vida aumenta em 1, e ele aumenta em 1 toda vez que você ganha um nível.'}]},
  'anao-da-montanha':    {displayName: 'Anão da Montanha',    bonuses: {STR: 2}, armorProficiencies: ['Leve', 'Média'], traits: [{name: 'Treinamento com Armaduras Anão', source: 'Sub-raça', description: 'Você tem proficiência com armaduras leves e médias.'}]},
  'alto-elfo':           {displayName: 'Alto Elfo',           bonuses: {INT: 1}, weaponProficiencies: ['Espadas Longas', 'Espadas Curtas', 'Arcos Longos', 'Arcos Curtos'], traits: [{name: 'Truque', source: 'Sub-raça', description: 'Você conhece um truque de mago à sua escolha.'}]},
  'elfo-da-floresta':    {displayName: 'Elfo da Floresta',    bonuses: {WIS: 1}, speedOverride: '10,5m', weaponProficiencies: ['Espadas Longas', 'Espadas Curtas', 'Arcos Longos', 'Arcos Curtos'], traits: [{name: 'Passo Veloz', source: 'Sub-raça', description: 'Seu deslocamento base aumenta para 10,5m (35 pés).'}]},
  'halfling-pes-leves':  {displayName: 'Halfling Pés-Leves',  bonuses: {CHA: 1}, traits: [{name: 'Furtividade Natural', source: 'Sub-raça', description: 'Você pode tentar se esconder mesmo quando está obscurecido apenas por uma criatura que seja pelo menos um tamanho maior que você.'}]},
  'halfling-robusto':    {displayName: 'Halfling Robusto',    bonuses: {CON: 1}, traits: [{name: 'Resistência Robusto', source: 'Sub-raça', description: 'Você tem vantagem em testes de resistência contra veneno e tem resistência a dano de veneno.'}]},
  'gnomo-das-rochas':    {displayName: 'Gnomo das Rochas',    bonuses: {CON: 1}, toolProficiencies: ['Ferramentas de Artesão'], traits: [{name: 'Conhecimento Artificial', source: 'Sub-raça', description: 'Você tem proficiência com ferramentas de artesão.'}]},
  'gnomo-das-florestas': {displayName: 'Gnomo das Florestas', bonuses: {DEX: 1}, traits: [{name: 'Ilusão Natural', source: 'Sub-raça', description: 'Você conhece o truque de mago Ilusão Menor.'}]},
};

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

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
    preparesSpells: false,
    traits: [
      {name: 'Fúria', source: 'Classe', description: 'Em seu turno, você pode entrar em fúria como uma ação bônus. Enquanto em fúria, você tem vantagem em testes de Força e jogadas de ataque de Força, e recebe bônus nas jogadas de dano.'},
      {name: 'Defesa sem Armadura', source: 'Classe', description: 'Enquanto não estiver usando armadura, sua CA é igual a 10 + modificador de Destreza + modificador de Constituição.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Fúria', description: 'Em seu turno, você pode entrar em fúria como uma ação bônus. Enquanto em fúria, você tem vantagem em testes de Força e jogadas de ataque de Força, e recebe bônus nas jogadas de dano.'},
          {name: 'Defesa sem Armadura', description: 'Enquanto não estiver usando armadura, sua CA é igual a 10 + modificador de Destreza + modificador de Constituição.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '2', 'Dano de Fúria': '+2'},
      },
      2: {
        features: [
          {name: 'Ataque Descuidado', description: 'No início do seu turno, você pode decidir atacar de forma imprudente. Isso lhe dá vantagem nas jogadas de ataque corpo a corpo usando Força durante esse turno, mas jogadas de ataque contra você têm vantagem até seu próximo turno.'},
          {name: 'Sentido de Perigo', description: 'Você tem vantagem em testes de resistência de Destreza contra efeitos que você pode ver, como armadilhas e magias, desde que não esteja cego, surdo ou incapacitado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '2', 'Dano de Fúria': '+2'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Fúrias': '3', 'Dano de Fúria': '+2'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '3', 'Dano de Fúria': '+2'},
      },
      5: {
        features: [
          {name: 'Ataque Extra', description: 'Você pode atacar duas vezes, em vez de uma, sempre que fizer a ação de Atacar em seu turno.'},
          {name: 'Movimento Rápido', description: 'Sua velocidade aumenta em 3 metros enquanto você não estiver usando armadura pesada.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '3', 'Dano de Fúria': '+2'},
      },
      6: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+2'},
      },
      7: {
        features: [
          {name: 'Instinto Selvagem', description: 'Seus instintos são tão afiados que você ganha vantagem em testes de iniciativa. Além disso, se estiver surpreso no início do combate mas não incapacitado, você ainda pode agir normalmente no seu primeiro turno, contanto que entre em fúria antes de fazer qualquer outra coisa nesse turno.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+2'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+2'},
      },
      9: {
        features: [
          {name: 'Crítico Brutal (+1 dado)', description: 'Você pode rolar um dado de dano adicional quando determinar o dano extra por um acerto crítico com um ataque corpo a corpo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+3'},
      },
      10: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+3'},
      },
      11: {
        features: [
          {name: 'Fúria Implacável', description: 'Se você tiver 0 pontos de vida enquanto estiver em fúria e não morrer imediatamente, pode fazer um teste de resistência de Constituição (CD 10, +5 a cada uso subsequente desde o último descanso longo) para cair a 1 ponto de vida em vez disso.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '4', 'Dano de Fúria': '+3'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '5', 'Dano de Fúria': '+3'},
      },
      13: {
        features: [
          {name: 'Crítico Brutal (+2 dados)', description: 'O dado de dano adicional em acertos críticos com ataques corpo a corpo aumenta para dois dados.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '5', 'Dano de Fúria': '+3'},
      },
      14: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Fúrias': '5', 'Dano de Fúria': '+3'},
      },
      15: {
        features: [
          {name: 'Fúria Persistente', description: 'Sua fúria é tão poderosa que agora só termina antecipadamente se você ficar inconsciente ou decidir terminá-la.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '5', 'Dano de Fúria': '+3'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '5', 'Dano de Fúria': '+3'},
      },
      17: {
        features: [
          {name: 'Crítico Brutal (+3 dados)', description: 'O dado de dano adicional em acertos críticos com ataques corpo a corpo aumenta para três dados.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '6', 'Dano de Fúria': '+4'},
      },
      18: {
        features: [
          {name: 'Força Indomável', description: 'Quando você fizer um teste de Força durante sua fúria e o total for menor que sua pontuação de Força, pode usar essa pontuação no lugar do total.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '6', 'Dano de Fúria': '+4'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': '6', 'Dano de Fúria': '+4'},
      },
      20: {
        features: [
          {name: 'Campeão Primitivo', description: 'Você se torna um verdadeiro exemplar da força primitiva. Suas pontuações de Força e Constituição aumentam em 4 (o máximo para essas pontuações passa a ser 24).'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Fúrias': 'Ilimitadas', 'Dano de Fúria': '+4'},
      },
    },
    startingEquipment: ['Machado Grande', 'Dois Machados de Mão', 'Pacote de Aventureiro', 'Quatro Azagaias'],
    startingGoldDice: {count: 2, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Você aprendeu a desvendar e reconfigurar a magia em si. Você pode lançar truques e magias niveladas.'},
      {name: 'Inspiração Bárdica', source: 'Classe', description: 'Você pode inspirar outros através de palavras ou música. Para tanto, use uma ação bônus no seu turno para escolher uma criatura que não seja você numa distância de 18 metros.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Conjuração', description: 'Você aprendeu a desvendar e reconfigurar a magia em si. Você pode lançar truques e magias niveladas.'},
          {name: 'Inspiração Bárdica (d6)', description: 'Você pode inspirar outros através de palavras ou música. Use uma ação bônus para escolher uma criatura que não seja você a até 18 metros. Ela ganha um d6 de inspiração bárdica, que pode somar a um teste de habilidade, ataque ou teste de resistência.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '4', 'Inspiração Bárdica': 'mod:CHA'},
      },
      2: {
        features: [
          {name: 'Versatilidade', description: 'Você pode somar metade do seu bônus de proficiência (arredondado para baixo) a qualquer teste de habilidade que fizer e que ainda não inclua seu bônus de proficiência.'},
          {name: 'Canção do Descanso (d6)', description: 'Durante um descanso curto, se você ou uma criatura amigável que possa te ouvir gastar Dados de Vida para recuperar pontos de vida ao final do descanso, recupera pontos de vida extras iguais a 1d6.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '5', 'Inspiração Bárdica': 'mod:CHA'},
      },
      3: {
        features: [
          {name: 'Aptidão', description: 'Escolha duas das suas proficiências em perícias. Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas perícias.'},
        ],
        expertise: {count: 2},
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '6', 'Inspiração Bárdica': 'mod:CHA'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '7', 'Inspiração Bárdica': 'mod:CHA'},
      },
      5: {
        features: [
          {name: 'Inspiração Bárdica (d8)', description: 'O dado de Inspiração Bárdica se torna um d8.'},
          {name: 'Fonte de Inspiração', description: 'Você recupera todos os usos gastos de Inspiração Bárdica quando termina um descanso curto ou longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '8', 'Inspiração Bárdica': 'mod:CHA'},
      },
      6: {
        features: [
          {name: 'Canção de Proteção', description: 'Se você ou uma criatura amigável a até 9 metros que possa te ouvir for atingida por um ataque, você pode usar sua reação e gastar um uso de Inspiração Bárdica pra lhe dar resistência temporária contra esse dano.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '9', 'Inspiração Bárdica': 'mod:CHA'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '10', 'Inspiração Bárdica': 'mod:CHA'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '11', 'Inspiração Bárdica': 'mod:CHA'},
      },
      9: {
        features: [
          {name: 'Canção do Descanso (d8)', description: 'O dado extra de recuperação da Canção do Descanso se torna um d8.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '12', 'Inspiração Bárdica': 'mod:CHA'},
      },
      10: {
        features: [
          {name: 'Inspiração Bárdica (d10)', description: 'O dado de Inspiração Bárdica se torna um d10.'},
          {name: 'Aptidão', description: 'Escolha mais duas das suas proficiências em perícias. Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas proficiências escolhidas.'},
          {name: 'Segredos Mágicos', description: 'Você aprende duas magias de qualquer classe conjuradora, escolhendo entre a lista de magias dessa classe. Uma magia escolhida dessa forma conta como magia de bardo pra você.'},
        ],
        expertise: {count: 2},
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '14', 'Inspiração Bárdica': 'mod:CHA'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '15', 'Inspiração Bárdica': 'mod:CHA'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '15', 'Inspiração Bárdica': 'mod:CHA'},
      },
      13: {
        features: [
          {name: 'Canção do Descanso (d10)', description: 'O dado extra de recuperação da Canção do Descanso se torna um d10.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '16', 'Inspiração Bárdica': 'mod:CHA'},
      },
      14: {
        features: [
          {name: 'Segredos Mágicos', description: 'Você aprende mais duas magias de qualquer classe conjuradora, como no nível 10.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '18', 'Inspiração Bárdica': 'mod:CHA'},
      },
      15: {
        features: [
          {name: 'Inspiração Bárdica (d12)', description: 'O dado de Inspiração Bárdica se torna um d12.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '19', 'Inspiração Bárdica': 'mod:CHA'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '19', 'Inspiração Bárdica': 'mod:CHA'},
      },
      17: {
        features: [
          {name: 'Canção do Descanso (d12)', description: 'O dado extra de recuperação da Canção do Descanso se torna um d12.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '20', 'Inspiração Bárdica': 'mod:CHA'},
      },
      18: {
        features: [
          {name: 'Segredos Mágicos', description: 'Você aprende mais duas magias de qualquer classe conjuradora, como no nível 10.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '22', 'Inspiração Bárdica': 'mod:CHA'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '22', 'Inspiração Bárdica': 'mod:CHA'},
      },
      20: {
        features: [
          {name: 'Inspiração Superior', description: 'Quando você rolar iniciativa e não tiver nenhum uso de Inspiração Bárdica restante, recupera um uso.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '22', 'Inspiração Bárdica': 'mod:CHA'},
      },
    },
    startingEquipment: ['Rapieira', 'Instrumento Musical', 'Couro Batido', 'Pacote do Diplomata'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Patrono Sobrenatural', source: 'Classe', description: 'Você fez um pacto com um ser sobrenatural de seu nível de poder, um ser cujos objetivos e motivações são diferentes dos mortais.'},
      {name: 'Magia do Pacto', source: 'Classe', description: 'Seu arcano pesquisado concedeu-lhe facilidade com feitiços. Você pode lançar feitiços de bruxo.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Magia do Pacto', description: 'Seu arcano pesquisado concedeu-lhe facilidade com feitiços. Você pode lançar feitiços de bruxo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '2', 'Invocações Conhecidas': '–'},
      },
      2: {
        features: [
          {name: 'Invocações Místicas', description: 'Você ganha duas invocações místicas de sua escolha. Sua quantidade de invocações conhecidas aumenta conforme você sobe de nível nesta classe.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '3', 'Invocações Conhecidas': '2'},
      },
      3: {
        features: [
          {name: 'Dádiva do Pacto', description: 'Seu patrono lhe concede um benefício especial: escolha o Pacto da Corrente, o Pacto da Lâmina ou o Pacto do Grimório.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '4', 'Invocações Conhecidas': '2'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '5', 'Invocações Conhecidas': '2'},
      },
      5: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '6', 'Invocações Conhecidas': '3'},
      },
      6: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '7', 'Invocações Conhecidas': '3'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '8', 'Invocações Conhecidas': '4'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '9', 'Invocações Conhecidas': '4'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '10', 'Invocações Conhecidas': '5'},
      },
      10: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '10', 'Invocações Conhecidas': '5'},
      },
      11: {
        features: [
          {name: 'Arcana Mística (6º nível)', description: 'Você pega uma magia de 6º nível de qualquer classe de conjurador pra adicionar à sua lista de magias de bruxo. Você pode lançá-la uma vez sem gastar um espaço de magia, recuperando esse uso após um descanso longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '11', 'Invocações Conhecidas': '5'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '11', 'Invocações Conhecidas': '6'},
      },
      13: {
        features: [
          {name: 'Arcana Mística (7º nível)', description: 'Como a Arcana Mística de 6º nível, mas escolhendo uma magia de 7º nível.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '12', 'Invocações Conhecidas': '6'},
      },
      14: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '12', 'Invocações Conhecidas': '7'},
      },
      15: {
        features: [
          {name: 'Arcana Mística (8º nível)', description: 'Como a Arcana Mística de 6º nível, mas escolhendo uma magia de 8º nível.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '13', 'Invocações Conhecidas': '7'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '13', 'Invocações Conhecidas': '7'},
      },
      17: {
        features: [
          {name: 'Arcana Mística (9º nível)', description: 'Como a Arcana Mística de 6º nível, mas escolhendo uma magia de 9º nível.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '14', 'Invocações Conhecidas': '8'},
      },
      18: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '14', 'Invocações Conhecidas': '8'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '15', 'Invocações Conhecidas': '8'},
      },
      20: {
        features: [
          {name: 'Mestre Místico', description: 'Você pode gastar 1 minuto entoando encantamentos místicos. Ao final desse tempo, recupera todos os espaços de magia gastos por Magia do Pacto. Depois de usar essa característica, só pode fazê-lo novamente após um descanso longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '15', 'Invocações Conhecidas': '8', 'Mestre Místico': '1'},
      },
    },
    startingEquipment: ['Besta Leve com 20 virotes', 'Bastão', 'Couro Batido', 'Foco Arcano', 'Pacote do Estudioso'],
    startingGoldDice: {count: 4, sides: 4, multiplier: 10},
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
    preparesSpells: true,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Como um conduit para o poder divino, você pode lançar feitiços de clérigo.'},
      {name: 'Domínio Divino', source: 'Classe', description: 'Escolha um domínio divino relacionado à sua divindade. Sua escolha lhe concede truques de domínio e outras características quando você a faz, no nível 1.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Conjuração', description: 'Como um conduit para o poder divino, você pode lançar feitiços de clérigo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3'},
      },
      2: {
        features: [
          {name: 'Canalizar Divindade (1/descanso)', description: 'Você ganha a habilidade de canalizar energia divina diretamente da sua divindade, usando essa energia para alimentar efeitos mágicos. Você começa com duas opções: Expulsar Mortos-Vivos e uma opção determinada pelo seu domínio divino. Você pode usar Canalizar Divindade uma vez, recuperando o uso após um descanso curto ou longo.'},
          {name: 'Canalizar Divindade: Expulsar Mortos-Vivos', description: 'Como sua ação no turno, você exibe seu símbolo sagrado e entoa uma prece contra os mortos-vivos. Cada morto-vivo capaz de vê-lo ou ouvi-lo e que esteja a até 9 metros de você deve realizar uma salvaguarda de Sabedoria. Em caso de falha, o morto-vivo é expulso por 1 minuto ou até sofrer algum dano. Uma criatura expulsa deve gastar seus turnos tentando se distanciar ao máximo de você, não podendo se aproximar a menos de 9 metros por vontade própria. Ela também não pode usar reações, podendo usar somente a ação Correr ou tentar escapar de qualquer efeito que a impeça de se mover. Caso não possa se mover, a criatura pode usar a ação Esquivar.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3', 'Canalizar Divindade': '1'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Canalizar Divindade': '1'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '1'},
      },
      5: {
        features: [
          {name: 'Destruir Mortos-Vivos (ND 1/2)', description: 'Quando um morto-vivo falha no teste de resistência contra sua opção Expulsar Mortos-Vivos de Canalizar Divindade, ele é instantaneamente destruído se seu grau de desafio for 1/2 ou menor.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '1'},
      },
      6: {
        features: [
          {name: 'Canalizar Divindade (2/descanso)', description: 'Você pode usar Canalizar Divindade duas vezes entre descansos, a partir deste nível.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '2'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '2'},
      },
      8: {
        features: [
          {name: 'Destruir Mortos-Vivos (ND 1)', description: 'O limiar de grau de desafio pra destruição instantânea de Expulsar Mortos-Vivos aumenta pra 1.'},
        ],
        isAsiLevel: true,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '2'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Canalizar Divindade': '2'},
      },
      10: {
        features: [
          {name: 'Intervenção Divina', description: 'Você pode apelar à sua divindade para intervir em seu favor quando sua necessidade for grande. Descrevendo a intervenção que você procura, role porcentagem: se o resultado for igual ou menor que seu nível de clérigo, sua divindade intervém. Depois de usar com sucesso, precisa esperar 7 dias antes de tentar de novo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      11: {
        features: [
          {name: 'Destruir Mortos-Vivos (ND 2)', description: 'O limiar de grau de desafio pra destruição instantânea de Expulsar Mortos-Vivos aumenta pra 2.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      14: {
        features: [
          {name: 'Destruir Mortos-Vivos (ND 3)', description: 'O limiar de grau de desafio pra destruição instantânea de Expulsar Mortos-Vivos aumenta pra 3.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      17: {
        features: [
          {name: 'Destruir Mortos-Vivos (ND 4)', description: 'O limiar de grau de desafio pra destruição instantânea de Expulsar Mortos-Vivos aumenta pra 4.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '2'},
      },
      18: {
        features: [
          {name: 'Canalizar Divindade (3/descanso)', description: 'Você pode usar Canalizar Divindade três vezes entre descansos, a partir deste nível.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '3'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '3'},
      },
      20: {
        features: [
          {name: 'Aprimoramento de Intervenção Divina', description: 'Sua chamada à sua divindade por intervenção agora é bem-sucedida automaticamente, sem precisar de rolagem de porcentagem.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Canalizar Divindade': '3'},
      },
    },
    startingEquipment: ['Maça', 'Escudo', 'Cota de Malha', 'Pacote do Padre'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 10},
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
    preparesSpells: true,
    traits: [
      {name: 'Druidico', source: 'Classe', description: 'Você conhece Druidico, a linguagem secreta dos druidas.'},
      {name: 'Conjuração', source: 'Classe', description: 'Em harmonia com a natureza, você pode lançar feitiços de druida.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Druidico', description: 'Você conhece Druidico, a linguagem secreta dos druidas.'},
          {name: 'Conjuração', description: 'Em harmonia com a natureza, você pode lançar feitiços de druida.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2'},
      },
      2: {
        features: [
          {name: 'Forma Selvagem', description: 'Você pode usar uma ação para se transformar magicamente em uma forma de besta que já tenha visto antes. Pode usar essa característica duas vezes, recuperando os usos gastos ao terminar um descanso curto ou longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '2', 'Forma Selvagem': '2'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '2', 'Forma Selvagem': '2'},
      },
      4: {
        features: [
          {name: 'Aprimoramento de Forma Selvagem', description: 'Você pode se transformar em uma besta com um grau de desafio máximo maior, e algumas restrições de Forma Selvagem deixam de se aplicar conforme seu nível de druida aumenta.'},
        ],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      5: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      6: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      8: {
        features: [
          {name: 'Aprimoramento de Forma Selvagem', description: 'O grau de desafio máximo e as restrições de Forma Selvagem melhoram de novo, conforme seu nível de druida aumenta.'},
        ],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Forma Selvagem': '2'},
      },
      10: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      14: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      18: {
        features: [
          {name: 'Corpo Atemporal', description: 'A magia da natureza que você canaliza dá a você o dom de vida longa. Para cada década que se passa, seu corpo envelhece apenas um ano.'},
          {name: 'Magias da Besta', description: 'Você pode conjurar muitas de suas magias de druida em qualquer forma que assumir com Forma Selvagem.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': '2'},
      },
      20: {
        features: [
          {name: 'Arquidruida', description: 'Você pode usar Forma Selvagem um número ilimitado de vezes. Além disso, pode ignorar os componentes verbais e somáticos de suas magias de druida, assim como quaisquer componentes materiais que não sejam consumidos pela magia e não tenham um custo em ouro especificado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Forma Selvagem': 'Ilimitadas'},
      },
    },
    startingEquipment: ['Escudo de Madeira', 'Cimitarra', 'Couro Batido', 'Pacote do Explorador'],
    startingGoldDice: {count: 2, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Origem de Feitiçaria', source: 'Classe', description: 'Escolha uma origem de feitiçaria que descreve a fonte de seu poder mágico inato. Sua escolha concede características a você no 1º nível e novamente nos níveis 6, 14 e 18.'},
      {name: 'Conjuração', source: 'Classe', description: 'A magia é parte de você, fluindo diretamente da sua herança. Você pode lançar feitiços de feiticeiro.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Conjuração', description: 'A magia é parte de você, fluindo diretamente da sua herança. Você pode lançar feitiços de feiticeiro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '2', 'Pontos de Feitiçaria': '–'},
      },
      2: {
        features: [
          {name: 'Fonte de Magia', description: 'Você pode acessar uma fonte de magia bruta dentro de si mesmo, representada por pontos de feitiçaria, que permitem criar uma variedade de efeitos mágicos. Você também pode converter espaços de magia não utilizados em pontos de feitiçaria, e pontos de feitiçaria de volta em espaços de magia.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '3', 'Pontos de Feitiçaria': '2'},
      },
      3: {
        features: [
          {name: 'Metamágica', description: 'Você ganha a capacidade de distorcer suas magias de acordo com suas necessidades pessoais. Você ganha duas opções de Metamágica à sua escolha. Só pode usar uma opção de Metamágica por magia, a menos que a opção diga o contrário.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '4', 'Pontos de Feitiçaria': '3'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '5', 'Pontos de Feitiçaria': '4'},
      },
      5: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '6', 'Pontos de Feitiçaria': '5'},
      },
      6: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '7', 'Pontos de Feitiçaria': '6'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '8', 'Pontos de Feitiçaria': '7'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '9', 'Pontos de Feitiçaria': '8'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Magias Conhecidas': '10', 'Pontos de Feitiçaria': '9'},
      },
      10: {
        features: [
          {name: 'Metamágica', description: 'Você aprende mais uma opção de Metamágica à sua escolha.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '11', 'Pontos de Feitiçaria': '10'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '12', 'Pontos de Feitiçaria': '11'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '12', 'Pontos de Feitiçaria': '12'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '13', 'Pontos de Feitiçaria': '13'},
      },
      14: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '13', 'Pontos de Feitiçaria': '14'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '14', 'Pontos de Feitiçaria': '15'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '14', 'Pontos de Feitiçaria': '16'},
      },
      17: {
        features: [
          {name: 'Metamágica', description: 'Você aprende mais uma opção de Metamágica à sua escolha.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '15', 'Pontos de Feitiçaria': '17'},
      },
      18: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '15', 'Pontos de Feitiçaria': '18'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '15', 'Pontos de Feitiçaria': '19'},
      },
      20: {
        features: [
          {name: 'Restauração Mística', description: 'Você recupera 4 pontos de feitiçaria gastos sempre que termina um descanso curto.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '6', 'Magias Conhecidas': '15', 'Pontos de Feitiçaria': '20'},
      },
    },
    startingEquipment: ['Besta Leve com 20 virotes', 'Bastão', 'Foco Arcano', 'Pacote do Aventureiro'],
    startingGoldDice: {count: 3, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Estilo de Combate', source: 'Classe', description: 'Você adota um estilo particular de combate como sua especialidade. Escolha uma das opções: Arqueria, Defesa, Duelo, Grande Arma, Proteção ou Combate com Duas Armas.'},
      {name: 'Retomar Fôlego', source: 'Classe', description: 'Você tem uma reserva de resistência que pode usar para se proteger. Em seu turno, você pode usar uma ação bônus para recuperar pontos de vida iguais a 1d10 + seu nível de guerreiro.'},
    ],
    fightingStyleChoice: {level: 1, options: ['Arqueria', 'Defesa', 'Duelo', 'Grande Arma', 'Proteção', 'Combate com Duas Armas']},
    featuresByLevel: {
      1: {
        features: [
          {name: 'Estilo de Combate', description: 'Você adota um estilo particular de combate como sua especialidade. Escolha uma das opções: Arqueria, Defesa, Duelo, Grande Arma, Proteção ou Combate com Duas Armas.'},
          {name: 'Retomar Fôlego', description: 'Você tem uma reserva de resistência que pode usar para se proteger. Em seu turno, você pode usar uma ação bônus para recuperar pontos de vida iguais a 1d10 + seu nível de guerreiro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1'},
      },
      2: {
        features: [
          {name: 'Surto de Ação (um uso)', description: 'Você pode empurrar-se além de seus limites normais por um momento. Em seu turno, você pode fazer uma ação adicional além de sua ação normal e uma possível ação bônus.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      5: {
        features: [
          {name: 'Ataque Extra', description: 'Você pode atacar duas vezes, em vez de uma, sempre que fizer a ação de Atacar em seu turno.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      6: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1'},
      },
      9: {
        features: [
          {name: 'Indomável (um uso)', description: 'Você pode refazer um teste de resistência que falhou. Se fizer isso, deve usar o novo resultado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '1'},
      },
      10: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '1'},
      },
      11: {
        features: [
          {name: 'Ataque Extra (2)', description: 'O número de vezes que você pode atacar com a ação de Atacar aumenta para três.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '1'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '1'},
      },
      13: {
        features: [
          {name: 'Indomável (dois usos)', description: 'Você pode refazer um teste de resistência que falhou; se fizer isso, deve usar o novo resultado. Agora dispõe de dois usos antes de precisar de um descanso longo pra recuperá-los.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '2'},
      },
      14: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '2'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '2'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '1', 'Indomável': '2'},
      },
      17: {
        features: [
          {name: 'Surto de Ação (dois usos)', description: 'Você agora pode usar Surto de Ação duas vezes antes de um descanso, mas só uma vez no mesmo turno.'},
          {name: 'Indomável (três usos)', description: 'Você agora dispõe de três usos de Indomável antes de precisar de um descanso longo pra recuperá-los.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '2', 'Indomável': '3'},
      },
      18: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '2', 'Indomável': '3'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '2', 'Indomável': '3'},
      },
      20: {
        features: [
          {name: 'Ataque Extra (3)', description: 'O número de vezes que você pode atacar com a ação de Atacar aumenta para quatro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Retomar Fôlego': '1', 'Surto de Ação': '2', 'Indomável': '3'},
      },
    },
    startingEquipment: ['Cota de Malha', 'Escudo', 'Espada Longa', 'Besta Leve com 20 virotes', 'Pacote do Aventureiro'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Especialização', source: 'Classe', description: 'Escolha duas das suas proficiências em perícias. Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas perícias.'},
      {name: 'Ataque Furtivo', source: 'Classe', description: 'Você sabe como encontrar e explorar a fraqueza de um inimigo distraído. Uma vez por turno, você pode causar 1d6 de dano extra a uma criatura que acertar com um ataque se você tiver vantagem.'},
      {name: 'Linguagem dos Ladrões', source: 'Classe', description: 'Você aprendeu a linguagem secreta dos ladrões, usada pelos membros das guildas de ladrões e outros criminosos similares.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Especialização', description: 'Escolha duas das suas proficiências em perícias. Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas perícias.'},
          {name: 'Ataque Furtivo', description: 'Você sabe como encontrar e explorar a fraqueza de um inimigo distraído. Uma vez por turno, você pode causar dano extra a uma criatura que acertar com um ataque se você tiver vantagem.'},
          {name: 'Linguagem dos Ladrões', description: 'Você aprendeu a linguagem secreta dos ladrões, usada pelos membros das guildas de ladrões e outros criminosos similares.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '1d6'},
        expertise: {count: 2},
      },
      2: {
        features: [
          {name: 'Ação Ardilosa', description: 'Sua astúcia veloz permite que você aja rapidamente. Em seu turno, você pode usar uma ação bônus para realizar a ação de Disparada, Desengajar ou Esconder.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '1d6'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Ataque Furtivo': '2d6'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '2d6'},
      },
      5: {
        features: [
          {name: 'Esquiva Sobrenatural', description: 'Quando um atacante que você pode ver acerta você com um ataque, você pode usar sua reação para reduzir o dano do ataque pela metade.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '3d6'},
      },
      6: {
        features: [
          {name: 'Especialização', description: 'Escolha mais duas das suas proficiências em perícias (ou uma perícia e suas ferramentas de ladrão). Seu bônus de proficiência é dobrado para qualquer teste de habilidade que você faça usando essas proficiências escolhidas.'},
        ],
        expertise: {count: 2},
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '3d6'},
      },
      7: {
        features: [
          {name: 'Evasão', description: 'Quando submetido a um efeito que permite um teste de resistência de Destreza para sofrer metade do dano (como o sopro de um dragão ou uma Bola de Fogo), você não sofre dano algum se passar no teste, e apenas metade do dano se falhar.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '4d6'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '4d6'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Ataque Furtivo': '5d6'},
      },
      10: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '5d6'},
      },
      11: {
        features: [
          {name: 'Talento Confiável', description: 'Sempre que você fizer um teste de habilidade que lhe permita adicionar seu bônus de proficiência, você pode tratar um resultado de 9 ou menos no d20 como se fosse 10.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '6d6'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '6d6'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Ataque Furtivo': '7d6'},
      },
      14: {
        features: [
          {name: 'Sentido Cego', description: 'Se você tiver a capacidade de ouvir, está ciente da localização de criaturas escondidas ou invisíveis a até 3 metros de você, desde que elas não estejam por trás de silêncio total ou outros meios de bloquear o som.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '7d6'},
      },
      15: {
        features: [
          {name: 'Mente Escorregadia', description: 'Você ganha proficiência em testes de resistência de Sabedoria.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '8d6'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '8d6'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Ataque Furtivo': '9d6'},
      },
      18: {
        features: [
          {name: 'Elusivo', description: 'Nenhuma jogada de ataque tem vantagem contra você enquanto você não estiver incapacitado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '9d6'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '10d6'},
      },
      20: {
        features: [
          {name: 'Golpe de Sorte', description: 'Se seu ataque falhar em acertar um alvo dentro do alcance, você pode transformar o erro num acerto. Alternativamente, se você falhar num teste de habilidade, pode tratá-lo como se tivesse rolado 20. Uma vez usada, essa característica só pode ser usada de novo depois de um descanso curto ou longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Ataque Furtivo': '10d6'},
      },
    },
    startingEquipment: ['Rapieira', 'Arco Curto com 20 flechas', 'Couro Batido', 'Duas Adagas', 'Ferramentas de Ladrão', 'Pacote do Aventureiro'],
    startingGoldDice: {count: 4, sides: 4, multiplier: 10},
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
    preparesSpells: true,
    traits: [
      {name: 'Conjuração', source: 'Classe', description: 'Como estudante da magia arcana, você possui um grimório com feitiços que você pode lançar.'},
      {name: 'Recuperação Arcana', source: 'Classe', description: 'Você aprendeu a recuperar parte de sua energia mágica estudando seu grimório. Uma vez por dia, quando você termina um descanso curto, pode recuperar espaços de magia.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Conjuração', description: 'Como estudante da magia arcana, você possui um grimório com feitiços que você pode lançar.'},
          {name: 'Recuperação Arcana', description: 'Você aprendeu a recuperar parte de sua energia mágica estudando seu grimório. Uma vez por dia, quando você termina um descanso curto, pode recuperar espaços de magia.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Recuperação Arcana': '1'},
      },
      2: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '3', 'Recuperação Arcana': '1'},
      },
      3: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '3', 'Recuperação Arcana': '1'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      5: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      6: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '4', 'Recuperação Arcana': '1'},
      },
      10: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      14: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      18: {
        features: [
          {name: 'Dominar Magia', description: 'Escolha uma magia de 1º nível e uma de 2º nível no seu grimório. Você pode lançar essas magias no nível mais baixo sem gastar um espaço de magia, desde que faça isso antes de terminar um descanso longo. Pra trocar uma delas, precisa passar 1 hora praticando.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
      20: {
        features: [
          {name: 'Assinatura Mágica', description: 'Escolha duas magias de 3º nível no seu grimório como suas magias de assinatura. Você sempre tem essas magias preparadas, pode lançar cada uma delas uma vez no nível 3 sem gastar um espaço de magia, e recupera essa capacidade após um descanso curto ou longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Truques Conhecidos': '5', 'Recuperação Arcana': '1'},
      },
    },
    startingEquipment: ['Bastão', 'Grimório', 'Foco Arcano (Varinha)', 'Pacote de Estudioso', 'Tinteiro e Pena'],
    startingGoldDice: {count: 4, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Defesa sem Armadura', source: 'Classe', description: 'Enquanto não estiver vestindo armadura e não estiver empunhando um escudo, sua CA é igual a 10 + seu modificador de Destreza + seu modificador de Sabedoria.'},
      {name: 'Artes Marciais', source: 'Classe', description: 'Sua prática das artes marciais lhe dá o domínio de estilos de combate que usam ataques desarmados e armas de monge.'},
    ],
    featuresByLevel: {
      1: {
        features: [
          {name: 'Defesa sem Armadura', description: 'Enquanto não estiver vestindo armadura e não estiver empunhando um escudo, sua CA é igual a 10 + seu modificador de Destreza + seu modificador de Sabedoria.'},
          {name: 'Artes Marciais', description: 'Sua prática das artes marciais lhe dá o domínio de estilos de combate que usam ataques desarmados e armas de monge.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d4', 'Pontos de Chi': '–', 'Deslocamento sem Armadura': '–'},
      },
      2: {
        features: [
          {name: 'Chi', description: 'Você aprendeu a aproveitar a energia mística do chi dentro de si. Você tem uma reserva de pontos de chi, disponível novamente após um descanso curto ou longo, que pode gastar para alimentar vários recursos de monge. Você começa conhecendo três características de chi: Rajada de Golpes, Defesa Paciente e Passo do Vento. A CD de resistência de Chi é 8 + bônus de proficiência + modificador de Sabedoria.'},
          {name: 'Rajada de Golpes', description: 'Imediatamente após você realizar a ação de Ataque no seu turno, você pode gastar 1 ponto de chi para realizar dois golpes desarmados com uma ação bônus.'},
          {name: 'Defesa Paciente', description: 'Você pode gastar 1 ponto de chi para realizar a ação de Esquivar, com uma ação bônus, no seu turno.'},
          {name: 'Passo do Vento', description: 'Você pode gastar 1 ponto de chi para realizar a Ação de Desengajar ou Disparada, com uma ação bônus, no seu turno, e sua distância de salto é dobrada nesse turno.'},
          {name: 'Movimento sem Armadura', description: 'Sua velocidade aumenta enquanto você não estiver usando armadura nem empunhando um escudo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d4', 'Pontos de Chi': '2', 'Deslocamento sem Armadura': '+3m'},
      },
      3: {
        features: [
          {name: 'Defletir Projéteis', description: 'Você pode usar sua reação para reduzir o dano de um ataque à distância com arma que o atingir, em 1d10 + seu modificador de Destreza + seu nível de monge. Se reduzir o dano a 0, pode pegar o projétil e, gastando 1 ponto de chi, arremessá-lo de volta como um ataque.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Artes Marciais': '1d4', 'Pontos de Chi': '3', 'Deslocamento sem Armadura': '+3m'},
      },
      4: {
        features: [
          {name: 'Queda Lenta', description: 'Você pode usar sua reação quando cair para reduzir o dano de queda que sofre em um valor igual a cinco vezes seu nível de monge.'},
        ],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d4', 'Pontos de Chi': '4', 'Deslocamento sem Armadura': '+3m'},
      },
      5: {
        features: [
          {name: 'Ataque Extra', description: 'Você pode atacar duas vezes, em vez de uma, sempre que fizer a ação de Atacar em seu turno.'},
          {name: 'Ataque Atordoante', description: 'Você pode gastar 1 ponto de chi para tentar atordoar um alvo que atingir com um ataque corpo a corpo. O alvo deve fazer um teste de resistência de Constituição ou ficará atordoado até o final do seu próximo turno.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '5', 'Deslocamento sem Armadura': '+3m'},
      },
      6: {
        features: [
          {name: 'Golpes de Chi', description: 'Seus ataques desarmados são considerados mágicos para fins de romper resistência e imunidade a dano de ataques e magias não mágicas.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '6', 'Deslocamento sem Armadura': '+4,5m'},
      },
      7: {
        features: [
          {name: 'Evasão', description: 'Quando submetido a um efeito que permite um teste de resistência de Destreza para sofrer metade do dano (como o sopro de um dragão ou uma Bola de Fogo), você não sofre dano algum se passar no teste, e apenas metade do dano se falhar.'},
          {name: 'Mente Tranquila', description: 'Você pode usar uma ação bônus para acabar com o efeito de medo ou charme sobre você.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '7', 'Deslocamento sem Armadura': '+4,5m'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '8', 'Deslocamento sem Armadura': '+4,5m'},
      },
      9: {
        features: [
          {name: 'Aprimoramento de Movimento sem Armadura', description: 'Sua velocidade sem armadura aumenta e agora você pode se mover ao longo de superfícies verticais e através de líquidos sem cair durante seu turno.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '9', 'Deslocamento sem Armadura': '+4,5m'},
      },
      10: {
        features: [
          {name: 'Pureza Corporal', description: 'Sua maestria do chi lhe concede imunidade a doenças e venenos.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d6', 'Pontos de Chi': '10', 'Deslocamento sem Armadura': '+6m'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '11', 'Deslocamento sem Armadura': '+6m'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '12', 'Deslocamento sem Armadura': '+6m'},
      },
      13: {
        features: [
          {name: 'Idiomas do Sol e da Lua', description: 'Você aprende a falar com qualquer criatura que conheça pelo menos um idioma, mesmo que vocês não compartilhem um idioma comum.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '13', 'Deslocamento sem Armadura': '+6m'},
      },
      14: {
        features: [
          {name: 'Alma de Diamante', description: 'Você ganha proficiência em todos os testes de resistência. Além disso, sempre que fizer um teste de resistência e falhar, pode gastar 1 ponto de chi para refazê-lo, e deve usar o novo resultado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '14', 'Deslocamento sem Armadura': '+7,5m'},
      },
      15: {
        features: [
          {name: 'Corpo Atemporal', description: 'Seu treinamento permite que você aproveite a força vital que flui através de você. Você não sofre os efeitos da velhice e não pode ser envelhecido magicamente.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '15', 'Deslocamento sem Armadura': '+7,5m'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d8', 'Pontos de Chi': '16', 'Deslocamento sem Armadura': '+7,5m'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Artes Marciais': '1d10', 'Pontos de Chi': '17', 'Deslocamento sem Armadura': '+7,5m'},
      },
      18: {
        features: [
          {name: 'Corpo Vazio', description: 'Você pode gastar 4 pontos de chi para se tornar invisível por 1 minuto. Alternativamente, você pode gastar 8 pontos de chi para viajar astralmente (efeito similar ao da magia Projeção Astral, sem exigir componentes materiais).'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d10', 'Pontos de Chi': '18', 'Deslocamento sem Armadura': '+9m'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d10', 'Pontos de Chi': '19', 'Deslocamento sem Armadura': '+9m'},
      },
      20: {
        features: [
          {name: 'Auto Aperfeiçoamento', description: 'Quando você rolar iniciativa e não tiver gasto nenhum ponto de chi, recupera 4 pontos de chi.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Artes Marciais': '1d10', 'Pontos de Chi': '20', 'Deslocamento sem Armadura': '+9m'},
      },
    },
    startingEquipment: ['Espada Curta', 'Dez Dardos', 'Pacote do Aventureiro'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 1},
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
    preparesSpells: true,
    traits: [
      {name: 'Sentido Divino', source: 'Classe', description: 'A presença do forte mal registra nos seus sentidos como uma odor nauseante e o poder poderoso do bem soa como música celestial nos seus ouvidos.'},
      {name: 'Curar pelo Toque', source: 'Classe', description: 'A partir do 1º nível, você tem um reservatório de poder curativo que repõe quando você toma um descanso longo.'},
    ],
    // Só 4 das 6 opções (sem Arqueria nem Combate com Duas Armas) — confirmado contra o livro.
    fightingStyleChoice: {level: 2, options: ['Defesa', 'Duelo', 'Grande Arma', 'Proteção']},
    featuresByLevel: {
      1: {
        features: [
          {name: 'Sentido Divino', description: 'A presença do forte mal registra nos seus sentidos como uma odor nauseante e o poder poderoso do bem soa como música celestial nos seus ouvidos.'},
          {name: 'Curar pelo Toque', description: 'A partir deste nível, você tem um reservatório de poder curativo que repõe quando você toma um descanso longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '5'},
      },
      2: {
        features: [
          {name: 'Estilo de Luta', description: 'Você adota um estilo particular de combate como sua especialidade.'},
          {name: 'Conjuração', description: 'Você aprendeu a manifestar magia através de dedicação espiritual e treinamento. Você pode lançar feitiços de paladino a partir deste nível.'},
          {name: 'Destruição Divina', description: 'Quando você acerta uma criatura com um ataque de arma corpo a corpo, pode gastar um espaço de magia pra infligir dano radiante extra ao alvo: 2d8 pra um espaço de 1º nível, mais 1d8 por nível de espaço acima do 1º (máximo 5d8). O dano aumenta em 1d8 se o alvo for morto-vivo ou aberração.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '10'},
      },
      3: {
        features: [
          {name: 'Saúde Divina', description: 'A magia divina que corre por você o torna imune a doenças.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '15'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '20'},
      },
      5: {
        features: [
          {name: 'Ataque Extra', description: 'Você pode atacar duas vezes, em vez de uma, sempre que fizer a ação de Atacar em seu turno.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '25'},
      },
      6: {
        features: [
          {name: 'Aura de Proteção', description: 'Sempre que você ou uma criatura amigável a até 3 metros de você precisar fazer um teste de resistência, essa criatura ganha um bônus no teste igual ao seu modificador de Carisma (mínimo de +1). Você precisa estar consciente pra conceder esse bônus.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '30'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '35'},
      },
      8: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '40'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '45'},
      },
      10: {
        features: [
          {name: 'Aura da Coragem', description: 'Você e criaturas amigáveis a até 3 metros de você não podem ficar amedrontadas enquanto você estiver consciente.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '50'},
      },
      11: {
        features: [
          {name: 'Destruição Divina Aprimorada', description: 'Seus ataques corpo a corpo com arma agora contam como mágicos, pra fins de romper resistência e imunidade a dano de ataques e magias não mágicas.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '55'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '60'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '65'},
      },
      14: {
        features: [
          {name: 'Toque Purificador', description: 'Você pode usar sua ação para acabar com uma magia em você mesmo ou numa criatura que você toque. Pode fazer isso um número de vezes igual ao seu modificador de Carisma (mínimo de uma vez), recuperando os usos após um descanso longo.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '70', 'Toque Purificador': 'mod:CHA'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '75', 'Toque Purificador': 'mod:CHA'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '80', 'Toque Purificador': 'mod:CHA'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '85', 'Toque Purificador': 'mod:CHA'},
      },
      18: {
        features: [
          {name: 'Aprimoramentos de Aura', description: 'O alcance das suas auras de Proteção e Coragem aumenta pra 9 metros.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '90', 'Toque Purificador': 'mod:CHA'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '95', 'Toque Purificador': 'mod:CHA'},
      },
      20: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Sentido Divino': 'mod:CHA+1', 'Curar pelo Toque': '100', 'Toque Purificador': 'mod:CHA'},
      },
    },
    startingEquipment: ['Espada Longa', 'Escudo', 'Cota de Malha', 'Símbolo Sagrado', 'Pacote do Padre'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 10},
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
    preparesSpells: false,
    traits: [
      {name: 'Inimigo Favorito', source: 'Classe', description: 'Você tem experiência significativa estudando, rastreando, caçando e até conversando com um determinado tipo de inimigo.'},
      {name: 'Explorador Natural', source: 'Classe', description: 'Você é particularmente familiarizado com um tipo de ambiente natural e é adepto em viajar e sobreviver nesses ambientes.'},
    ],
    // Só 4 das 6 opções (sem Grande Arma nem Proteção) — confirmado contra o livro.
    fightingStyleChoice: {level: 2, options: ['Arqueria', 'Defesa', 'Duelo', 'Combate com Duas Armas']},
    featuresByLevel: {
      1: {
        features: [
          {name: 'Inimigo Favorito', description: 'Você tem experiência significativa estudando, rastreando, caçando e até conversando com um determinado tipo de inimigo.'},
          {name: 'Explorador Natural', description: 'Você é particularmente familiarizado com um tipo de ambiente natural e é adepto em viajar e sobreviver nesses ambientes.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '–'},
      },
      2: {
        features: [
          {name: 'Estilo de Luta', description: 'Você adota um estilo particular de combate como sua especialidade.'},
          {name: 'Conjuração', description: 'Você aprendeu a aproveitar as forças mágicas da natureza para lançar feitiços de patrulheiro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '2'},
      },
      3: {
        features: [
          {name: 'Consciência Primitiva', description: 'Você pode usar uma ação e gastar um espaço de magia para se concentrar em sua consciência primitiva. Ao fazer isso, pode sentir a presença de certos tipos de criaturas dentro de 1,6 quilômetro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Magias Conhecidas': '3'},
      },
      4: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '3'},
      },
      5: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Magias Conhecidas': '4'},
      },
      6: {
        features: [
          {name: 'Inimigo Favorito Maior', description: 'Você escolhe um inimigo favorito adicional, além de um idioma associado.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '4'},
      },
      7: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Magias Conhecidas': '5'},
      },
      8: {
        features: [
          {name: 'Pés Rápidos', description: 'Viajar através de terreno difícil não-mágico não custa movimento extra a você. Você também pode passar por plantas espinhosas normais sem sofrer dano delas.'},
        ],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '5'},
      },
      9: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '6'},
      },
      10: {
        features: [
          {name: 'Mimetismo', description: 'Você pode tentar se esconder mesmo quando só estiver levemente obscurecido pela folhagem, chuva forte, neve, neblina e outros fenômenos naturais.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '6'},
      },
      11: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Magias Conhecidas': '7'},
      },
      12: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '7'},
      },
      13: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '8'},
      },
      14: {
        features: [
          {name: 'Desaparecer', description: 'Você pode usar a ação de Esconder como uma ação bônus em seu turno. Além disso, não pode ser rastreado por meios não-mágicos, a menos que escolha deixar um rastro.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '8'},
      },
      15: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: true,
        resources: {'Magias Conhecidas': '9'},
      },
      16: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '9'},
      },
      17: {
        features: [],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '10'},
      },
      18: {
        features: [
          {name: 'Sentidos Selvagens', description: 'Você ganha percepção sobrenatural aguçada, permitindo detectar a presença de criaturas invisíveis a até 9 metros de você, mesmo que não consiga vê-las.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '10'},
      },
      19: {
        features: [],
        isAsiLevel: true,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '11'},
      },
      20: {
        features: [
          {name: 'Matador de Inimigos', description: 'Uma vez em cada um dos seus turnos, você pode adicionar seu modificador de Sabedoria à jogada de dano de ataque contra uma criatura que atingir, se ela for seu inimigo favorito ou um dos seus tipos de inimigo favoritos.'},
        ],
        isAsiLevel: false,
        isSubclassFeatureLevel: false,
        resources: {'Magias Conhecidas': '11'},
      },
    },
    startingEquipment: ['Cota de Escamas', 'Duas Espadas Curtas', 'Pacote do Explorador', 'Arco Longo com 20 flechas'],
    startingGoldDice: {count: 5, sides: 4, multiplier: 10},
  },
};

// ---------------------------------------------------------------------------
// Subclasses (Fase 2) — conteúdo confirmado com o usuário classe por classe antes de escrever,
// mesmo processo já usado em `featuresByLevel`. Ver docs/dungeon-companion-levelup-plan.md.
// ---------------------------------------------------------------------------

export const SUBCLASSES: Record<number, SubclassRule[]> = {
  1: [ // Bárbaro — escolhe Caminho Primitivo no nível 3
    {
      id_subclass: 'furioso',
      displayName: 'Caminho do Furioso',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Frenesi', description: 'Você pode entrar num frenesi quando estiver em fúria. Se fizer isso, pelo restante da fúria pode realizar um único ataque corpo-a-corpo com arma como ação bônus em cada um dos seus turnos. Quando a fúria acabar, você sofre um nível de exaustão.'},
          ],
        },
        6: {
          features: [
            {name: 'Fúria Inconsciente', description: 'Você não pode mais ser amedrontado ou enfeitiçado enquanto estiver em fúria. Se estiver enfeitiçado ou amedrontado quando entrar em fúria, o efeito fica suspenso pela duração da fúria.'},
          ],
        },
        10: {
          features: [
            {name: 'Presença Intimidante', description: 'Você pode usar sua ação para amedrontar alguém com sua presença. Escolha uma criatura que possa ver a até 9 metros; se ela puder ver ou ouvir você, deve ser bem-sucedida num teste de Sabedoria (CD 8 + bônus de proficiência + modificador de Carisma) ou ficará amedrontada até o final do seu próximo turno.'},
          ],
        },
        14: {
          features: [
            {name: 'Retaliação', description: 'Quando você sofrer dano de uma criatura que esteja a até 1,5 metro de você, pode usar sua reação para realizar um ataque corpo-a-corpo com arma contra essa criatura.'},
          ],
        },
      },
    },
    {
      id_subclass: 'totemico-urso',
      displayName: 'Guerreiro Totêmico (Urso)',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Espírito Totêmico: Urso', description: 'Quando estiver em fúria, você tem resistência a todos os tipos de dano, exceto dano psíquico.'},
          ],
        },
        6: {
          features: [
            {name: 'Aspecto da Besta: Urso', description: 'Sua capacidade de carga (incluindo carga máxima e capacidade de erguer) é dobrada, e você não deixa cair itens que esteja segurando quando é derrubado.'},
          ],
        },
        10: {
          features: [
            {name: 'Andarilho Espiritual', description: 'Com um ritual de 1 minuto seguido de um transe de 1 hora, você tem uma visão do seu espírito totêmico animal, que se comunica com você. Pode ser feito durante um descanso curto ou longo; outro personagem pode participar e também recebe a visão.'},
          ],
        },
        14: {
          features: [
            {name: 'Respeito da Besta: Urso', description: 'Você ganha a habilidade de se comunicar com bestas como se compartilhassem uma linguagem quando em fúria. Além disso, criaturas hostis a até 1,5 metro de você com menos PV que você sofrem penalidade nas jogadas de ataque contra alvos que não sejam você.'},
          ],
        },
      },
    },
    {
      id_subclass: 'totemico-aguia',
      displayName: 'Guerreiro Totêmico (Águia)',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Espírito Totêmico: Águia', description: 'Quando estiver em fúria e não estiver vestindo armadura pesada, outras criaturas têm desvantagem nas jogadas de ataque de oportunidade contra você, e você pode usar a ação de Disparada como uma ação bônus no seu turno.'},
          ],
        },
        6: {
          features: [
            {name: 'Aspecto da Besta: Águia', description: 'Você ganha a visão aguçada de uma águia, enxergando objetos e criaturas com clareza a até 1,6 km, discernindo até os menores detalhes.'},
          ],
        },
        10: {
          features: [
            {name: 'Andarilho Espiritual', description: 'Com um ritual de 1 minuto seguido de um transe de 1 hora, você tem uma visão do seu espírito totêmico animal, que se comunica com você. Pode ser feito durante um descanso curto ou longo; outro personagem pode participar e também recebe a visão.'},
          ],
        },
        14: {
          features: [
            {name: 'Respeito da Besta: Águia', description: 'Você ganha a habilidade de se comunicar com bestas como se compartilhassem uma linguagem quando em fúria. Além disso, ganha deslocamento de voo igual ao seu deslocamento, desde que esteja sem carga e sem vestir armadura pesada.'},
          ],
        },
      },
    },
    {
      id_subclass: 'totemico-lobo',
      displayName: 'Guerreiro Totêmico (Lobo)',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Espírito Totêmico: Lobo', description: 'Quando estiver em fúria, seus aliados têm vantagem nas jogadas de ataque corpo-a-corpo contra qualquer criatura a até 1,5 metro de você que seja hostil a você.'},
          ],
        },
        6: {
          features: [
            {name: 'Aspecto da Besta: Lobo', description: 'Você pode rastrear outras criaturas viajando a passo rápido normalmente, e furtivamente mesmo viajando a passo normal.'},
          ],
        },
        10: {
          features: [
            {name: 'Andarilho Espiritual', description: 'Com um ritual de 1 minuto seguido de um transe de 1 hora, você tem uma visão do seu espírito totêmico animal, que se comunica com você. Pode ser feito durante um descanso curto ou longo; outro personagem pode participar e também recebe a visão.'},
          ],
        },
        14: {
          features: [
            {name: 'Respeito da Besta: Lobo', description: 'Você ganha a habilidade de se comunicar com bestas como se compartilhassem uma linguagem quando em fúria. Além disso, pode usar uma ação bônus para derrubar uma criatura de tamanho grande ou menor ao acertá-la com um ataque corpo-a-corpo com arma durante sua fúria.'},
          ],
        },
      },
    },
  ],
  8: [ // Ladino — escolhe Arquétipo de Ladino no nível 3
    {
      id_subclass: 'ladrao',
      displayName: 'Ladrão',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Mãos Rápidas', description: 'Você pode usar a ação bônus da sua Ação Ardilosa para fazer uma ação de Usar Objeto adicional, realizar Prestidigitação, usar ferramentas de ladrão pra desarmar uma armadilha ou abrir uma fechadura à distância, ou outra ação normalmente não possível.'},
            {name: 'Andarilho de Telhados', description: 'Escalar não custa movimento extra. Além disso, quando fizer um salto normal, o alcance aumenta em 0,3 metro vezes seu modificador de Destreza.'},
          ],
        },
        9: {
          features: [
            {name: 'Furtividade Suprema', description: 'Você tem vantagem em testes de Destreza (Furtividade) se não se mover mais que a metade do seu deslocamento no mesmo turno.'},
          ],
        },
        13: {
          features: [
            {name: 'Usar Instrumento Mágico', description: 'Você pode usar qualquer item mágico que normalmente exigiria uso de classe ou raça específica, incluindo varinhas, cajados e bastões.'},
          ],
        },
        17: {
          features: [
            {name: 'Reflexos de Ladrão', description: 'Você age duas vezes no primeiro turno de qualquer combate. A primeira rodada de iniciativa só permite ação bônus e movimento normal; na segunda, você age normalmente. Depois disso, entra no combate na sua iniciativa normal.'},
          ],
        },
      },
    },
    {
      id_subclass: 'assassino',
      displayName: 'Assassino',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com o kit de disfarce e com o kit de venenos.'},
            {name: 'Assassinar', description: 'Você tem vantagem nas jogadas de ataque contra qualquer criatura que ainda não tenha agido no combate. Além disso, qualquer ataque que você acertar contra uma criatura surpreendida é um acerto crítico.'},
          ],
        },
        9: {
          features: [
            {name: 'Especialização em Infiltração', description: 'Você pode criar uma identidade falsa para si mesmo, gastando sete dias e 25 po para estabelecê-la com documentos, contatos e outros meios que a façam passar por real. Só pode manter uma identidade falsa por vez.'},
          ],
        },
        13: {
          features: [
            {name: 'Impostor', description: 'Você adquire a habilidade de imitar a fala, a escrita e o comportamento de outra pessoa, depois de estudar esses três componentes por pelo menos três horas.'},
          ],
        },
        17: {
          features: [
            {name: 'Golpe Letal', description: 'Quando você surpreende uma criatura e a acerta com um ataque, ela deve ser bem-sucedida num teste de resistência de Constituição (CD 8 + bônus de proficiência + modificador de Destreza) ou o dano do ataque é dobrado.'},
          ],
        },
      },
    },
    {
      id_subclass: 'trapaceiro-arcano',
      displayName: 'Trapaceiro Arcano',
      spellcasting: {
        spellcastingAbility: 'INT',
        spellListClassId: 9, // Mago
        allowedSchools: ['Ilusão', 'Encantamento'],
      },
      featuresByLevel: {
        3: {
          features: [
            {name: 'Conjuração', description: 'Você adquire a habilidade de conjurar magias, focadas nas escolas de Ilusão e Encantamento da lista de magias de mago. Você aprende Mãos Mágicas automaticamente, além dos truques normais — ele não conta para o total de truques conhecidos.'},
            {name: 'Mãos Mágicas Malabaristas', description: 'Quando conjurar Mãos Mágicas, pode tornar a mão espectral invisível, usá-la para pegar/guardar objetos discretamente, usar ferramentas de ladrão com ela à distância, e controlá-la a até 9 metros de você.'},
          ],
          resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '3'},
        },
        4: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '4'}},
        5: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '4'}},
        6: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '4'}},
        7: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '5'}},
        8: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '6'}},
        9: {
          features: [
            {name: 'Trapaceiro Versátil', description: 'Como ação bônus no seu turno, você pode designar uma criatura a até 1,5 metro da mão espectral criada pela sua magia Mãos Mágicas — você ganha vantagem nas jogadas de ataque contra essa criatura até o final do turno.'},
          ],
          resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '6'},
        },
        10: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '7'}},
        11: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '8'}},
        12: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '8'}},
        13: {
          features: [
            {name: 'Ladrão de Magia', description: 'Imediatamente após uma criatura que você possa ver conjurar uma magia direcionada a você ou que o inclua na área, você pode usar sua reação pra tentar roubar magicamente o conhecimento dela, forçando um teste de resistência; se falhar, você aprende a magia (se puder conjurá-la) e ela é consumida da criatura por 8 horas.'},
          ],
          resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '9'},
        },
        14: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '10'}},
        15: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '10'}},
        16: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '11'}},
        17: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '11'}},
        18: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '12'}},
        19: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '13'}},
        20: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '13'}},
      },
    },
  ],
  10: [ // Monge — escolhe Tradição Monástica no nível 3
    {
      id_subclass: 'mao-aberta',
      displayName: 'Caminho da Mão Aberta',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Técnica da Mão Aberta', description: 'Toda vez que você atinge um inimigo com um dos ataques garantidos pela sua ação de Rajada de Golpes, pode impor um destes efeitos: ele deve ser bem-sucedido num teste de resistência de Destreza ou cai no chão; ele deve ser bem-sucedido num teste de resistência de Força ou você o empurra até 4,5 metros; ou ele não pode realizar reações até o final do seu próximo turno.'},
          ],
        },
        6: {
          features: [
            {name: 'Integridade Corporal', description: 'Com uma ação, você recupera pontos de vida iguais a três vezes seu nível de monge. Deve terminar um descanso longo antes de poder usar essa característica de novo.'},
          ],
          resources: {'Integridade Corporal': '1'},
        },
        7: {features: [], resources: {'Integridade Corporal': '1'}},
        8: {features: [], resources: {'Integridade Corporal': '1'}},
        9: {features: [], resources: {'Integridade Corporal': '1'}},
        10: {features: [], resources: {'Integridade Corporal': '1'}},
        11: {
          features: [
            {name: 'Tranquilidade', description: 'No final de um descanso longo, você ganha o efeito da magia santuário (CD 8 + modificador de Sabedoria + bônus de proficiência), que dura até o início do seu próximo descanso longo ou até você atacar/conjurar uma magia direcionada a uma criatura hostil.'},
          ],
          resources: {'Integridade Corporal': '1'},
        },
        12: {features: [], resources: {'Integridade Corporal': '1'}},
        13: {features: [], resources: {'Integridade Corporal': '1'}},
        14: {features: [], resources: {'Integridade Corporal': '1'}},
        15: {features: [], resources: {'Integridade Corporal': '1'}},
        16: {features: [], resources: {'Integridade Corporal': '1'}},
        17: {
          features: [
            {name: 'Palma Vibrante', description: 'Quando acertar uma criatura com um ataque corpo-a-corpo desarmado, pode gastar 3 pontos de chi para iniciar vibrações letais que duram dias iguais ao seu nível de monge. Depois, pode usar uma ação para forçar um teste de resistência de Constituição (CD de golpes de chi): se falhar, a criatura cai a 0 PV; se for bem-sucedida, sofre 10d10 de dano de concussão.'},
          ],
          resources: {'Integridade Corporal': '1'},
        },
        18: {features: [], resources: {'Integridade Corporal': '1'}},
        19: {features: [], resources: {'Integridade Corporal': '1'}},
        20: {features: [], resources: {'Integridade Corporal': '1'}},
      },
    },
    {
      id_subclass: 'sombra',
      displayName: 'Caminho da Sombra',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Artes Sombrias', description: 'Você pode gastar 2 pontos de chi para conjurar trevas, visão no escuro, passos sem rastro ou silêncio, sem componentes materiais. Além disso, aprende o truque ilusão menor e pode conjurá-lo à vontade sem gastar chi.'},
          ],
        },
        6: {
          features: [
            {name: 'Passo nas Sombras', description: 'Você pode se teletransportar até 18 metros para um espaço vazio que possa ver e que esteja em penumbra ou escuridão, reaparecendo em outro espaço vazio visível dentro desse alcance nas mesmas condições. Ganha vantagem no primeiro ataque corpo-a-corpo antes do final do turno.'},
          ],
        },
        11: {
          features: [
            {name: 'Técnica de Mão Oculta', description: 'Quando acertar uma criatura com um ataque garantido pela ação de Rajada de Golpes, pode gastar 1 ponto de chi para impor o efeito da magia escuridão num espaço adjacente a ela ou que ela ocupe.'},
          ],
        },
        17: {
          features: [
            {name: 'Manto de Sombras', description: 'Quando estiver numa área de penumbra ou escuridão, pode usar sua ação para se tornar invisível, permanecendo assim até realizar uma ação/ação bônus ou até estar numa área de luz brilhante.'},
          ],
        },
      },
    },
    {
      id_subclass: 'quatro-elementos',
      displayName: 'Caminho dos Quatro Elementos',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Discípulo dos Elementos', description: 'Você aprende disciplinas mágicas elementais que exigem gasto de pontos de chi para ativar — 2 disciplinas à sua escolha neste nível. Só o texto informativo é modelado por enquanto; a escolha/efeito de cada disciplina elemental específica não é gerenciada pela ficha nesta versão.'},
          ],
        },
        6: {
          features: [
            {name: 'Nova Disciplina Elemental', description: 'Você aprende mais uma disciplina elemental à sua escolha (ou substitui uma que já conhece).'},
          ],
        },
        11: {
          features: [
            {name: 'Nova Disciplina Elemental', description: 'Você aprende mais uma disciplina elemental à sua escolha (ou substitui uma que já conhece).'},
          ],
        },
        17: {
          features: [
            {name: 'Nova Disciplina Elemental', description: 'Você aprende mais uma disciplina elemental à sua escolha (ou substitui uma que já conhece).'},
          ],
        },
      },
    },
  ],
  3: [ // Bruxo — escolhe Patrono Sobrenatural no nível 1
    {
      id_subclass: 'corruptor',
      displayName: 'O Corruptor',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Bênção do Corruptor', description: 'Quando você reduzir uma criatura hostil a 0 pontos de vida, ganha pontos de vida temporários iguais ao seu nível de bruxo + seu modificador de Carisma (mínimo de 1).'},
          ],
        },
        6: {
          features: [
            {name: 'Sorte do Próprio Obscuro', description: 'Quando fizer um teste de habilidade ou teste de resistência, pode adicionar um d10 à sua jogada, depois de ver o resultado do d20 mas antes de aplicar os efeitos. Uma vez usado, precisa terminar um descanso curto ou longo antes de usar de novo.'},
          ],
        },
        10: {
          features: [
            {name: 'Resistência Demoníaca', description: 'Ao final de um descanso longo, escolha um tipo de dano. Você tem resistência a esse tipo de dano até começar seu próximo descanso longo.'},
          ],
        },
        14: {
          features: [
            {name: 'Lançar no Inferno', description: 'Quando acertar uma criatura com um ataque ou magia, pode instantaneamente transportá-la para um plano inferior tormentoso. Ela sofre 10d10 de dano de concussão e retorna ao final do seu próximo turno (se sobreviver). Uma vez usada, precisa terminar um descanso longo antes de usar de novo.'},
          ],
        },
      },
    },
    {
      id_subclass: 'arquifada',
      displayName: 'A Arquifada',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Presença Feérica', description: 'Como ação, cada criatura numa área de 3 metros de cubo a partir de você faz um teste de resistência de Sabedoria (CD de magia de bruxo) ou fica enfeitiçada ou amedrontada (à sua escolha) até o final do seu próximo turno. Uma vez usada, precisa terminar um descanso curto ou longo antes de usar de novo.'},
          ],
        },
        6: {
          features: [
            {name: 'Névoa de Fuga', description: 'Quando sofrer dano, pode usar sua reação para se teletransportar até 18 metros para um espaço desocupado que possa ver, ficando invisível até o início do seu próximo turno ou até atacar, causar dano ou forçar um teste de resistência.'},
          ],
        },
        10: {
          features: [
            {name: 'Defesa Sedutora', description: 'Você é imune a ficar enfeitiçado. Quando outra criatura tentar enfeitiçá-lo, pode usar sua reação para tentar enfeitiçá-la de volta pelo mesmo período (mesma CD).'},
          ],
        },
        14: {
          features: [
            {name: 'Delírio Sombrio', description: 'Como ação, escolha uma criatura a até 18 metros; ela faz um teste de resistência de Sabedoria (CD de magia de bruxo) ou fica enfeitiçada/amedrontada e incapacitada por 1 minuto ou até sofrer dano, acreditando estar perdida num plano sombrio. Uma vez usada, precisa terminar um descanso longo antes de usar de novo.'},
          ],
        },
      },
    },
    {
      id_subclass: 'grande-antigo',
      displayName: 'O Grande Antigo',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Mente Desperta', description: 'Você pode se comunicar telepaticamente com qualquer criatura que possa ver a até 9 metros. Não precisa compartilhar um idioma, mas a criatura deve entender ao menos um.'},
          ],
        },
        6: {
          features: [
            {name: 'Proteção Entrópica', description: 'Quando uma criatura fizer uma jogada de ataque contra você, pode usar sua reação para impor desvantagem nessa jogada. Se ela errar, seu próximo ataque contra ela antes do final do seu próximo turno tem vantagem. Uma vez usada, precisa terminar um descanso curto ou longo antes de usar de novo.'},
          ],
        },
        10: {
          features: [
            {name: 'Escudo de Pensamentos', description: 'Seus pensamentos não podem ser lidos por telepatia a não ser que você permita. Você tem resistência a dano psíquico, e criaturas que causarem dano psíquico em você sofrem a mesma quantidade de volta.'},
          ],
        },
        14: {
          features: [
            {name: 'Criar Lacaio', description: 'Como ação, toque uma criatura humanoide incapacitada — ela fica permanentemente enfeitiçada, obedecendo seus comandos, com vínculo telepático enquanto estiverem no mesmo plano. Só pode ter um lacaio por vez.'},
          ],
        },
      },
    },
  ],
  4: [ // Clérigo — escolhe Domínio Divino no nível 1
    {
      id_subclass: 'conhecimento',
      displayName: 'Domínio do Conhecimento',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Bênção do Conhecimento', description: 'Você aprende dois idiomas à sua escolha e se torna proficiente em duas das seguintes perícias: Arcanismo, História, Natureza ou Religião. Seu bônus de proficiência é dobrado em qualquer teste de habilidade que você fizer usando essas duas perícias.'},
          ],
          expertise: {count: 2, pool: ['arcana', 'history', 'nature', 'religion']},
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Conhecimento das Eras', description: 'Você pode usar seu Canalizar Divindade para ganhar proficiência temporária (por 10 minutos) numa perícia ou ferramenta à sua escolha.'},
          ],
        },
        6: {
          features: [
            {name: 'Canalizar Divindade: Ler Pensamentos', description: 'Você pode usar seu Canalizar Divindade para ler a mente de uma criatura por 1 minuto (teste de resistência de Sabedoria pra resistir); enquanto durar, você também pode gastar sua ação pra plantar sugestivamente um pensamento na mente dela.'},
          ],
        },
        8: {
          features: [
            {name: 'Conjuração Poderosa', description: 'Você adiciona seu modificador de Sabedoria ao dano causado por qualquer truque de clérigo que já cause dano.'},
          ],
        },
        17: {
          features: [
            {name: 'Visões do Passado', description: 'Você pode meditar por 1 minuto pra receber visões do passado recente de um objeto que segura ou do ambiente ao redor (eventos das últimas horas, dias ou até anos, dependendo da magnitude).'},
          ],
        },
      },
    },
    {
      id_subclass: 'enganacao',
      displayName: 'Domínio da Enganação',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Bênção do Trapaceiro', description: 'Como ação, você toca uma criatura (que não seja você) e concede a ela vantagem em testes de Destreza (Furtividade) por 1 hora ou até você usar essa característica de novo.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Invocar Duplicidade', description: 'Você pode usar seu Canalizar Divindade pra criar uma ilusão perfeita de si mesmo, que dura enquanto você mantiver concentração (até 1 minuto). Você pode ver e ouvir através dela e falar por ela.'},
          ],
        },
        6: {
          features: [
            {name: 'Canalizar Divindade: Manto de Sombras', description: 'Numa área de penumbra ou escuridão, você pode usar seu Canalizar Divindade pra ficar invisível até realizar um ataque, conjurar uma magia, ou até o final do seu próximo turno.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano extra (2d8 a partir do 14º nível).'},
          ],
        },
        17: {
          features: [
            {name: 'Duplicidade Aprimorada', description: 'Você pode criar duas duplicatas de si mesmo em vez de uma quando usar Invocar Duplicidade, e pode se teletransportar pra qualquer espaço ocupado por uma delas em vez de só uma.'},
          ],
        },
      },
    },
    {
      id_subclass: 'guerra',
      displayName: 'Domínio da Guerra',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com armas marciais e armaduras pesadas.'},
            {name: 'Sacerdote da Guerra', description: 'Quando você usa a ação de Atacar, pode realizar um ataque com arma como ação bônus. Pode usar essa característica um número de vezes igual ao seu modificador de Sabedoria (mínimo 1), recuperando todos os usos num descanso longo.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Golpe Dirigido', description: 'Você pode usar seu Canalizar Divindade pra receber orientação divina em combate: quando fizer uma jogada de ataque, pode usar essa característica pra ganhar +10 nessa jogada, decidindo depois de ver a rolagem mas antes de saber se acertou.'},
          ],
        },
        6: {
          features: [
            {name: 'Bênção do Deus da Guerra', description: 'Quando uma criatura próxima fizer uma jogada de ataque, você pode usar sua reação e seu Canalizar Divindade pra conceder a ela +10 nessa jogada.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano extra (2d8 a partir do 14º nível).'},
          ],
        },
        17: {
          features: [
            {name: 'Avatar da Batalha', description: 'Você ganha resistência a dano de concussão, perfurante e cortante de ataques não-mágicos.'},
          ],
        },
      },
    },
    {
      id_subclass: 'luz',
      displayName: 'Domínio da Luz',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Labareda Protetora', description: 'Quando um ataque contra você ou outra criatura a até 9 metros for bem-sucedido, você pode usar sua reação pra impor desvantagem nessa jogada, através de uma explosão de luz — o atacante fica cego até o final do seu próximo turno se falhar num teste de resistência de Constituição.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Radiação do Amanhecer', description: 'Você pode usar seu Canalizar Divindade pra emitir luz radiante: criaturas hostis num raio de 9 metros sofrem 2d10 + seu nível de clérigo de dano radiante (metade se resistirem) e perdem qualquer vantagem de estarem na penumbra ou escuridão mágica.'},
          ],
        },
        6: {
          features: [
            {name: 'Labareda Aprimorada', description: 'Você também pode usar Labareda Protetora quando uma criatura que possa ver a até 9 metros for atacada, não só você ou criaturas ao seu lado.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano radiante extra (2d8 a partir do 14º nível).'},
          ],
        },
        17: {
          features: [
            {name: 'Coroa de Luz', description: 'Como ação, você ganha uma aura de luz solar por 1 minuto que emite luz plena a 9 metros e penumbra por mais 9. Inimigos na luz plena têm desvantagem em testes de resistência contra suas magias que causem dano radiante ou de fogo.'},
          ],
        },
      },
    },
    {
      id_subclass: 'natureza',
      displayName: 'Domínio da Natureza',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com armaduras pesadas.'},
            {name: 'Acólito da Natureza', description: 'Você aprende um truque adicional à sua escolha da lista de magias de druida, e ganha proficiência numa das seguintes perícias: Adestrar Animais, Natureza ou Sobrevivência.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Encantar Animais e Plantas', description: 'Você pode usar seu Canalizar Divindade pra encantar animais e plantas ao seu redor, ficando amigáveis com você por 1 minuto ou até sofrerem dano.'},
          ],
        },
        6: {
          features: [
            {name: 'Amortecer Elementos', description: 'Quando você ou uma criatura a até 9 metros sofrer dano de ácido, frio, fogo, elétrico ou trovão, pode usar sua reação pra conceder resistência a esse dano.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano extra (2d8 a partir do 14º nível) de um tipo à sua escolha entre ácido, frio, fogo, elétrico ou trovão.'},
          ],
        },
        17: {
          features: [
            {name: 'Senhor da Natureza', description: 'Você pode comandar criaturas animais ou vegetais enfeitiçadas por suas magias como uma ação bônus, além das ordens normais.'},
          ],
        },
      },
    },
    {
      id_subclass: 'tempestade',
      displayName: 'Domínio da Tempestade',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com armas marciais e armaduras pesadas.'},
            {name: 'Ira da Tormenta', description: 'Quando um inimigo a até 1,5 metro te acertar com um ataque, pode usar sua reação pra causar 2d8 de dano elétrico ou de trovão (à sua escolha) nele.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Ira da Tempestade Destruidora', description: 'Quando você causa dano elétrico ou de trovão com uma magia de clérigo, pode usar seu Canalizar Divindade pra causar o dano máximo possível em vez de rolar.'},
          ],
        },
        6: {
          features: [
            {name: 'Golpe de Relâmpago', description: 'Quando você causa dano elétrico numa criatura com uma magia de clérigo, pode empurrá-la em linha reta até 3 metros para longe de você.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano elétrico ou trovão extra (2d8 a partir do 14º nível).'},
          ],
        },
        17: {
          features: [
            {name: 'Filho da Tormenta', description: 'Você ganha resistência a dano elétrico e de trovão, e ganha deslocamento de voo igual ao seu deslocamento sempre que não estiver incapacitado (desde que não esteja debaixo de terra ou em ambiente fechado).'},
          ],
        },
      },
    },
    {
      id_subclass: 'vida',
      displayName: 'Domínio da Vida',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com armaduras pesadas.'},
            {name: 'Discípulo da Vida', description: 'Suas magias de cura curam pontos de vida extra: sempre que usar uma magia de nível 1 ou superior pra restaurar pontos de vida a uma criatura, ela recupera pontos de vida adicionais iguais a 2 + o nível da magia.'},
          ],
        },
        2: {
          features: [
            {name: 'Canalizar Divindade: Preservar a Vida', description: 'Você pode usar seu Canalizar Divindade pra restaurar uma quantidade de pontos de vida igual a 5 vezes seu nível de clérigo, distribuída entre criaturas a até 9 metros (nenhuma pode receber mais da metade do máximo de PV).'},
          ],
        },
        6: {
          features: [
            {name: 'Curandeiro Abençoado', description: 'Sempre que você conjurar uma magia de nível 1 ou superior que restaure pontos de vida em outra criatura, você também recupera pontos de vida iguais a 2 + o nível da magia.'},
          ],
        },
        8: {
          features: [
            {name: 'Golpe Divino', description: 'Uma vez por turno, quando você acertar uma criatura com um ataque de arma, pode causar 1d8 de dano radiante extra (2d8 a partir do 14º nível).'},
          ],
        },
        17: {
          features: [
            {name: 'Cura Suprema', description: 'Quando você for rolar dados pra determinar quantos pontos de vida uma de suas magias de clérigo restaura, em vez de rolar, use o valor máximo possível.'},
          ],
        },
      },
    },
  ],
  6: [ // Feiticeiro — escolhe Origem de Feitiçaria no nível 1
    {
      id_subclass: 'linhagem-draconica',
      displayName: 'Linhagem Dracônica',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Ancestral Dracônico', description: 'Escolha um tipo de dragão como ancestral (cada um associado a um tipo de dano: vermelho/ouro/latão = fogo; verde = veneno; prata = frio; azul/bronze = elétrico; cobre/negro = ácido). Você aprende a falar, ler e escrever Dracônico.'},
            {name: 'Resiliência Dracônica', description: 'Seu máximo de pontos de vida aumenta em 1 e mais 1 a cada nível ganho nessa classe. Além disso, partes de sua pele ganham uma leve textura de escamas: quando não estiver usando armadura, sua CA é igual a 13 + seu modificador de Destreza.'},
          ],
        },
        6: {
          features: [
            {name: 'Afinidade Elemental', description: 'Quando conjurar uma magia que cause dano do tipo associado ao seu ancestral dracônico, pode adicionar seu modificador de Carisma a esse dano. Também pode gastar 1 ponto de feitiçaria pra ganhar resistência a esse tipo de dano por 1 hora.'},
          ],
        },
        14: {
          features: [
            {name: 'Asas de Dragão', description: 'Como ação bônus, você pode manifestar um par de asas de dragão nas costas, ganhando deslocamento de voo igual ao seu deslocamento atual. Elas duram até você as dissipar como outra ação bônus.'},
          ],
        },
        18: {
          features: [
            {name: 'Presença Dracônica', description: 'Como ação, pode gastar 5 pontos de feitiçaria pra emanar uma aura de admiração ou temor (à sua escolha) num raio de 18 metros, por 1 minuto ou até perder a concentração. Criaturas hostis na área ficam amedrontadas (teste de resistência de Sabedoria, CD de feitiçaria) e aliadas ficam admiradas por você.'},
          ],
        },
      },
    },
    {
      id_subclass: 'magia-selvagem',
      displayName: 'Magia Selvagem',
      featuresByLevel: {
        1: {
          features: [
            {name: 'Surto de Magia Selvagem', description: 'Depois de conjurar uma magia de feiticeiro de 1º círculo ou superior, o mestre pode pedir pra você rolar 1d20; num resultado de 1, energia mágica caótica se manifesta em você e você rola na tabela de Surto de Magia Selvagem (d100, dezenas de efeitos aleatórios diferentes).'},
            {name: 'Marés do Caos', description: 'Uma vez antes de terminar um descanso longo, pode ganhar vantagem numa jogada de ataque, teste de habilidade ou teste de resistência. Depois disso, o mestre pode pedir pra você rolar na tabela de Surto de Magia Selvagem.'},
          ],
        },
        6: {
          features: [
            {name: 'Caos Controlado', description: 'Sempre que rolar na tabela de Surto de Magia Selvagem, você pode rolar duas vezes e escolher qualquer um dos dois resultados.'},
          ],
        },
        14: {
          features: [
            {name: 'Bombardeio de Magia', description: 'Quando causar dano com uma magia de feiticeiro e obtiver o valor máximo possível num dos dados de dano, pode rolar aquele dado de novo e somar o novo resultado. Só pode fazer isso uma vez por turno.'},
          ],
        },
        18: {
          features: [
            {name: 'Dobrar a Sorte', description: 'Quando outra criatura que você possa ver fizer uma jogada de ataque, teste de habilidade ou teste de resistência, pode usar sua reação e gastar 2 pontos de feitiçaria pra rolar 1d4 e aplicar o resultado como bônus ou penalidade (à sua escolha) à jogada dela, depois de vê-la mas antes de saber o efeito.'},
          ],
        },
      },
    },
  ],
  2: [ // Bardo — escolhe Colégio de Bardo no nível 3
    {
      id_subclass: 'conhecimento',
      displayName: 'Colégio do Conhecimento',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência em três perícias à sua escolha.'},
            {name: 'Palavras de Interrupção', description: 'Quando uma criatura que você possa ver a até 18 metros fizer uma jogada de ataque, teste de habilidade ou de dano, pode usar sua reação pra gastar um dado de Inspiração de Bardo e subtrair o resultado da rolagem da jogada dela.'},
          ],
        },
        6: {
          features: [
            {name: 'Magias Adicionais', description: 'Você aprende duas magias à sua escolha de qualquer classe (nível igual ou menor à metade do seu nível de bardo, arredondado pra cima, até no máximo 9º círculo). Elas contam como magias de bardo pra você, mas não contam pro número de magias de bardo conhecidas.'},
          ],
        },
        14: {
          features: [
            {name: 'Perícia Inigualável', description: 'Quando fizer um teste de habilidade, pode gastar um dado de Inspiração de Bardo e somar o resultado ao teste — pode decidir depois de rolar o dado, mas antes de saber se foi bem-sucedido.'},
          ],
        },
      },
    },
    {
      id_subclass: 'bravura',
      displayName: 'Colégio da Bravura',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Proficiência Adicional', description: 'Você ganha proficiência com armaduras médias, escudos e armas marciais.'},
            {name: 'Inspiração em Combate', description: 'Uma criatura que tenha um dado de Inspiração de Bardo seu pode rolá-lo e somar o resultado a uma jogada de dano que acabou de fazer, ou usá-lo (também rolando) pra somar à sua CA como reação contra um ataque que a esteja acertando.'},
          ],
        },
        6: {
          features: [
            {name: 'Ataque Extra', description: 'Você pode atacar duas vezes, em vez de uma, sempre que fizer a ação de Atacar em seu turno.'},
          ],
        },
        14: {
          features: [
            {name: 'Magia de Batalha', description: 'Quando você usar sua ação para conjurar uma magia de bardo, pode usar uma ação bônus para realizar um ataque com arma.'},
          ],
        },
      },
    },
  ],
  5: [ // Druida — escolhe Círculo Druídico no nível 2
    {
      id_subclass: 'terra',
      displayName: 'Círculo da Terra',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Truque Adicional', description: 'Você aprende um truque de druida adicional à sua escolha.'},
            {name: 'Recuperação Natural', description: 'Durante um descanso curto, você pode recuperar espaços de magia gastos com total combinado igual ou menor à metade do seu nível de druida (arredondado pra cima), nenhum de 6º círculo ou superior. Só pode usar isso de novo depois de um descanso longo.'},
          ],
          resources: {'Recuperação Natural': '1'},
        },
        3: {
          features: [
            {name: 'Magias de Círculo', description: 'Escolha um terreno (Ártico, Costa, Deserto, Floresta, Montanha, Pântano, Planície ou Subterrâneo) — você ganha acesso a magias extras, sempre preparadas, nos níveis 3º, 5º, 7º e 9º, de acordo com o terreno escolhido. Não modelado individualmente por terreno nesta versão — só o texto informativo.'},
          ],
          resources: {'Recuperação Natural': '1'},
        },
        4: {features: [], resources: {'Recuperação Natural': '1'}},
        5: {features: [], resources: {'Recuperação Natural': '1'}},
        6: {
          features: [
            {name: 'Passo de Terreno', description: 'Mover-se através de terreno difícil não custa movimento extra. Você também pode passar por plantas não-mágicas sem ser desacelerado por elas e sem sofrer dano se tiverem espinhos ou perigos similares.'},
          ],
          resources: {'Recuperação Natural': '1'},
        },
        7: {features: [], resources: {'Recuperação Natural': '1'}},
        8: {features: [], resources: {'Recuperação Natural': '1'}},
        9: {features: [], resources: {'Recuperação Natural': '1'}},
        10: {
          features: [
            {name: 'Proteção Natural', description: 'Você não pode ser envenenado ou amedrontado por elementais ou fadas, e é imune a venenos e doenças.'},
          ],
          resources: {'Recuperação Natural': '1'},
        },
        11: {features: [], resources: {'Recuperação Natural': '1'}},
        12: {features: [], resources: {'Recuperação Natural': '1'}},
        13: {features: [], resources: {'Recuperação Natural': '1'}},
        14: {
          features: [
            {name: 'Santuário Natural', description: 'Quando uma criatura do mundo natural (fadas, plantas e afins) atacar você, ela deve fazer um teste de resistência de Sabedoria (CD de druida) ou hesitará em te atacar, escolhendo outro alvo ou desistindo do ataque.'},
          ],
          resources: {'Recuperação Natural': '1'},
        },
        15: {features: [], resources: {'Recuperação Natural': '1'}},
        16: {features: [], resources: {'Recuperação Natural': '1'}},
        17: {features: [], resources: {'Recuperação Natural': '1'}},
        18: {features: [], resources: {'Recuperação Natural': '1'}},
        19: {features: [], resources: {'Recuperação Natural': '1'}},
        20: {features: [], resources: {'Recuperação Natural': '1'}},
      },
    },
    {
      id_subclass: 'lua',
      displayName: 'Círculo da Lua',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Forma Selvagem de Combate', description: 'Você pode usar Forma Selvagem como ação bônus, em vez de ação (desde que a nova forma tenha ND até 1). Além disso, enquanto estiver em forma de besta, pode gastar um espaço de magia como ação bônus para recuperar pontos de vida iguais a 1d8 por nível do espaço gasto.'},
          ],
        },
        6: {
          features: [
            {name: 'Ataque Primordial', description: 'Seus ataques em forma de besta são considerados mágicos, para o propósito de superar resistência e imunidade a ataques e dano não-mágicos.'},
          ],
        },
        10: {
          features: [
            {name: 'Forma Selvagem de Elemental', description: 'Você pode gastar dois usos da sua Forma Selvagem de uma vez para se transformar num elemental do ar, da água, do fogo ou da terra.'},
          ],
        },
        14: {
          features: [
            {name: 'Mil Formas', description: 'Você aprende a magia alterar-se e pode conjurá-la sem gastar espaço de magia ou componentes materiais.'},
          ],
        },
      },
    },
  ],
  9: [ // Mago — escolhe Tradição Arcana no nível 2
    {
      id_subclass: 'abjuracao',
      displayName: 'Escola de Abjuração',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Abjuração Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de abjuração pro seu grimório é reduzido à metade.'},
            {name: 'Escudo Arcano', description: 'Você pode criar uma proteção mágica ao seu redor. Quando conjurar uma magia de abjuração de 1º círculo ou superior, ganha pontos de vida temporários (escudo) iguais a 2× seu nível de mago + seu modificador de Inteligência, que absorvem dano em seu lugar. O escudo se recarrega toda vez que você conjura uma magia de abjuração.'},
          ],
        },
        6: {
          features: [
            {name: 'Proteção Projetada', description: 'Quando uma criatura que você possa ver a até 9 metros sofrer dano, pode usar sua reação pra transferir a absorção do seu Escudo Arcano pra ela.'},
          ],
        },
        10: {
          features: [
            {name: 'Abjuração Aprimorada', description: 'Você soma seu bônus de proficiência a qualquer teste de habilidade que fizer como parte de conjurar dissipar magia ou contramágica, ou como parte de usar sua Recuperação Arcana pra restaurar um espaço de magia gasto com uma magia de abjuração.'},
          ],
        },
        14: {
          features: [
            {name: 'Resistência à Magia', description: 'Você tem vantagem em testes de resistência contra magias, e resistência a dano de magias.'},
          ],
        },
      },
    },
    {
      id_subclass: 'adivinhacao',
      displayName: 'Escola de Adivinhação',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Adivinhação Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de adivinhação pro seu grimório é reduzido à metade.'},
            {name: 'Prodígio', description: 'Quando termina um descanso longo, role 2d20 e anote os resultados — são seus dados de prodígio. Você pode substituir qualquer jogada de ataque, teste de habilidade ou teste de resistência (sua ou de outra criatura que possa ver) por um desses dados, gastando-o.'},
          ],
        },
        6: {
          features: [
            {name: 'Especialista em Adivinhação', description: 'Quando conjurar uma magia de adivinhação usando um espaço de magia de 2º círculo ou superior, recupera um espaço de magia de círculo mais baixo.'},
          ],
        },
        10: {
          features: [
            {name: 'O Terceiro Olho', description: 'Como ação, escolha um dos seguintes benefícios até ficar incapacitado: visão no escuro a 18 metros, capacidade de ler qualquer idioma escrito, enxergar criaturas invisíveis a até 3 metros, ou enxergar no Plano Etéreo a até 18 metros.'},
          ],
        },
        14: {
          features: [
            {name: 'Prodígio Maior', description: 'Você passa a rolar 3d20 (em vez de 2) pros seus dados de prodígio ao terminar um descanso longo.'},
          ],
        },
      },
    },
    {
      id_subclass: 'encantamento',
      displayName: 'Escola de Encantamento',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Encantamento Instruído', description: 'O custo em tempo e ouro pra você copiar uma magia de encantamento pro seu grimório é reduzido à metade.'},
            {name: 'Encantamento Hipnotizante', description: 'Como ação, você pode fixar seu olhar magicamente hipnotizante numa criatura a até 1,5 metro; ela deve fazer um teste de resistência de Sabedoria (CD de magia) ou ficará enfeitiçada até o final do seu próximo turno, incapacitada e com deslocamento 0.'},
          ],
        },
        6: {
          features: [
            {name: 'Encanto Instintivo', description: 'Quando uma criatura que você possa ver a até 9 metros fizer uma jogada de ataque contra você, pode usar sua reação pra forçar um teste de Sabedoria nela; se falhar, ela deve escolher outra criatura (que não você) como alvo desse ataque.'},
          ],
        },
        10: {
          features: [
            {name: 'Dividir Encantamento', description: 'Quando conjurar uma magia de encantamento de 1º círculo ou superior direcionada a uma criatura, pode direcioná-la a uma segunda criatura também.'},
          ],
        },
        14: {
          features: [
            {name: 'Alterar Memórias', description: 'Quando enfeitiçar uma criatura, pode fazê-la não perceber que foi enfeitiçada. Além disso, pode apagar até um número de horas de memória dela igual ao círculo da magia usada.'},
          ],
        },
      },
    },
    {
      id_subclass: 'evocacao',
      displayName: 'Escola de Evocação',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Evocação Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de evocação pro seu grimório é reduzido à metade.'},
            {name: 'Esculpir Magias', description: 'Quando conjurar uma magia de evocação que afete outras criaturas que possa ver, pode escolher um número delas igual a 1 + o círculo da magia — elas são automaticamente bem-sucedidas no teste de resistência e não sofrem dano se normalmente sofreriam metade com sucesso.'},
          ],
        },
        6: {
          features: [
            {name: 'Magia Potente', description: 'Seus truques causam metade do dano numa criatura que seja bem-sucedida no teste de resistência, em vez de nenhum dano.'},
          ],
        },
        10: {
          features: [
            {name: 'Evocação Potencializada', description: 'Você pode adicionar seu modificador de Inteligência ao dano causado por qualquer magia de evocação sua.'},
          ],
        },
        14: {
          features: [
            {name: 'Sobrecarga', description: 'Quando conjurar uma magia de mago de 1º a 5º círculo que cause dano, pode causar o dano máximo em vez de rolar. A cada uso subsequente antes de um descanso longo, você sofre 2d12 de dano necrótico por círculo da magia, que ignora resistência e imunidade.'},
          ],
        },
      },
    },
    {
      id_subclass: 'conjuracao',
      displayName: 'Escola de Conjuração',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Conjuração Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de conjuração pro seu grimório é reduzido à metade.'},
            {name: 'Conjuração Menor', description: 'Como ação, você pode conjurar um objeto não-mágico na sua mão ou num espaço desocupado no chão a até 3 metros (até 0,9m³ ou 5kg). O objeto desaparece após 1 hora, se sofrer dano/causar dano, ou se você usar essa característica de novo.'},
          ],
        },
        6: {
          features: [
            {name: 'Transposição Benigna', description: 'Você pode se teletransportar até 9 metros para um espaço desocupado que possa ver, ou trocar de lugar com uma criatura disposta a até 9 metros, sem provocar ataques de oportunidade. Pode usar isso um número de vezes igual ao seu modificador de Inteligência (mínimo 1), recuperando após um descanso longo.'},
          ],
        },
        10: {
          features: [
            {name: 'Conjuração Focada', description: 'Qualquer criatura que você invocar ou criar com uma magia de conjuração ganha 30 pontos de vida a mais que o normal.'},
          ],
        },
        14: {
          features: [
            {name: 'Invocações Resistentes', description: 'Enquanto estiver concentrado numa magia de conjuração, você não pode ter sua concentração quebrada como resultado de sofrer dano.'},
          ],
        },
      },
    },
    {
      id_subclass: 'ilusao',
      displayName: 'Escola de Ilusão',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Ilusão Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de ilusão pro seu grimório é reduzido à metade.'},
            {name: 'Ilusão Menor Aprimorada', description: 'Você aprende o truque ilusão menor (se não conhecer) e pode fazê-lo criar tanto som quanto imagem com um único uso, em vez de um ou outro.'},
          ],
        },
        6: {
          features: [
            {name: 'Ilusões Moldáveis', description: 'Quando conjurar uma magia de ilusão com duração de 1 minuto ou mais, pode usar uma ação pra mudar a natureza dessa ilusão (dentro dos parâmetros originais da magia), desde que ainda possa ver a ilusão.'},
          ],
        },
        10: {
          features: [
            {name: 'Eu Ilusório', description: 'Quando uma criatura te atacar, pode usar sua reação pra criar a ilusão de si mesmo no mesmo espaço; o ataque erra automaticamente, e você se desloca até 1,5 metro sem provocar ataques de oportunidade.'},
          ],
        },
        14: {
          features: [
            {name: 'Realidade Ilusória', description: 'Quando conjurar uma magia de ilusão de 1º círculo ou superior, pode tornar um objeto não-mágico dentro dela real, existindo por 1 minuto ou até a ilusão terminar.'},
          ],
        },
      },
    },
    {
      id_subclass: 'necromancia',
      displayName: 'Escola de Necromancia',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Necromancia Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de necromancia pro seu grimório é reduzido à metade.'},
            {name: 'Colheita Sinistra', description: 'Uma vez por turno, quando você matar uma criatura com uma magia de 1º círculo ou superior, recupera pontos de vida iguais a duas vezes o círculo da magia (três vezes se for de necromancia).'},
          ],
        },
        6: {
          features: [
            {name: 'Escravos Mortos-Vivos', description: 'Quando conjurar animar mortos, pode animar um cadáver ou pilha de ossos adicional. Sempre que criar um morto-vivo com uma magia de necromancia, ele ganha PV máximos extras e um bônus de dano.'},
          ],
        },
        10: {
          features: [
            {name: 'Acostumado à Morte-Vida', description: 'Você tem resistência a dano necrótico e sua redução de PV máximo por efeitos necróticos é reduzida em metade.'},
          ],
        },
        14: {
          features: [
            {name: 'Comandar Mortos-Vivos', description: 'Como ação, você pode tomar controle mágico de um morto-vivo a até 18 metros que falhar num teste de resistência de Carisma, mesmo que já esteja sob controle de outro conjurador.'},
          ],
        },
      },
    },
    {
      id_subclass: 'transmutacao',
      displayName: 'Escola de Transmutação',
      featuresByLevel: {
        2: {
          features: [
            {name: 'Transmutação Instruída', description: 'O custo em tempo e ouro pra você copiar uma magia de transmutação pro seu grimório é reduzido à metade.'},
            {name: 'Pedra de Transmutador', description: 'Você pode criar uma pedra de transmutador (leva 8 horas) que concede um benefício mágico à criatura que a carrega: visão no escuro, deslocamento +3 metros, proficiência em um teste de resistência à sua escolha, ou resistência a um tipo de dano (ácido, frio, fogo, elétrico ou trovão).'},
          ],
        },
        6: {
          features: [
            {name: 'Metamorfo', description: 'Você pode conjurar transformar (alterar-se) em você mesmo sem gastar componente material, usando um espaço de magia disponível.'},
          ],
        },
        10: {
          features: [
            {name: 'Alquimia Menor', description: 'Como uma ação, pode transformar um objeto não-mágico noutra forma de objeto não-mágico similar (ex: madeira em pedra) por até 1 hora.'},
          ],
        },
        14: {
          features: [
            {name: 'Mestre Transmutador', description: 'Você pode consumir sua Pedra de Transmutador (se tiver uma) pra causar um dos seguintes efeitos: remover uma maldição, doença, veneno, cegueira ou surdez de uma criatura que a toque; restaurar 10 anos de idade a uma criatura; ou transformar uma criatura em outra forma de animal por até 1 hora.'},
          ],
        },
      },
    },
  ],
  11: [ // Paladino — escolhe Juramento Sagrado no nível 3
    {
      id_subclass: 'devocao',
      displayName: 'Juramento de Devoção',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Canalizar Divindade: Arma Sagrada', description: 'Como ação, você empunha sua arma com luz sagrada por 1 minuto: ela emite luz plena a 6 metros e penumbra por mais 6, ganha um bônus igual ao seu modificador de Carisma (mínimo +1) em jogadas de ataque, e causa dano radiante em vez do tipo normal.'},
            {name: 'Canalizar Divindade: Expulsar os Infiéis', description: 'Como ação, apresente seu símbolo sagrado — cada fiel ou morto-vivo a até 9 metros que possa vê-lo deve fazer um teste de resistência de Sabedoria ou ficará amedrontado por 1 minuto ou até sofrer dano.'},
          ],
        },
        7: {
          features: [
            {name: 'Aura de Devoção', description: 'Você e criaturas aliadas a até 3 metros (9 metros a partir do 18º nível) não podem ficar enfeitiçadas enquanto você estiver consciente.'},
          ],
        },
        15: {
          features: [
            {name: 'Pureza de Espírito', description: 'Você é imune a ficar enfeitiçado. Uma criatura mágica não pode ler seus pensamentos, mentir pra você por telepatia, ou influenciá-lo por encantamento, a menos que você permita.'},
          ],
        },
        20: {
          features: [
            {name: 'Halo Sagrado', description: 'Como ação, emane uma aura de luz solar por 1 minuto num raio de 9 metros. Inimigos na área têm desvantagem em testes de resistência contra suas magias de paladino e Canalizar Divindade. Além disso, uma vez por descanso longo, como ação, pode causar dano radiante igual ao seu nível de paladino em todo fiel ou morto-vivo na área.'},
          ],
        },
      },
    },
    {
      id_subclass: 'anciones',
      displayName: 'Juramento dos Anciões',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Canalizar Divindade: Ira da Natureza', description: 'Como ação, vinhas espectrais brotam do chão e tentam prender uma criatura a até 4,5 metros — teste de resistência de Força ou Destreza (à sua escolha) ou fica restringida, podendo repetir o teste no fim de cada um dos seus turnos.'},
            {name: 'Canalizar Divindade: Expulsar os Ímpios', description: 'Como ação, apresente seu símbolo sagrado — cada fada ou fiel a até 9 metros que possa vê-lo deve fazer um teste de resistência de Sabedoria ou ficará amedrontado por 1 minuto ou até sofrer dano.'},
          ],
        },
        7: {
          features: [
            {name: 'Aura dos Anciões', description: 'Você e criaturas aliadas a até 3 metros (9 metros a partir do 18º nível) têm resistência a dano causado por magias.'},
          ],
        },
        15: {
          features: [
            {name: 'Sentinela Imortal', description: 'Quando cair a 0 pontos de vida e não for morto instantaneamente, pode escolher cair a 1 ponto de vida em vez disso (uma vez por descanso longo). Também não sofre os efeitos da velhice e não pode ter sua idade aumentada magicamente.'},
          ],
        },
        20: {
          features: [
            {name: 'Campeão dos Anciões', description: 'Como ação, transforma-se num campeão ancião por 1 minuto: recupera 10 pontos de vida no início de cada um dos seus turnos, pode conjurar suas magias de paladino como ação bônus, e a cura recebida por criaturas hostis a até 3 metros de você fica reduzida à metade.'},
          ],
        },
      },
    },
    {
      id_subclass: 'vinganca',
      displayName: 'Juramento de Vingança',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Canalizar Divindade: Voto de Inimizade', description: 'Como ação, você jura vingança contra uma criatura que possa ver a até 3 metros, ganhando vantagem em jogadas de ataque contra ela por 1 minuto ou até ela cair a 0 pontos de vida ou ficar inconsciente.'},
            {name: 'Canalizar Divindade: Abjurar Inimigo', description: 'Como ação, uma criatura que você possa ver a até 18 metros deve fazer um teste de resistência de Sabedoria (CD de suas magias de paladino) ou ficará amedrontada por 1 minuto ou até sofrer dano — com deslocamento 0 e desvantagem em ataques contra qualquer um exceto você.'},
          ],
        },
        7: {
          features: [
            {name: 'Vingador Implacável', description: 'Quando acertar um ataque de oportunidade, pode usar parte da mesma reação para se mover até metade do seu deslocamento, sem provocar ataques de oportunidade dessa criatura.'},
          ],
        },
        15: {
          features: [
            {name: 'Alma de Vingança', description: 'Quando a criatura sob efeito do seu Voto de Inimizade fizer um ataque, você pode usar sua reação para realizar um ataque corpo-a-corpo com arma contra ela, se estiver ao seu alcance.'},
          ],
        },
        20: {
          features: [
            {name: 'Anjo Vingador', description: 'Como ação, assuma a forma de um anjo vingador por 1 hora: asas crescem nas suas costas, concedendo deslocamento de voo de 9 metros, e sua presença emana uma aura de ameaça num raio de 9 metros — inimigos hostis nela têm desvantagem em jogadas de ataque contra alvos que não sejam você.'},
          ],
        },
      },
    },
  ],
  12: [ // Ranger (Patrulheiro) — escolhe Conclave no nível 3
    {
      id_subclass: 'cacador',
      displayName: 'Conclave do Caçador',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Presa do Caçador', description: 'Escolha uma característica: Matador de Colossos (uma vez por turno, causa 1d8 de dano extra numa criatura que já tenha sofrido dano e não esteja com PV máximo), Matador de Gigantes (reação para atacar de volta uma criatura Grande ou maior que erre ou acerte você a até 1,5 metro), ou Destruidor de Hordas (quando acertar um ataque, pode fazer outro ataque contra uma criatura diferente a até 1,5 metro da primeira).'},
          ],
        },
        7: {
          features: [
            {name: 'Táticas Defensivas', description: 'Escolha uma característica: Escapar da Horda (vantagem em testes pra escapar de agarrão; ataques de oportunidade contra você têm desvantagem), Defesa Contra Múltiplos Ataques (+4 de CA contra o segundo ataque em diante da mesma criatura no mesmo turno), ou Vontade de Aço (vantagem em testes de resistência contra ficar amedrontado).'},
          ],
        },
        11: {
          features: [
            {name: 'Ataques Múltiplos', description: 'Escolha uma característica: Saraivada (ataque à distância contra todas as criaturas a até 3 metros de um ponto ao seu alcance, uma rolagem de ataque separada por criatura) ou Ataque Giratório (o mesmo, corpo-a-corpo, contra criaturas a até 1,5 metro de você).'},
          ],
        },
        15: {
          features: [
            {name: 'Defesa Superior de Caçador', description: 'Escolha uma característica: Esquiva Sobrenatural (reação pra reduzir à metade o dano de um ataque que te acertar), ou Resistir à Maré (quando uma criatura hostil errar você com um ataque corpo-a-corpo, force-a a repetir o ataque contra outra criatura à sua escolha).'},
          ],
        },
      },
    },
    {
      id_subclass: 'mestre-das-feras',
      displayName: 'Conclave da Besta',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Companheiro Animal', description: 'Você ganha um companheiro animal (fera de ND 1/4 ou menor, aprovada pelo mestre) que obedece seus comandos e usa seu bônus de proficiência em ataques, dano, CA, testes de resistência e perícias em que for proficiente. Ele age no seu turno se você usar sua ação pra comandá-lo; caso contrário, só pode usar a ação Esquivar.'},
          ],
        },
        7: {
          features: [
            {name: 'Vínculo com o Companheiro', description: 'Em qualquer turno que seu companheiro não atacar, você pode comandá-lo (como ação bônus) a Disparar, Desengajar, Esquivar ou Ajudar, em vez de gastar sua ação pra isso.'},
          ],
        },
        11: {
          features: [
            {name: 'Ataques Múltiplos do Companheiro', description: 'Quando você comandar seu companheiro a Atacar, ele pode fazer dois ataques.'},
          ],
        },
        15: {
          features: [
            {name: 'Companheiro Compartilhado', description: 'Quando você conjurar uma magia que afete só você, pode fazê-la afetar também seu companheiro animal, se ele estiver a até 9 metros de você.'},
          ],
        },
      },
    },
  ],
  7: [ // Guerreiro — escolhe Arquétipo Marcial no nível 3
    {
      id_subclass: 'campeao',
      displayName: 'Campeão',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Crítico Aprimorado', description: 'Seus ataques com arma adquirem uma margem de acerto crítico de 19 e 20 nas jogadas de ataque.'},
          ],
        },
        7: {
          features: [
            {name: 'Atletismo Extraordinário', description: 'Você adiciona metade do seu bônus de proficiência (arredondado para cima) em qualquer teste de Força, Destreza ou Constituição que você já não aplique seu bônus de proficiência. Além disso, quando fizer um salto longo com corrida, o alcance que você pode saltar aumenta em 0,3 metro vezes seu modificador de Força.'},
          ],
        },
        10: {
          features: [
            {name: 'Estilo de Combate Adicional', description: 'Você pode escolher um segundo Estilo de Combate da classe.'},
          ],
        },
        15: {
          features: [
            {name: 'Crítico Superior', description: 'Seus ataques com arma têm uma margem de acerto crítico de 18 a 20 nas jogadas de ataque.'},
          ],
        },
        18: {
          features: [
            {name: 'Sobrevivente', description: 'Você alcança o topo da resiliência em batalha. No começo de cada um dos seus turnos, você recupera pontos de vida iguais a 5 + seu modificador de Constituição, se estiver com metade de seus pontos de vida ou menos e não estiver com 0 pontos de vida.'},
          ],
        },
      },
    },
    {
      id_subclass: 'mestre-de-batalha',
      displayName: 'Mestre de Batalha',
      featuresByLevel: {
        3: {
          features: [
            {name: 'Superioridade em Combate', description: 'Você aprende manobras impulsionadas por dados de superioridade: 3 manobras conhecidas e 4 dados de superioridade (d8). Um dado é gasto quando você usa uma manobra; todos são recuperados ao terminar um descanso curto ou longo. CD para suas manobras = 8 + bônus de proficiência + modificador de Força ou Destreza (à sua escolha).'},
            {name: 'Estudioso da Guerra', description: 'Você ganha proficiência com um tipo de ferramenta de artesão à sua escolha.'},
          ],
        },
        7: {
          features: [
            {name: 'Conheça Seu Inimigo', description: 'Se você gastar pelo menos 1 minuto observando ou interagindo com outra criatura fora de combate, pode aprender como suas capacidades se comparam às suas (Força, Destreza, Constituição, CA, PV atuais, níveis de classe), a critério do mestre.'},
            {name: 'Mais Manobras e Dados', description: 'Você aprende mais 2 manobras (total de 5 conhecidas) e ganha mais 1 dado de superioridade (total de 5 dados).'},
          ],
        },
        10: {
          features: [
            {name: 'Superioridade em Combate Aprimorada', description: 'Seus dados de superioridade se tornam d10.'},
          ],
        },
        15: {
          features: [
            {name: 'Mais Manobras e Dados', description: 'Você aprende mais 2 manobras (total de 7 conhecidas) e ganha mais 1 dado de superioridade (total de 6 dados).'},
            {name: 'Implacável', description: 'Se você rolar iniciativa e não tiver nenhum dado de superioridade restante, recupera 1 dado de superioridade.'},
          ],
        },
        18: {
          features: [
            {name: 'Superioridade em Combate Aprimorada (d12)', description: 'Seus dados de superioridade se tornam d12.'},
          ],
        },
      },
    },
    {
      id_subclass: 'cavaleiro-arcano',
      displayName: 'Cavaleiro Arcano',
      spellcasting: {
        spellcastingAbility: 'INT',
        spellListClassId: 9, // Mago — WIZARD_CLASS_ID é declarado mais abaixo no arquivo, não dá pra referenciar aqui
        allowedSchools: ['Evocação', 'Abjuração'],
      },
      featuresByLevel: {
        3: {
          features: [
            {name: 'Conjuração', description: 'Você amplia seu conhecimento em magias com a habilidade de conjuração do Cavaleiro Arcano, focada nas escolas de Evocação e Abjuração da lista de magias de mago.'},
            {name: 'Vínculo com Arma', description: 'Você aprende um ritual que cria um vínculo místico com uma arma. Pode ter até duas armas vinculadas, e pode invocar uma arma vinculada para sua mão como uma ação bônus.'},
          ],
          resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '3'},
        },
        4: {features: [], resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '4'}},
        5: {features: [], resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '4'}},
        6: {features: [], resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '4'}},
        7: {
          features: [
            {name: 'Magia de Guerra', description: 'Quando você usa sua ação para conjurar um truque, pode fazer um ataque com arma como uma ação bônus.'},
          ],
          resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '5'},
        },
        8: {features: [], resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '6'}},
        9: {features: [], resources: {'Truques Conhecidos': '2', 'Magias Conhecidas': '6'}},
        10: {
          features: [
            {name: 'Golpe Místico', description: 'Quando você acerta uma criatura com um ataque de arma, ela tem desvantagem no próximo teste de resistência que fizer contra uma magia sua antes do final do seu próximo turno.'},
          ],
          resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '7'},
        },
        11: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '8'}},
        12: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '8'}},
        13: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '9'}},
        14: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '10'}},
        15: {
          features: [
            {name: 'Investida Arcana', description: 'Quando você usa sua ação de Surto de Ação, pode se teletransportar até 9 metros para um espaço desocupado que possa ver, antes ou depois da ação adicional.'},
          ],
          resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '10'},
        },
        16: {features: [], resources: {'Truques Conhecidos': '3', 'Magias Conhecidas': '11'}},
        17: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '11'}},
        18: {
          features: [
            {name: 'Magia de Guerra Aprimorada', description: 'Quando você usa sua ação para conjurar uma magia (não só um truque), pode fazer um ataque com arma como uma ação bônus.'},
          ],
          resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '12'},
        },
        19: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '13'}},
        20: {features: [], resources: {'Truques Conhecidos': '4', 'Magias Conhecidas': '14'}},
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Backgrounds
// ---------------------------------------------------------------------------

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

// export const ARMOR: Record<string, ArmorRule> = {
//   nenhuma: {baseAC: 10, armorType: 'none'},
//   'couro-batido': {baseAC: 12, armorType: 'light'},
//   'camisademalia': {baseAC: 13, armorType: 'medium', maxDexBonus: 2},
//   'cotademalia': {baseAC: 16, armorType: 'heavy', maxDexBonus: 0},
//   'armaduradeplacas': {baseAC: 18, armorType: 'heavy', maxDexBonus: 0},
//   'couro': {baseAC: 11, armorType: 'light'},
//   'cotadeescamas': {baseAC: 14, armorType: 'medium', maxDexBonus: 2},
// };

// ---------------------------------------------------------------------------
// Skill definitions
// ---------------------------------------------------------------------------

// export const SKILLS: Record<string, StatKeyEn> = {
//   acrobatics: 'DEX',
//   animal_handling: 'WIS',
//   arcana: 'INT',
//   athletics: 'STR',
//   deception: 'CHA',
//   history: 'INT',
//   insight: 'WIS',
//   intimidation: 'CHA',
//   investigation: 'INT',
//   medicine: 'WIS',
//   nature: 'INT',
//   perception: 'WIS',
//   performance: 'CHA',
//   persuasion: 'CHA',
//   religion: 'INT',
//   sleight_of_hand: 'DEX',
//   stealth: 'DEX',
//   survival: 'WIS',
// };

// ---------------------------------------------------------------------------
// Spell slots by class and level, 1-20
// ---------------------------------------------------------------------------

/**
 * Linha = nível (índice 0 = nível 1), colunas = espaços de [1º,2º,3º,4º,5º,6º,7º,8º,9º círculo].
 * Mesmas tabelas (PHB) já usadas no frontend em `constants/spell-rules.ts` — mantidas em
 * sincronia manualmente, não há import cross-repo.
 */
const FULL_CASTER_SLOT_ROWS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // nível 1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // nível 3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // nível 4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // nível 6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // nível 8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // nível 9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // nível 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // nível 11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // nível 12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // nível 13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // nível 14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // nível 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // nível 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // nível 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // nível 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // nível 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // nível 20
];

/** Meio-conjuradores (Paladino, Ranger) — começam a lançar magia só no nível 2. */
const HALF_CASTER_SLOT_ROWS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0], // nível 1
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // nível 2
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 3
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 4
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // nível 5
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // nível 6
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // nível 7
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // nível 8
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 9
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 10
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // nível 11
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // nível 12
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 13
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 14
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // nível 15
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // nível 16
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // nível 17
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // nível 18
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // nível 19
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // nível 20
];

/** Bruxo (Magia de Pacto) — todos os espaços ficam no círculo mais alto disponível. */
const WARLOCK_SLOT_ROWS: number[][] = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0], // nível 1
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // nível 2
  [0, 2, 0, 0, 0, 0, 0, 0, 0], // nível 3
  [0, 2, 0, 0, 0, 0, 0, 0, 0], // nível 4
  [0, 0, 2, 0, 0, 0, 0, 0, 0], // nível 5
  [0, 0, 2, 0, 0, 0, 0, 0, 0], // nível 6
  [0, 0, 0, 2, 0, 0, 0, 0, 0], // nível 7
  [0, 0, 0, 2, 0, 0, 0, 0, 0], // nível 8
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // nível 9
  [0, 0, 0, 0, 2, 0, 0, 0, 0], // nível 10
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 11
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 12
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 13
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 14
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 15
  [0, 0, 0, 0, 3, 0, 0, 0, 0], // nível 16
  [0, 0, 0, 0, 4, 0, 0, 0, 0], // nível 17
  [0, 0, 0, 0, 4, 0, 0, 0, 0], // nível 18
  [0, 0, 0, 0, 4, 0, 0, 0, 0], // nível 19
  [0, 0, 0, 0, 4, 0, 0, 0, 0], // nível 20
];

/** Terço-conjuradores de subclasse (Cavaleiro Arcano, Trapaceiro Arcano) — começam no nível 3, só até 4º círculo. */
const THIRD_CASTER_SLOT_ROWS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0], // nível 1
  [0, 0, 0, 0, 0, 0, 0, 0, 0], // nível 2
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // nível 3
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 4
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 5
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // nível 6
  [4, 0, 0, 0, 0, 0, 0, 0, 0], // nível 7
  [4, 0, 0, 0, 0, 0, 0, 0, 0], // nível 8
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // nível 9
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // nível 10
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // nível 11
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // nível 12
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 13
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 14
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // nível 15
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // nível 16
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 17
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 18
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 19
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // nível 20
];

function slotRowsToTable(rows: number[][]): Record<number, Record<string, number>> {
  const table: Record<number, Record<string, number>> = {};
  rows.forEach((row, rowIndex) => {
    const entry: Record<string, number> = {};
    row.forEach((count, circleIndex) => {
      if (count > 0) entry[`level_${circleIndex + 1}`] = count;
    });
    table[rowIndex + 1] = entry;
  });
  return table;
}

// Indexado por id_class (mais robusto que casar pelo nome de exibição normalizado).
export const SPELL_SLOTS: Record<number, Record<number, Record<string, number>>> = {
  9: slotRowsToTable(FULL_CASTER_SLOT_ROWS), // Mago
  4: slotRowsToTable(FULL_CASTER_SLOT_ROWS), // Clérigo
  2: slotRowsToTable(FULL_CASTER_SLOT_ROWS), // Bardo
  5: slotRowsToTable(FULL_CASTER_SLOT_ROWS), // Druida
  6: slotRowsToTable(FULL_CASTER_SLOT_ROWS), // Feiticeiro
  3: slotRowsToTable(WARLOCK_SLOT_ROWS), // Bruxo
  11: slotRowsToTable(HALF_CASTER_SLOT_ROWS), // Paladino
  12: slotRowsToTable(HALF_CASTER_SLOT_ROWS), // Ranger (Patrulheiro)
};

/** Tabela de espaços dos terço-conjuradores de subclasse — não é indexada por id_class (várias
 *  classes diferentes podem ter uma subclasse terço-conjuradora), então fica à parte de `SPELL_SLOTS`. */
export const THIRD_CASTER_SLOTS: Record<number, Record<string, number>> = slotRowsToTable(THIRD_CASTER_SLOT_ROWS);

/**
 * Bardo, Bruxo, Feiticeiro, Ranger — conhecem um total fixo de magias (armazenado em
 * `featuresByLevel[n].resources['Magias Conhecidas']`), livremente distribuídas entre os
 * círculos acessíveis, ao contrário de Clérigo/Druida/Paladino (que "conhecem" até o limite de
 * espaços por círculo — ver `SPELL_SLOTS`). Mesmo agrupamento usado no frontend
 * (`KNOWN_CASTER_CLASS_IDS` em `constants/spell-rules.ts`) — mantido em sincronia manualmente.
 */
export const KNOWN_CASTER_CLASS_IDS: ReadonlySet<number> = new Set([2, 3, 6, 12]);

export const WIZARD_CLASS_ID = 9;

/** Tamanho do grimório do Mago — cresce 2 magias por nível, a partir do 1º. */
export function getWizardSpellbookSize(level: number): number {
  return 6 + 2 * (level - 1);
}
