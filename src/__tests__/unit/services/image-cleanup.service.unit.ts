import {
  createStubInstance,
  expect,
  sinon,
  StubbedInstanceWithSinonAccessor,
} from '@loopback/testlab';
import {ImageCleanupService} from '../../../services/image-cleanup.service';
import {
  extensionForContentType,
  storagePathFromPublicUrl,
  SupabaseStorageService,
} from '../../../services/supabase-storage.service';
import {ImageReferenceRepository} from '../../../repositories/image-reference.repository';

const BASE = 'https://abc.supabase.co/storage/v1/object/public/monster-images/';

describe('ImageCleanupService', () => {
  let references: StubbedInstanceWithSinonAccessor<ImageReferenceRepository>;
  let storage: StubbedInstanceWithSinonAccessor<SupabaseStorageService>;
  let service: ImageCleanupService;

  beforeEach(() => {
    references = createStubInstance(ImageReferenceRepository);
    storage = createStubInstance(SupabaseStorageService);
    references.stubs.isImageReferenced.resolves(false);
    storage.stubs.deleteImage.resolves();
    service = new ImageCleanupService(references, storage);
  });

  afterEach(() => sinon.restore());

  it('apaga a imagem que ninguém mais usa', async () => {
    await service.deleteIfUnreferenced([`${BASE}a.png`]);
    sinon.assert.calledOnceWithExactly(
      storage.stubs.deleteImage,
      `${BASE}a.png`,
    );
  });

  it('mantém a imagem ainda usada por outro registro (ex.: catálogo × sessão)', async () => {
    references.stubs.isImageReferenced.resolves(true);
    await service.deleteIfUnreferenced([`${BASE}a.png`]);
    expect(storage.stubs.deleteImage.called).to.be.false();
  });

  it('ignora nulos/vazios e não repete URL duplicada', async () => {
    await service.deleteIfUnreferenced([
      null,
      undefined,
      '',
      `${BASE}a.png`,
      `${BASE}a.png`,
    ]);
    sinon.assert.calledOnce(references.stubs.isImageReferenced);
    sinon.assert.calledOnce(storage.stubs.deleteImage);
  });

  it('lista vazia não consulta nada', async () => {
    await service.deleteIfUnreferenced([]);
    expect(references.stubs.isImageReferenced.called).to.be.false();
  });

  it('nunca lança: falha numa imagem não impede as outras', async () => {
    const consoleError = sinon.stub(console, 'error');
    storage.stubs.deleteImage
      .withArgs(`${BASE}a.png`)
      .rejects(new Error('storage fora do ar'));
    await service.deleteIfUnreferenced([`${BASE}a.png`, `${BASE}b.png`]);
    sinon.assert.calledWith(storage.stubs.deleteImage, `${BASE}b.png`);
    sinon.assert.calledOnce(consoleError);
  });
});

describe('SupabaseStorageService helpers', () => {
  it('extrai o caminho do arquivo da URL pública do bucket', () => {
    expect(
      storagePathFromPublicUrl(`${BASE}abc.png`, 'monster-images'),
    ).to.equal('abc.png');
    expect(
      storagePathFromPublicUrl(`${BASE}pasta/x%20y.png?t=1`, 'monster-images'),
    ).to.equal('pasta/x y.png');
  });

  it('URL de outro bucket ou de fora do Supabase é ignorada', () => {
    expect(
      storagePathFromPublicUrl(`${BASE}abc.png`, 'outro-bucket'),
    ).to.be.null();
    expect(
      storagePathFromPublicUrl('assets/monster.png', 'monster-images'),
    ).to.be.null();
    expect(storagePathFromPublicUrl(BASE, 'monster-images')).to.be.null();
  });

  it('nome do arquivo usa extensão pelo tipo, não o nome original', () => {
    expect(extensionForContentType('image/png')).to.equal('png');
    expect(extensionForContentType('image/jpeg')).to.equal('jpg');
    expect(extensionForContentType('IMAGE/WEBP')).to.equal('webp');
    expect(extensionForContentType('image/x-desconhecido')).to.equal('img');
  });
});
