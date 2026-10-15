import {injectable, BindingScope} from '@loopback/core';
import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'crypto';

const DEFAULT_BUCKET = 'monster-images';

/**
 * Upload de imagens pro Supabase Storage — só pro backend, sempre com a service role key (que
 * ignora RLS). O frontend nunca fala com o Supabase diretamente, só com esse endpoint.
 *
 * Client criado de forma preguiçosa (só no primeiro uso) em vez de no construtor: assim, se as
 * env vars do Supabase não estiverem configuradas (ex: ambiente de dev sem upload de imagem
 * configurado ainda), o resto da aplicação continua funcionando normalmente — só quebra na hora
 * de efetivamente tentar subir uma imagem.
 */
@injectable({scope: BindingScope.SINGLETON})
export class SupabaseStorageService {
  private client: SupabaseClient | null = null;

  private getClient(): SupabaseClient {
    if (!this.client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error(
          'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados pra subir imagens',
        );
      }
      this.client = createClient(url, key);
    }
    return this.client;
  }

  private get bucket(): string {
    return process.env.SUPABASE_STORAGE_BUCKET ?? DEFAULT_BUCKET;
  }

  /**
   * Sobe um arquivo pro bucket configurado e devolve a URL pública dele. O nome no bucket é só um
   * UUID + extensão — o nome original do arquivo pode carregar dado pessoal (ex.: "foto-joao.png")
   * e ficaria exposto na URL pública.
   */
  async uploadImage(buffer: Buffer, contentType: string): Promise<string> {
    const fileName = `${randomUUID()}.${extensionForContentType(contentType)}`;
    const client = this.getClient();

    const {error} = await client.storage
      .from(this.bucket)
      .upload(fileName, buffer, {contentType});
    if (error) {
      throw new Error(`Falha ao enviar imagem pro storage: ${error.message}`);
    }

    const {data} = client.storage.from(this.bucket).getPublicUrl(fileName);
    return data.publicUrl;
  }

  /**
   * Apaga do bucket o arquivo de uma URL pública gerada por `uploadImage`. URL de fora do bucket
   * (ex.: asset padrão do frontend) é ignorada. Quem chama deve garantir antes que a URL não é
   * mais usada por nenhum registro — ver ImageCleanupService.
   */
  async deleteImage(publicUrl: string): Promise<void> {
    const path = storagePathFromPublicUrl(publicUrl, this.bucket);
    if (!path) return;
    const {error} = await this.getClient()
      .storage.from(this.bucket)
      .remove([path]);
    if (error) {
      throw new Error(`Falha ao remover imagem do storage: ${error.message}`);
    }
  }
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

export function extensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType.toLowerCase()] ?? 'img';
}

/**
 * Caminho do arquivo dentro do bucket a partir da URL pública do Supabase
 * (`.../storage/v1/object/public/{bucket}/{caminho}`), ou `null` se a URL não for desse bucket.
 */
export function storagePathFromPublicUrl(
  publicUrl: string,
  bucket: string,
): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;
  const path = publicUrl.slice(index + marker.length).split(/[?#]/)[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
