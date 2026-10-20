# Regra: registrar toda mudança de banco em `docs/database/`

Vale para toda implementação, correção ou ajuste que mude o banco (estrutura ou dados de
referência). `docs/database/database.sql` (estrutura) e `docs/database/database_inserts.sql`
(seed dos dados de referência) precisam sempre refletir o banco de produção — são a fonte pra
recriar o banco do zero.

## O que registrar e onde

1. **Estrutura → `database.sql`**: toda tabela, coluna, índice, constraint ou FK nova/alterada/
   removida.
   - Escrever de forma idempotente, no padrão que o arquivo já usa
     (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
   - Comentário curto acima dizendo pra que serve e onde é usado no código.
   - Coluna com valores fixos sem CHECK no banco (ex.: `session_roll_log.roll_type`): atualizar o
     comentário com a lista de valores quando entrar um novo.
2. **Dados de referência → `database_inserts.sql`**: toda mudança nos dados que o sistema traz de
   fábrica — `spell` (inclusive descrições corrigidas), `skill`, `weapon`, `armour`, `item`,
   `class`, `race`, `background`, `alignment`, `attribute_type`. Alterar a linha do INSERT
   existente (não acrescentar UPDATE no fim) pra o seed continuar gerando o estado atual.
3. **Dados de usuários** (fichas, sessões, rolagens, contas) **não** vão pro seed. Correção
   pontual em produção (ex.: perícias do antecedente das fichas antigas) fica registrada em
   `~/projects/docs/dungeon-companion/estado-atual.md`, seção "Mudanças feitas direto no banco
   de produção" (o que mudou, quantas linhas, quando, quem autorizou).

## Como aplicar em produção

- **Pedir autorização ao usuário** antes de qualquer DDL ou alteração de dados em produção.
- Mudança que o código novo precisa ler (coluna nova no SELECT) **roda antes do deploy da api**
  — senão a api nova quebra ao subir. Avisar o usuário da ordem.
- Rodar numa transação quando houver mais de um comando; conferir o resultado depois (ex.:
  `information_schema`, contagem de linhas).
- Script temporário fica no scratchpad da sessão e lê o `.env` (banco de produção); scripts
  reaproveitáveis ficam em `~/projects/docs/dungeon-companion/scripts/db/`.

## Conferência

- `node ~/projects/docs/dungeon-companion/scripts/db/schema-diff.js` (de dentro deste repo,
  depois de `npm run build`; só leitura): lista tabelas/colunas do banco de produção que não
  aparecem no `database.sql`. Deve sair vazio.
- Os dois arquivos usam quebra de linha **CRLF** — editar preservando (em Python,
  `open(..., newline='')`; não usar `sed -i` que insere linhas com LF).
- Tabela nova ligada a usuário: conferir também a regra de LGPD (`lgpd.md`) — cascata na
  exclusão da conta e exportação.

## No resumo final

Incluir uma linha **Banco**: "sem mudança" ou o que mudou (estrutura/dados), em qual arquivo foi
registrado e se a migração já rodou em produção.
