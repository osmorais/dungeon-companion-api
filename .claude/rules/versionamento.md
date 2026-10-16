# Regra: versão do sistema e notas de versão a cada implementação

Vale para toda implementação, correção de bug ou mudança de comportamento neste repositório.
O sistema (api + web) tem **uma versão só**, no formato `A.B.C`. A regra completa, o arquivo
das notas de versão e a página pública `/novidades` ficam no **web**:
`dungeon-companion-web/.claude/rules/versionamento.md` — seguir aquela regra.

Resumo:
- **A**: mudança grande, **só quando o usuário decidir** (B e C voltam a 0);
- **B**: cada funcionalidade nova (C volta a 0);
- **C**: cada correção de bug ou funcionalidade pequena.
- Uma entrega = uma versão, subindo pela maior mudança; mudança só interna (refatoração, testes,
  docs) não gera versão.

Quando a mudança for só aqui na api, ela ainda gera versão: registrar a entrada em
`dungeon-companion-web/src/app/release-notes/release-notes.ts` e subir o `version` do
`package.json` (e do topo do `package-lock.json`) **nos dois repositórios** pro mesmo número.
Texto das notas para o jogador, sem termos técnicos, sem detalhe de falha de segurança e sem
dados de usuários.

## No resumo final

Incluir uma linha **Versão**: o número novo e o tipo, ou "sem versão" com o motivo.
