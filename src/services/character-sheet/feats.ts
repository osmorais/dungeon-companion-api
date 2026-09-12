/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn} from '../../models/character-sheet-types';

/**
 * Catálogo de feats pro sistema de level-up (Fase 1) — todos os talentos do capítulo
 * "Opções de Personalização" do livro (`docs/livro.txt`). `abilityIncrease` é aplicado
 * automaticamente pelo level-up (mesmo mecanismo do ASI) usando um atributo fixo quando o
 * talento deixa a escolha livre pro jogador (ex: "Força ou Destreza" vira sempre Força); o
 * resto do efeito do feat é só texto informativo na ficha, sem aplicação mecânica automática —
 * mesma premissa usada pras features de classe na Fase 1. Pré-requisitos do livro (quando
 * existem) aparecem só como texto na descrição; nada os impede de ser escolhidos hoje.
 */
export interface FeatRule {
  id_feat: string;
  displayName: string;
  description: string;
  abilityIncrease?: {stat: StatKeyEn; amount: number};
  /**
   * PV extra por nível (hoje só o Vigoroso): ao ganhar o talento, aplica-se um bônus retroativo de
   * `hpBonusPerLevel * nível_atual` de uma vez; em cada level-up seguinte, soma-se
   * `hpBonusPerLevel` a mais no ganho normal do dado de vida. Ver `confirmLevelUp`.
   */
  hpBonusPerLevel?: number;
  /** Bônus fixo de iniciativa (hoje só o Alerta). */
  initiativeBonus?: number;
  /** Bônus fixo de percepção passiva (hoje só o Analítico). */
  passivePerceptionBonus?: number;
}

