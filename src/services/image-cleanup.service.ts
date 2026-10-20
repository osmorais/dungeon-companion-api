import {injectable, BindingScope, service} from '@loopback/core';
import {ImageReferenceRepository} from '../repositories/image-reference.repository';
import {SupabaseStorageService} from './supabase-storage.service';

/**
 * Apaga do Supabase Storage as imagens que deixaram de ser usadas (imagem trocada, personagem /
 * monstro / sessão / conta excluídos). Sem isso o arquivo continuaria acessível pela URL pública
 * pra sempre (LGPD — ver docs/dungeon-companion/conceitos/lgpd.md, item 6).
 *
 * Deve ser chamado **depois** que o registro já foi alterado/apagado no banco: só remove a URL
 * se nenhum outro registro ainda apontar pra ela. Nunca lança — falha na limpeza não pode
 * desfazer nem quebrar a operação principal, só fica registrada no log.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class ImageCleanupService {
  constructor(
    @service(ImageReferenceRepository)
    private imageReferences: ImageReferenceRepository,
    @service(SupabaseStorageService)
    private storage: SupabaseStorageService,
  ) {}

  async deleteIfUnreferenced(
    imageUrls: (string | null | undefined)[],
  ): Promise<void> {
    const unique = [...new Set(imageUrls.filter((u): u is string => !!u))];
    for (const url of unique) {
      try {
        if (await this.imageReferences.isImageReferenced(url)) continue;
        await this.storage.deleteImage(url);
      } catch (err) {
        console.error(
          'Falha ao limpar imagem órfã do storage:',
          url,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}
