import {expect, sinon} from '@loopback/testlab';
import {
  detectImageType,
  isAcceptedImageMimetype,
} from '../../../services/image-type';
import {SupabaseStorageService} from '../../../services/supabase-storage.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = Buffer.from('GIF89a....');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

describe('Tipo de imagem no upload (1.17.6)', () => {
  it('reconhece PNG, JPEG, GIF e WebP pelos primeiros bytes', () => {
    expect(detectImageType(PNG)).to.equal('image/png');
    expect(detectImageType(JPEG)).to.equal('image/jpeg');
    expect(detectImageType(GIF)).to.equal('image/gif');
    expect(detectImageType(Buffer.from('GIF87a....'))).to.equal('image/gif');
    expect(detectImageType(WEBP)).to.equal('image/webp');
  });

  it('recusa SVG, HTML, arquivo vazio e RIFF que não é WebP', () => {
    expect(detectImageType(SVG)).to.be.null();
    expect(
      detectImageType(Buffer.from('<html><script></script>')),
    ).to.be.null();
    expect(detectImageType(Buffer.alloc(0))).to.be.null();
    expect(detectImageType(Buffer.from([0x89, 0x50]))).to.be.null();
    expect(
      detectImageType(
        Buffer.concat([Buffer.from('RIFF0000'), Buffer.from('WAVE')]),
      ),
    ).to.be.null();
  });

  it('filtro do multer: só os quatro formatos (jpg como apelido de jpeg)', () => {
    for (const type of [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'IMAGE/WEBP',
      'image/gif',
    ])
      expect(isAcceptedImageMimetype(type)).to.be.true();
    for (const type of [
      'image/svg+xml',
      'image/heic',
      'image/bmp',
      'text/html',
    ])
      expect(isAcceptedImageMimetype(type)).to.be.false();
  });

  describe('SupabaseStorageService.uploadImage', () => {
    let upload: sinon.SinonStub;
    let service: SupabaseStorageService;

    beforeEach(() => {
      upload = sinon.stub().resolves({error: null});
      service = new SupabaseStorageService();
      // Client falso: o teste não fala com o Supabase.
      (service as unknown as {client: unknown}).client = {
        storage: {
          from: () => ({
            upload,
            getPublicUrl: (name: string) => ({
              data: {publicUrl: `https://cdn/${name}`},
            }),
          }),
        },
      };
    });

    it('grava com o tipo e a extensão do conteúdo, não do que o navegador declarou', async () => {
      const url = await service.uploadImage(PNG, 'image/svg+xml');
      expect(url).to.match(/\.png$/);
      expect(upload.firstCall.args[2]).to.eql({contentType: 'image/png'});
    });

    it('SVG declarado como PNG: 422 sem subir nada', async () => {
      const err = await service.uploadImage(SVG, 'image/png').then(
        () => null,
        (e: {statusCode?: number; message: string}) => e,
      );
      expect(err?.statusCode).to.equal(422);
      expect(err?.message).to.match(/PNG, JPEG, WebP ou GIF/);
      expect(upload.called).to.be.false();
    });
  });
});
