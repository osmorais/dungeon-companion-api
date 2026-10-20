# Regra: testes a cada nova implementação

Vale para toda implementação nova, correção de bug ou mudança de comportamento neste repositório.

## Ao terminar a implementação (antes de dizer que está pronto ou de commitar)

1. **Rodar a suíte existente** e confirmar que tudo que já passava continua passando:
   ```bash
   npm run test:unit
   npm run build
   ```
   - `npm run test:unit` é a suíte unitária (sem banco). **Não** usar `npm test` pra isso — ele
     sobe a aplicação, precisa de banco e roda o lint do projeto inteiro (que tem débito antigo).
   - Se algum teste antigo quebrar: descobrir se a mudança introduziu uma regressão (corrigir o
     código) ou se o comportamento mudou de propósito (atualizar o teste e **avisar o usuário**
     qual comportamento mudou). Nunca apagar, enfraquecer ou dar `skip` num teste só pra suíte
     passar sem explicar o motivo ao usuário.
2. **Criar testes novos para a funcionalidade implementada** — cobrindo o caminho feliz, as
   validações/travas (erros esperados) e as permissões (dono × mestre × outro usuário), no
   padrão já existente em `src/__tests__/unit/`:
   - Regra pura do motor de D&D → `character-sheet/calculator.unit.ts`.
   - Dado novo em `rules.ts` / `feats.ts` (classe, subclasse, recurso, talento, tabela) →
     `character-sheet/rules.unit.ts` (inclusive as checagens de integridade).
   - Fluxo de service que usa repositório → `services/<service>.unit.ts`, com os repositórios
     substituídos por `createStubInstance` (nunca conectar no Postgres).
   - Fábricas de dados reutilizáveis → `src/__tests__/unit/fixtures.ts`.
   - Service novo sem arquivo de teste ainda → criar `services/<nome>.service.unit.ts`.
3. Rodar `npm run test:unit` de novo com os testes novos, e `npx eslint src/__tests__` +
   `npx prettier --check` nos arquivos de teste criados/alterados.
4. **Relatar no resumo final**: quantos testes passam, quais testes novos foram criados e se
   algum teste antigo precisou mudar (e por quê).

## Observações

- Se escrever um teste revelar um bug **fora do escopo** da tarefa, não corrigir sem pedir:
  deixar o teste com `it.skip(...)` e um comentário explicando o bug, e avisar o usuário.
- Tabelas duplicadas no frontend (`dungeon-companion-web/src/app/constants/`: espaços de magia,
  armaduras, grupos de conjurador, subclasses do nível 1) têm testes nos dois repositórios com os
  mesmos valores — ao mudar um lado, atualizar o outro e os testes de ambos.
- Documentação completa da suíte: `~/projects/docs/dungeon-companion/conceitos/testes.md` (atualizar a
  seção de cobertura quando adicionar uma área nova de testes).
