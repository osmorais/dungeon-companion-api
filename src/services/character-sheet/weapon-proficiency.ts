/**
 * Proficiência em armas: a arma soma a proficiência no ataque só se o personagem souber usá-la
 * (classe, raça, sub-raça ou subclasse). Os nomes das armas são os da tabela `weapon` do banco.
 */

export type WeaponCategory = 'simples' | 'marcial';

/** Categoria de cada arma do catálogo (`docs/database/database_inserts.sql`). */
export const WEAPON_CATEGORY: Record<string, WeaponCategory> = {
  // Simples corpo a corpo
  Adaga: 'simples',
  Azagaia: 'simples',
  Bordão: 'simples',
  'Clava Grande': 'simples',
  'Foice Curta': 'simples',
  Lança: 'simples',
  Maça: 'simples',
  Machadinha: 'simples',
  'Martelo Leve': 'simples',
  Porrete: 'simples',
  // Simples à distância
  'Arco Curto': 'simples',
  'Besta Leve': 'simples',
  Dardo: 'simples',
  Funda: 'simples',
  // Marciais corpo a corpo
  Alabarda: 'marcial',
  Cimitarra: 'marcial',
  Chicote: 'marcial',
  'Espada Curta': 'marcial',
  'Espada Grande': 'marcial',
  'Espada Longa': 'marcial',
  Glaive: 'marcial',
  'Lança de Montaria': 'marcial',
  'Lança Longa': 'marcial',
  'Maça Estrela': 'marcial',
  'Machado Grande': 'marcial',
  'Machado de Batalha': 'marcial',
  Malho: 'marcial',
  Mangual: 'marcial',
  'Martelo de Guerra': 'marcial',
  'Picareta de Guerra': 'marcial',
  Rapieira: 'marcial',
  Tridente: 'marcial',
  // Marciais à distância
  'Arco Longo': 'marcial',
  'Besta de Mão': 'marcial',
  'Besta Pesada': 'marcial',
  Rede: 'marcial',
  Zarabatana: 'marcial',
};

/**
 * Proficiências por arma específica, como estão escritas nas regras (plural), → arma do catálogo.
 * "Cajados"/"Bastões" são o Bordão; "Clavas" é o Porrete.
 */
const SPECIFIC_PROFICIENCIES: Record<string, string> = {
  adagas: 'Adaga',
  azagaias: 'Azagaia',
  bastoes: 'Bordão',
  cajados: 'Bordão',
  clavas: 'Porrete',
  dardos: 'Dardo',
  fundas: 'Funda',
  macas: 'Maça',
  lancas: 'Lança',
  foices: 'Foice Curta',
  cimitarras: 'Cimitarra',
  'bestas leves': 'Besta Leve',
  'bestas de mao': 'Besta de Mão',
  'espadas curtas': 'Espada Curta',
  'espadas longas': 'Espada Longa',
  rapieiras: 'Rapieira',
  'arcos curtos': 'Arco Curto',
  'arcos longos': 'Arco Longo',
  'machados de batalha': 'Machado de Batalha',
  machadinhas: 'Machadinha',
  'martelos leves': 'Martelo Leve',
  'martelos de guerra': 'Martelo de Guerra',
};

/** Subclasses que dão proficiência em armas marciais (Domínios da Guerra e da Tempestade, Colégio da Bravura). */
export const SUBCLASS_MARTIAL_WEAPONS = new Set([
  'guerra',
  'tempestade',
  'bravura',
]);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Lista de proficiências em armas do personagem (o que a ficha mostra). */
export function weaponProficiencyList(
  sources: (string[] | null | undefined)[],
  idSubclass?: string | null,
): string[] {
  const list = sources.flatMap(s => s ?? []);
  if (idSubclass && SUBCLASS_MARTIAL_WEAPONS.has(idSubclass))
    list.push('Armas Marciais');
  return [...new Set(list)];
}

/**
 * O personagem sabe usar a arma? Arma fora do catálogo (nome desconhecido) conta como proficiente,
 * pra não tirar bônus de algo que a regra não conhece.
 */
export function isProficientWithWeapon(
  weaponName: string,
  proficiencies: string[],
): boolean {
  const category = WEAPON_CATEGORY[weaponName];
  if (!category) return true;
  return proficiencies.some(raw => {
    const prof = normalize(raw);
    if (prof === 'armas simples') return category === 'simples';
    if (prof === 'armas marciais') return true;
    return SPECIFIC_PROFICIENCIES[prof] === weaponName;
  });
}
