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

  /** Sobe um arquivo pro bucket configurado e devolve a URL pública dele. */
  async uploadImage(
    buffer: Buffer,
    contentType: string,
    originalName: string,
  ): Promise<string> {
    const fileName = `${randomUUID()}-${originalName}`;
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
}