export const FEATS: Record<string, FeatRule> = {
  atleta: {
    id_feat: 'atleta',
    displayName: 'Atleta',
    description:
      'Você ganha +1 em Força ou Destreza. Além disso: levantar-se de deitado só custa metade do seu deslocamento; escalar não custa deslocamento extra; e você pode fazer um salto com corrida depois de se mover só 1,5 metro, em vez de 3 metros.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  duro: {
    id_feat: 'duro',
    displayName: 'Vigoroso',
    description:
      'Seu máximo de pontos de vida aumenta em 2 pra cada nível que você tiver, com esse aumento retroagindo aos níveis anteriores também. Sempre que você ganhar um nível depois, seu máximo de pontos de vida aumenta 2 pontos a mais do que aumentaria normalmente.',
    hpBonusPerLevel: 2,
  },
  observador: {
    id_feat: 'observador',
    displayName: 'Analítico',
    description:
      'Você ganha +1 em Inteligência ou Sabedoria. Além disso: sua percepção passiva e sua investigação passiva aumentam em 5; e você consegue ler lábios se conseguir ver a boca de uma criatura falando um idioma que você entende.',
    abilityIncrease: {stat: 'WIS', amount: 1},
    passivePerceptionBonus: 5,
  },
  resiliente: {
    id_feat: 'resiliente',
    displayName: 'Resiliente',
    description:
      'Escolha um atributo. Você ganha +1 nesse atributo e proficiência em testes de resistência com ele.',
    abilityIncrease: {stat: 'CON', amount: 1},
  },
  alerta: {
    id_feat: 'alerta',
    displayName: 'Alerta',
    description:
      'Você ganha +5 na iniciativa, não pode ficar surpreso enquanto estiver consciente, e outras criaturas não ganham vantagem em jogadas de ataque contra você por estarem escondidas de você.',
    initiativeBonus: 5,
  },
  'afiar-habilidades': {
    id_feat: 'afiar-habilidades',
    displayName: 'Habilidoso',
    description:
      'Você ganha proficiência em três perícias ou ferramentas à sua escolha.',
  },
  'iniciado-em-magia': {
    id_feat: 'iniciado-em-magia',
    displayName: 'Iniciado em Magia',
    description:
      'Escolha uma classe conjuradora. Você aprende dois truques dessa classe à sua escolha, e uma magia de 1º nível dessa mesma lista (lançável uma vez por descanso longo sem gastar espaço de magia, ou usando um espaço de magia se você tiver algum).',
  },
  'duelista-defensivo': {
    id_feat: 'duelista-defensivo',
    displayName: 'Duelista Defensivo',
    description:
      'Pré-requisito: Destreza 13 ou maior. Você ganha +1 em Destreza. Além disso, quando empunhar uma arma leve com a qual tenha proficiência e for atingido por um ataque corpo a corpo, pode usar sua reação pra somar seu bônus de proficiência à CA contra aquele ataque, potencialmente fazendo-o errar.',
    abilityIncrease: {stat: 'DEX', amount: 1},
  },
  'adepto-elemental': {
    id_feat: 'adepto-elemental',
    displayName: 'Adepto Elemental',
    description:
      'Pré-requisito: a habilidade de conjurar ao menos uma magia. Escolha um tipo de dano: ácido, elétrico, fogo, frio ou trovejante. Suas magias ignoram qualquer resistência a esse tipo de dano, e ao determinar o dano de uma magia sua desse tipo, todo resultado 1 no dado é tratado como 2. Você pode escolher este talento várias vezes, desde que escolha um tipo de dano diferente a cada vez.',
  },
  'atacante-selvagem': {
    id_feat: 'atacante-selvagem',
    displayName: 'Atacante Selvagem',
    description:
      'Uma vez em cada um dos seus turnos, ao causar dano corpo a corpo com uma arma, você pode rolar o dado de dano da arma duas vezes e usar o resultado que preferir.',
  },
  'atirador-arcano': {
    id_feat: 'atirador-arcano',
    displayName: 'Atirador Arcano',
    description:
      'Pré-requisito: a habilidade de conjurar ao menos uma magia. Ao conjurar uma magia que exija uma jogada de ataque, o alcance dela é dobrado. Seus ataques mágicos à distância ignoram meia cobertura e três-quartos de cobertura. Além disso, você aprende um truque que exija uma jogada de ataque, escolhido da lista de bardo, bruxo, clérigo, druida, feiticeiro ou mago; seu atributo de conjuração pra esse truque depende da lista escolhida.',
  },
  ator: {
    id_feat: 'ator',
    displayName: 'Ator',
    description:
      'Você ganha +1 em Carisma, até um máximo de 20. Tem vantagem em testes de Carisma (Enganação) e Carisma (Atuação) ao tentar se passar por outra pessoa, e pode imitar a voz de outra pessoa ou sons feitos por outras criaturas, desde que já os tenha ouvido por pelo menos 1 minuto.',
    abilityIncrease: {stat: 'CHA', amount: 1},
  },
  'combatente-montado': {
    id_feat: 'combatente-montado',
    displayName: 'Combatente Montado',
    description:
      'Ao lutar montado e não estar incapacitado, você tem vantagem em jogadas de ataque contra criaturas desmontadas menores que sua montaria. Pode fazer com que um ataque direcionado à sua montaria seja desferido contra você no lugar, e se sua montaria for alvo de um efeito que permita uma salvaguarda de Destreza pra reduzir o dano à metade, ela não sofre dano nenhum se for bem-sucedida, e só metade se falhar.',
  },
  'conjurador-belico': {
    id_feat: 'conjurador-belico',
    displayName: 'Conjurador Bélico',
    description:
      'Pré-requisito: a habilidade de conjurar ao menos uma magia. Você tem vantagem em salvaguardas de Constituição pra manter a concentração em uma magia ao sofrer dano, pode realizar os componentes somáticos de magias mesmo com as mãos ocupadas empunhando armas ou escudo, e pode usar sua reação pra conjurar uma magia (tempo de conjuração de 1 ação, afetando só a criatura) no lugar de um ataque de oportunidade.',
  },
  'conjurador-ritualista': {
    id_feat: 'conjurador-ritualista',
    displayName: 'Conjurador Ritualista',
    description:
      'Pré-requisito: Inteligência ou Sabedoria 13 ou maior. Você ganha um livro de rituais contendo duas magias de 1º círculo com a propriedade ritual, escolhidas da lista de uma classe conjuradora à sua escolha (bardo, bruxo, clérigo, druida, feiticeiro ou mago); a classe escolhida determina seu atributo de conjuração pra essas magias. Você pode copiar novas magias rituais encontradas nesse livro, desde que pertençam à lista escolhida e não sejam de círculo maior que a metade do seu nível (arredondado pra cima).',
  },
  curandeiro: {
    id_feat: 'curandeiro',
    displayName: 'Curandeiro',
    description:
      'Quando você usa um kit de curandeiro pra estabilizar uma criatura moribunda, ela também recupera 1 ponto de vida. Além disso, com uma ação você pode gastar um uso do kit de curandeiro pra restaurar 1d6+4 pontos de vida a uma criatura, mais uma quantidade adicional igual ao número máximo de Dados de Vida dela; ela não pode se beneficiar deste talento de novo até completar um descanso curto ou longo.',
  },
  'especialista-ambidestro': {
    id_feat: 'especialista-ambidestro',
    displayName: 'Especialista Ambidestro',
    description:
      'Você ganha +1 na CA enquanto empunha uma arma de combate corpo a corpo em cada mão. Pode lutar com duas armas mesmo que sejam de uma mão e não leves, e pode sacar ou guardar duas armas de uma mão quando normalmente só conseguiria fazer isso com uma.',
  },
  'especialista-armaduras-leves': {
    id_feat: 'especialista-armaduras-leves',
    displayName: 'Especialista em Armaduras Leves',
    description:
      'Você ganha +1 em Força ou Destreza, até um máximo de 20, e proficiência com armaduras leves.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  'especialista-armaduras-medias': {
    id_feat: 'especialista-armaduras-medias',
    displayName: 'Especialista em Armaduras Médias',
    description:
      'Pré-requisito: proficiência com armaduras leves. Você ganha +1 em Força ou Destreza, até um máximo de 20, e proficiência com armaduras médias e escudos.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  'especialista-armaduras-pesadas': {
    id_feat: 'especialista-armaduras-pesadas',
    displayName: 'Especialista em Armaduras Pesadas',
    description:
      'Pré-requisito: proficiência com armaduras médias. Você ganha +1 em Força, até um máximo de 20, e proficiência com armaduras pesadas.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  'especialista-em-besta': {
    id_feat: 'especialista-em-besta',
    displayName: 'Especialista em Besta',
    description:
      'Você ignora a propriedade Recarga das bestas com as quais é proficiente. Estar a até 1,5 metro de uma criatura hostil não impõe desvantagem nas suas jogadas de ataque à distância. E ao usar a ação Atacar pra golpear com uma arma de uma mão, você pode usar sua ação bônus pra atacar com uma besta de mão que esteja empunhando.',
  },
  'explorador-de-masmorras': {
    id_feat: 'explorador-de-masmorras',
    displayName: 'Explorador de Masmorras',
    description:
      'Você tem vantagem em testes de Sabedoria (Percepção) e Inteligência (Investigação) pra detectar portas secretas, e em salvaguardas pra evitar ou resistir a armadilhas. Você tem resistência a dano causado por armadilhas, e viajar em ritmo rápido não te impõe a penalidade de -5 na Sabedoria (Percepção) passiva.',
  },
  'exterminador-de-conjuradores': {
    id_feat: 'exterminador-de-conjuradores',
    displayName: 'Exterminador de Conjuradores',
    description:
      'Quando uma criatura a até 1,5 metro de você conjura uma magia, você pode usar sua reação pra atacá-la com uma arma corpo a corpo. Quando você causa dano numa criatura concentrada em uma magia, ela tem desvantagem na salvaguarda de concentração, e você tem vantagem em salvaguardas contra magias conjuradas por criaturas a até 1,5 metro de você.',
  },
  mobilizador: {
    id_feat: 'mobilizador',
    displayName: 'Mobilizador',
    description:
      'Pré-requisito: Força 13 ou maior. Você tem vantagem nas jogadas de ataque contra uma criatura que você já esteja agarrando. Além disso, pode usar sua ação pra tentar imobilizar uma criatura já agarrada: faça outro teste de agarrar, e se for bem-sucedido, você e a criatura ficam imobilizados até o agarramento terminar.',
  },
  'lider-inspirador': {
    id_feat: 'lider-inspirador',
    displayName: 'Líder Inspirador',
    description:
      'Pré-requisito: Carisma 13 ou maior. Você pode dedicar 10 minutos pra inspirar até seis criaturas amigáveis (você incluso) a até 9 metros de você que possam vê-lo, ouvi-lo e entendê-lo. Cada uma ganha pontos de vida temporários iguais ao seu nível + seu modificador de Carisma; uma criatura não pode ganhar esses PV temporários de novo até completar um descanso curto ou longo.',
  },
  ligeiro: {
    id_feat: 'ligeiro',
    displayName: 'Ligeiro',
    description:
      'Seu deslocamento aumenta em 3 metros. Ao usar a ação Correr em terreno difícil, você não paga custo de movimento adicional nesse turno, e ao acertar ou errar um ataque corpo a corpo contra uma criatura, você não provoca ataques de oportunidade dela pelo restante do turno.',
  },
  linguista: {
    id_feat: 'linguista',
    displayName: 'Linguista',
    description:
      'Você ganha +1 em Inteligência, até um máximo de 20. Aprende três idiomas à sua escolha, e pode criar cifras escritas que só você (ou quem você ensinar) consegue decifrar sem um teste de Inteligência ou magia.',
    abilityIncrease: {stat: 'INT', amount: 1},
  },
  'mente-aguda': {
    id_feat: 'mente-aguda',
    displayName: 'Mente Aguçada',
    description:
      'Você ganha +1 em Inteligência, até um máximo de 20. Sempre sabe pra que lado fica o norte e quantas horas faltam pro nascer ou pôr do sol, e consegue lembrar com precisão de qualquer coisa que tenha visto ou ouvido no último mês.',
    abilityIncrease: {stat: 'INT', amount: 1},
  },
  'mestre-atirador': {
    id_feat: 'mestre-atirador',
    displayName: 'Mestre-Atirador',
    description:
      'Ataques realizados à distância máxima da arma não impõem desvantagem na sua jogada de ataque. Seus ataques com armas à distância ignoram meia cobertura e três-quartos de cobertura. Antes de rolar um ataque com uma arma à distância com a qual seja proficiente, você pode escolher sofrer -5 na jogada de ataque em troca de +10 no dano, caso acerte.',
  },
  'mestre-das-armas': {
    id_feat: 'mestre-das-armas',
    displayName: 'Mestre das Armas',
    description:
      'Você ganha +1 em Força ou Destreza, até um máximo de 20, e proficiência com quatro armas simples ou marciais à sua escolha.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  'mestre-armaduras-medias': {
    id_feat: 'mestre-armaduras-medias',
    displayName: 'Mestre em Armaduras Médias',
    description:
      'Pré-requisito: proficiência com armaduras médias. Usar armadura média não impõe mais desvantagem nos seus testes de Destreza (Furtividade). Além disso, se sua Destreza for 16 ou maior, você pode adicionar 3, em vez de 2, à sua CA ao usar uma armadura média.',
  },
  'mestre-armaduras-pesadas': {
    id_feat: 'mestre-armaduras-pesadas',
    displayName: 'Mestre em Armaduras Pesadas',
    description:
      'Pré-requisito: proficiência com armaduras pesadas. Você ganha +1 em Força, até um máximo de 20. Enquanto estiver usando armadura pesada, reduz em 3 qualquer dano contundente, cortante ou perfurante de armas não-mágicas que você venha a sofrer.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
  'mestre-armas-de-haste': {
    id_feat: 'mestre-armas-de-haste',
    displayName: 'Mestre em Armas de Haste',
    description:
      'Ao usar a ação Atacar com uma alabarda, bastão, glaive ou lança, você pode usar sua ação bônus pra atacar corpo a corpo com a extremidade oposta da arma (mesmo modificador de atributo, dano 1d4 contundente). Além disso, enquanto empunhar uma dessas armas ou uma lança longa, qualquer criatura que entre no alcance dela provoca um ataque de oportunidade seu.',
  },
  'mestre-armas-grandes': {
    id_feat: 'mestre-armas-grandes',
    displayName: 'Mestre em Armas Grandes',
    description:
      'No seu turno, ao tirar um crítico com uma arma corpo a corpo ou reduzir uma criatura a 0 PV com ela, você pode usar sua ação bônus pra fazer um segundo ataque corpo a corpo. Antes de rolar um ataque corpo a corpo com uma arma pesada com a qual seja proficiente, você pode escolher sofrer -5 na jogada de ataque em troca de +10 no dano, caso acerte.',
  },
  'mestre-em-escudos': {
    id_feat: 'mestre-em-escudos',
    displayName: 'Mestre em Escudos',
    description:
      'Ao usar a ação Atacar no seu turno, você pode usar sua ação bônus pra empurrar com o escudo uma criatura a até 1,5 metro. Se não estiver incapacitado, soma o bônus de CA do seu escudo em salvaguardas de Destreza contra magias ou efeitos que afetem só você; e se for bem-sucedido numa salvaguarda de Destreza que reduziria o dano à metade, pode usar sua reação pra não sofrer dano nenhum.',
  },
  resistente: {
    id_feat: 'resistente',
    displayName: 'Resistente',
    description:
      'Você ganha +1 em Constituição, até um máximo de 20. Ao rolar um Dado de Vida pra recuperar pontos de vida, o mínimo que você recupera é igual ao dobro do seu modificador de Constituição (no mínimo 2).',
    abilityIncrease: {stat: 'CON', amount: 1},
  },
  sentinela: {
    id_feat: 'sentinela',
    displayName: 'Sentinela',
    description:
      'Ao acertar um ataque de oportunidade, o deslocamento da criatura atingida se torna 0 pelo resto do turno. Criaturas a até 1,5 metro de você provocam seus ataques de oportunidade mesmo usando a ação Desengajar, e quando uma criatura a até 1,5 metro de você ataca outro alvo que não tenha este talento, você pode usar sua reação pra atacá-la com uma arma corpo a corpo.',
  },
  sorrateiro: {
    id_feat: 'sorrateiro',
    displayName: 'Sorrateiro',
    description:
      'Pré-requisito: Destreza 13 ou maior. Você pode tentar se esconder de uma criatura mesmo estando só levemente obscurecido por ela. Quando está escondido e erra um ataque à distância, sua posição não é revelada, e penumbra não impõe desvantagem nos seus testes de Sabedoria (Percepção) baseados em visão.',
  },
  sortudo: {
    id_feat: 'sortudo',
    displayName: 'Sortudo',
    description:
      'Você tem 3 pontos de sorte. Sempre que fizer uma jogada de ataque, teste de atributo ou salvaguarda, pode gastar um ponto de sorte pra jogar 1d20 adicional, escolhendo qual dos dados usar depois de vê-los. Também pode gastar um ponto de sorte quando for alvo de uma jogada de ataque, jogando 1d20 e escolhendo se o ataque usa sua jogada ou a do atacante. Você recupera todos os pontos de sorte gastos após um descanso longo.',
  },
  'valentao-de-taverna': {
    id_feat: 'valentao-de-taverna',
    displayName: 'Valentão de Taverna',
    description:
      'Você ganha +1 em Força ou Constituição, até um máximo de 20. É proficiente com armas improvisadas, seus ataques desarmados causam 1d4 de dano, e ao acertar uma criatura com um ataque desarmado ou arma improvisada, pode usar sua ação bônus pra tentar agarrá-la.',
    abilityIncrease: {stat: 'STR', amount: 1},
  },
};
