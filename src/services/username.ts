/**
 * Nome de usuário (1.9.0): único no site, aparece pra mesa (jogador e mestre) e no ranking.
 * Letras sem acento, números, `_` e `-`, de 3 a 20 caracteres. A unicidade ignora maiúsculas
 * (índice único em `LOWER(username)`), mas o nome é guardado como a pessoa digitou.
 * O web repete estas regras em `src/app/auth/username.ts` — mudou aqui, muda lá.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Quantas sugestões devolver quando o nome está em uso (ou é inválido). */
export const USERNAME_SUGGESTION_COUNT = 3;

/** Mensagem do problema de formato, ou `null` se o nome é válido. */
export function usernameFormatError(username: string): string | null {
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH
  )
    return `O nome de usuário deve ter de ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres`;
  if (!USERNAME_PATTERN.test(username))
    return 'Use só letras sem acento, números, _ e -';
  return null;
}

/**
 * Base das sugestões a partir do que a pessoa digitou: tira acentos, troca espaços por `_`,
 * descarta o que não é permitido e corta no tamanho máximo. Pode voltar vazia.
 */
export function usernameBase(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

/**
 * Candidatos a sugestão (ainda sem conferir no banco): a base limpa, se já for válida, e a base
 * com números no fim — sempre dentro do tamanho máximo. `random` é injetável pros testes.
 */
export function usernameCandidates(
  raw: string,
  random: () => number = Math.random,
): string[] {
  let base = usernameBase(raw);
  if (base.length < USERNAME_MIN_LENGTH)
    base = (base + 'aventureiro').slice(0, 11);
  const withSuffix = (suffix: string) =>
    base.slice(0, USERNAME_MAX_LENGTH - suffix.length) + suffix;

  const candidates = new Set<string>();
  if (!usernameFormatError(base)) candidates.add(base);
  for (let n = 1; n <= 3; n++) candidates.add(withSuffix(String(n)));
  for (let i = 0; i < 6; i++) {
    const digits = String(Math.floor(10 + random() * 990));
    candidates.add(withSuffix(digits));
    candidates.add(withSuffix(`_${digits}`));
  }
  return [...candidates].filter(c => !usernameFormatError(c));
}
