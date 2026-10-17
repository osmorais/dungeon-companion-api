import {inject, injectable, BindingScope} from '@loopback/core';
import {PostgresDatasource} from '../datasources';

/**
 * A mesma URL de imagem pode estar em mais de um registro: o monstro adicionado à sessão herda a
 * imagem do catálogo, e duplicar um monstro copia a URL. Antes de apagar um arquivo do storage é
 * preciso confirmar que ninguém mais aponta pra ele.
 */
@injectable({scope: BindingScope.TRANSIENT})
export class ImageReferenceRepository {
  constructor(
    @inject('db.Postgres')
    private db: PostgresDatasource,
  ) {}

  async isImageReferenced(imageUrl: string): Promise<boolean> {
    const rows = await this.db.sql<{found: boolean}[]>`
      SELECT EXISTS (
        SELECT 1 FROM character WHERE image_url = ${imageUrl}
        UNION ALL
        SELECT 1 FROM monster_catalog WHERE image_url = ${imageUrl}
        UNION ALL
        SELECT 1 FROM monster_session WHERE image_url = ${imageUrl}
        UNION ALL
        SELECT 1 FROM session_reference_image WHERE image_url = ${imageUrl}
      ) AS found
    `;
    return rows[0].found;
  }
}
