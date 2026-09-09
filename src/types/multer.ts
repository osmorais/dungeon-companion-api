/**
 * @types/multer falhou ao resolver de forma intermitente num build limpo (reproduziu no
 * Render, não localmente) mesmo declarado corretamente em package.json — em vez de depender
 * dessa resolução, declaramos o módulo aqui. Usamos muito pouco da API do multer (ver
 * MonsterCatalogController), então um `any` é seguro: o shape do arquivo recebido é tipado à
 * parte no próprio controller (interface MulterFile), sem depender desse módulo.
 *
 * Precisa ser um .ts normal, não .d.ts — o tsconfig.json exclui "**\/*.d.ts" do projeto
 * (pensado pra não reprocessar os .d.ts que o próprio tsc gera em dist/), o que também
 * bloquearia uma declaração ambiente escrita à mão se ficasse num .d.ts.
 */
declare module 'multer';
