/* eslint-disable @typescript-eslint/naming-convention */
import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {MonsterCatalogService} from '../../../services/monster-catalog.service';
import {SrdMonsterService} from '../../../services/srd-monster.service';
import {SupabaseStorageService} from '../../../services/supabase-storage.service';
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {MonsterCatalogRepository} from '../../../repositories/monster-catalog.repository';
import {MonsterCatalogEntry} from '../../../models/monster-catalog-types';

function entry(
  overrides: Partial<MonsterCatalogEntry> = {},
): MonsterCatalogEntry {
  return {
    id_monster_catalog: 'c1',
    user_id: 'dm',
    image_url: 'https://x/velha.png',
    ...overrides,
  } as MonsterCatalogEntry;
}

describe('MonsterCatalogService (imagens)', () => {
  let repository: StubbedInstanceWithSinonAccessor<MonsterCatalogRepository>;
  let storage: StubbedInstanceWithSinonAccessor<SupabaseStorageService>;
  let imageCleanup: StubbedInstanceWithSinonAccessor<ImageCleanupService>;
  let service: MonsterCatalogService;

  beforeEach(() => {
    repository = createStubInstance(MonsterCatalogRepository);
    storage = createStubInstance(SupabaseStorageService);
    imageCleanup = createStubInstance(ImageCleanupService);
    repository.stubs.findById.resolves(entry());
    service = new MonsterCatalogService(
      repository,
      createStubInstance(SrdMonsterService),
      storage,
      imageCleanup,
    );
  });

  afterEach(() => sinon.restore());

  it('trocar a imagem limpa a anterior depois de gravar a nova', async () => {
    storage.stubs.uploadImage.resolves('https://x/nova.png');
    repository.stubs.updateImage.resolves(
      entry({image_url: 'https://x/nova.png'}),
    );
    const updated = await service.setCatalogImage(
      'c1',
      'dm',
      Buffer.from('i'),
      'image/png',
    );
    expect(updated.image_url).to.equal('https://x/nova.png');
    sinon.assert.callOrder(
      repository.stubs.updateImage,
      imageCleanup.stubs.deleteIfUnreferenced,
    );
    sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
      'https://x/velha.png',
    ]);
  });

  it('outro mestre não troca a imagem nem sobe arquivo', async () => {
    await expect(
      service.setCatalogImage('c1', 'outro', Buffer.from('i'), 'image/png'),
    ).to.be.rejectedWith(/outro mestre/);
    expect(storage.stubs.uploadImage.called).to.be.false();
  });

  it('remover do catálogo tenta limpar a imagem (fica se uma sessão ainda usa)', async () => {
    await service.deleteCatalogEntry('c1', 'dm');
    sinon.assert.callOrder(
      repository.stubs.delete,
      imageCleanup.stubs.deleteIfUnreferenced,
    );
    sinon.assert.calledWith(imageCleanup.stubs.deleteIfUnreferenced, [
      'https://x/velha.png',
    ]);
  });

  it('outro mestre não remove', async () => {
    await expect(service.deleteCatalogEntry('c1', 'outro')).to.be.rejectedWith(
      /outro mestre/,
    );
    expect(repository.stubs.delete.called).to.be.false();
    expect(imageCleanup.stubs.deleteIfUnreferenced.called).to.be.false();
  });
});
