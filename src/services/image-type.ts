/**
 * Formatos de imagem aceitos no upload (personagem, monstro, imagem de referência). O tipo vale
 * pelo **conteúdo** do arquivo (os primeiros bytes), não pelo que o navegador declara: um SVG (que
 * pode carregar script) ou um HTML renomeado nunca chegam ao bucket público.
 */
export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

export const IMAGE_TYPE_ERROR =
  'Formato de imagem não aceito: use PNG, JPEG, WebP ou GIF.';

/** Filtro rápido do multer, antes de ler o arquivo (o navegador pode mentir; a palavra final é de `detectImageType`). */
export function isAcceptedImageMimetype(mimetype: string): boolean {
  const type = mimetype.toLowerCase();
  return (
    type === 'image/jpg' ||
    (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)
  );
}

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length &&
  bytes.every((byte, i) => buffer[offset + i] === byte);

/** Tipo real pela assinatura do arquivo, ou `null` se não for um dos formatos aceitos. */
export function detectImageType(buffer: Buffer): AcceptedImageType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWith(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  )
    return 'image/gif';
  // RIFF....WEBP
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  )
    return 'image/webp';
  return null;
}
