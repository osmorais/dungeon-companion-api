/* eslint-disable @typescript-eslint/naming-convention */
import {StatKeyEn} from '../../models/character-sheet-types';

/**
 * Catálogo inicial de feats pro sistema de level-up (Fase 1) — um subconjunto dos feats do
 * PHB, não a lista completa. `abilityIncrease` é aplicado automaticamente pelo level-up (mesmo
 * mecanismo do ASI); o resto do efeito do feat é só texto informativo na ficha, sem aplicação
 * mecânica automática — mesma premissa usada pras features de classe na Fase 1.
 */
export interface FeatRule {
  id_feat: string;
  displayName: string;
  description: string;
  abilityIncrease?: {stat: StatKeyEn; amount: number};
  /**
   * PV extra por nível (hoje só o Duro): ao ganhar o talento, aplica-se um bônus retroativo de
   * `hpBonusPerLevel * nível_atual` de uma vez; em cada level-up seguinte, soma-se
   * `hpBonusPerLevel` a mais no ganho normal do dado de vida. Ver `confirmLevelUp`.
   */
  hpBonusPerLevel?: number;
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
    displayName: 'Duro',
    description:
      'Seu máximo de pontos de vida aumenta em 2 pra cada nível que você tiver, com esse aumento retroagindo aos níveis anteriores também. Sempre que você ganhar um nível depois, seu máximo de pontos de vida aumenta 2 pontos a mais do que aumentaria normalmente.',
    hpBonusPerLevel: 2,
  },
  observador: {
    id_feat: 'observador',
    displayName: 'Observador',
    description:
      'Você ganha +1 em Inteligência ou Sabedoria. Além disso: sua percepção passiva e sua investigação passiva aumentam em 5; e você consegue ler lábios se conseguir ver a boca de uma criatura falando um idioma que você entende.',
    abilityIncrease: {stat: 'WIS', amount: 1},
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
  },
  'afiar-habilidades': {
    id_feat: 'afiar-habilidades',
    displayName: 'Afiar Habilidades',
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
      'Você ganha +1 em Destreza. Além disso, quando empunhar uma arma leve com a qual tenha proficiência e for atingido por um ataque corpo a corpo, pode usar sua reação pra somar seu bônus de proficiência à CA contra aquele ataque, potencialmente fazendo-o errar.',
    abilityIncrease: {stat: 'DEX', amount: 1},
  },
};
