/**
 * Idiomas e ferramentas "à escolha" (1.24.0): o que a raça (Humano, Meio-Elfo) e o antecedente
 * deixam o jogador escolher. Escolhido na criação ou depois, na ficha; guardado em
 * `character.chosen_languages` e `character.chosen_tools`. O que não foi escolhido continua
 * aparecendo como "Idioma à escolha N" / o texto genérico da ferramenta.
 */
import {BackgroundRule, RaceRule} from './rules';
import {TOOL_PROFICIENCY_OPTIONS} from './feats';

/** Idiomas do Livro do Jogador (comuns e exóticos). */
export const LANGUAGES: readonly string[] = [
  'Comum',
  'Anão',
  'Élfico',
  'Gigante',
  'Gnômico',
  'Goblin',
  'Halfling',
  'Orc',
  'Abissal',
  'Celestial',
  'Dracônico',
  'Infernal',
  'Primordial',
  'Silvestre',
  'Subcomum',
];

const ARTISAN_TOOLS = TOOL_PROFICIENCY_OPTIONS.filter(
  t =>
    t.startsWith('Ferramentas de') ||
    t.startsWith('Suprimentos de') ||
    t.startsWith('Utensílios de'),
).filter(
  t => !['Ferramentas de Navegador', 'Ferramentas de Ladrão'].includes(t),
);

/** Ferramenta genérica do antecedente → as opções do livro. */
export const TOOL_CHOICES: Record<string, readonly string[]> = {
  'Um tipo de kit de jogo': [
    'Dados',
    'Baralho',
    'Xadrez dos Dragões',
    'Ante dos Três Dragões',
  ],
  'Um tipo de instrumento musical': [
    'Alaúde',
    'Charamela',
    'Flauta',
    'Flauta de Pã',
    'Gaita de Foles',
    'Lira',
    'Saltério',
    'Tambor',
    'Trompa',
    'Viola',
  ],
  'Ferramentas de Artesão': ARTISAN_TOOLS,
};

export interface ChoiceSlots {
  /** Quantos idiomas a raça e o antecedente deixam escolher. */
  languages: number;
  /** Idiomas que o personagem já tem (não podem ser escolhidos de novo). */
  fixed_languages: string[];
  /** Ferramentas genéricas do antecedente com as opções de cada uma. */
  tools: {placeholder: string; options: readonly string[]}[];
}

export function choiceSlots(
  raceRule: RaceRule,
  bgRule: BackgroundRule,
): ChoiceSlots {
  return {
    languages: (raceRule.extraLanguages ?? 0) + bgRule.languages,
    fixed_languages: [...raceRule.languages],
    tools: bgRule.tools
      .filter(t => TOOL_CHOICES[t])
      .map(t => ({placeholder: t, options: TOOL_CHOICES[t]})),
  };
}

/** Confere as escolhas; lança Error (vira 422) se algo não vale. Ausente = nada escolhido. */
export function validateLanguageToolChoices(
  slots: ChoiceSlots,
  languages: unknown,
  tools: unknown,
): {languages: string[]; tools: Record<string, string>} {
  const langs = languages == null ? [] : languages;
  if (!Array.isArray(langs) || langs.some(l => typeof l !== 'string'))
    throw new Error('Idiomas inválidos');
  if (langs.length > slots.languages)
    throw new Error(`Idiomas demais: o limite é ${slots.languages}`);
  if (new Set(langs).size !== langs.length) throw new Error('Idioma repetido');
  for (const l of langs as string[]) {
    if (!LANGUAGES.includes(l)) throw new Error(`Idioma desconhecido: ${l}`);
    if (slots.fixed_languages.includes(l)) throw new Error(`Você já fala ${l}`);
  }

  const toolMap = tools == null ? {} : tools;
  if (typeof toolMap !== 'object' || Array.isArray(toolMap))
    throw new Error('Ferramentas inválidas');
  const result: Record<string, string> = {};
  for (const [placeholder, value] of Object.entries(
    toolMap as Record<string, unknown>,
  )) {
    const slot = slots.tools.find(t => t.placeholder === placeholder);
    if (!slot)
      throw new Error(`Escolha de ferramenta inesperada: ${placeholder}`);
    if (typeof value !== 'string' || !slot.options.includes(value))
      throw new Error(`Opção inválida para ${placeholder}`);
    result[placeholder] = value;
  }
  return {languages: langs as string[], tools: result};
}

/** Idiomas da ficha: os fixos da raça, os escolhidos e "Idioma à escolha N" no que faltar. */
export function sheetLanguages(
  slots: ChoiceSlots,
  chosen: string[] | null | undefined,
): string[] {
  const picked = (chosen ?? [])
    .filter(l => LANGUAGES.includes(l) && !slots.fixed_languages.includes(l))
    .slice(0, slots.languages);
  const missing = slots.languages - picked.length;
  const placeholders = Array.from(
    {length: missing},
    (_, i) => `Idioma à escolha ${i + 1}`,
  );
  return [...new Set([...slots.fixed_languages, ...picked, ...placeholders])];
}

/** Ferramentas da ficha: troca o texto genérico pela escolha, quando houver. */
export function sheetTools(
  tools: string[],
  chosen: Record<string, string> | null | undefined,
): string[] {
  return tools.map(t => {
    const pick = chosen?.[t];
    return pick && TOOL_CHOICES[t]?.includes(pick) ? pick : t;
  });
}
