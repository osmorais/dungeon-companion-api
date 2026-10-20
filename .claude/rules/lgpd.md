# Regra: verificação de LGPD a cada nova implementação

Vale para toda implementação nova, correção de bug ou mudança de comportamento neste repositório.
O sistema é público e trata dados pessoais. A política de privacidade e os termos de uso
prometem coisas que o código precisa cumprir. Histórico e status completos:
`~/projects/docs/dungeon-companion/conceitos/lgpd.md`. Plano de incidente:
`~/projects/docs/dungeon-companion/procedimentos/incidente.md`.

## Ao planejar e ao terminar a implementação (junto com a regra de testes)

Percorrer o checklist abaixo. Para cada ponto que se aplicar, tratar no próprio código **ou**
avisar o usuário antes de concluir.

1. **Dado pessoal novo?** Coluna, campo de formulário, upload, log ou envio a terceiro que guarde
   ou exponha algo que identifique uma pessoa: e-mail, nome real, foto, IP, texto livre que
   pode conter nome.
   - Coletar só o necessário para a finalidade (minimização). Campo opcional sempre que der.
   - Nada de dado sensível (saúde, religião, origem racial, biometria etc.).
   - Precisa entrar na tabela "Ponto de partida" do doc de LGPD e na seção 2 da Política.
2. **Quem consegue ver ou alterar?** Todo endpoint novo usa `@authenticate('jwt')` (só rotas de
   auth usam `skip`) e checa o dono no service/repository: dono × mestre da sessão × outro
   usuário. Testar as três permissões.
   - Nunca listar ou devolver dados de outros usuários. A listagem global de sessões foi removida
     por isso.
   - Dado de monstro para jogador só via `RevealedMonster`. Evento com dado restrito vai para
     `DM_ONLY_EVENT_TYPES`.
   - Upload antes da checagem de permissão precisa descartar o arquivo se a operação for recusada.
3. **Exclusão da conta continua completa?** Toda tabela nova ligada ao usuário (direta ou
   indiretamente) precisa ser apagada quando a conta é excluída.
   - FK com `ON DELETE CASCADE` a partir de `users`, `character`, `game_session` ou
     `player_session`. Conferir no banco real via `information_schema`.
   - FK `SET NULL` que deixe nome ou texto do usuário para trás precisa de DELETE explícito em
     `AccountRepository.deleteAccount`, como já é feito com `session_roll_log`.
4. **Exportação (portabilidade) continua completa?** Dado novo fornecido ou gerado pelo usuário
   entra em `AccountRepository` / `AccountService.exportData`. Nunca exportar dados de outros
   usuários nem hash de senha.
5. **Arquivo ou imagem nova?** Coluna nova de URL de storage precisa:
   - entrar na união de `ImageReferenceRepository.isImageReferenced`;
   - chamar `ImageCleanupService.deleteIfUnreferenced` depois de trocar ou excluir;
   - ser coletada em `AccountRepository.deleteAccount`.
   Nome de arquivo nunca usa o nome original.
6. **Terceiro novo?** Serviço externo, API, SDK, provedor de e-mail/IA/analytics, ou dado
   enviado a um terceiro já existente para outra finalidade:
   - atualizar as seções 4 (operadores) e 5 (transferência internacional) da Política;
   - atualizar a lista de credenciais do plano de incidente.
   A IA (Anthropic/OpenAI) hoje está desativada. Reativar é terceiro novo.
7. **Segurança (art. 46).**
   - Rota sensível nova (auth, envio de e-mail, confirmação com senha, ação em massa) entra em
     `RATE_LIMITS` (`rate-limit.service.ts`).
   - Segredo novo nunca tem fallback em produção (padrão `getJwtSecret`).
   - Não logar dado pessoal (corpo de requisição, e-mail, token).
   - Erro de validação ou confirmação usa 422, não 401: 401 fora de `/auth/` desloga no frontend.
   - Token ou segredo guardado no banco só como hash.
8. **Retenção.** Dado novo com prazo de validade (token, código, log) precisa de limpeza, como
   `clearExpiredResetTokens`. A decisão vigente é manter os dados até o usuário excluir a conta.
9. **Política de Privacidade / Termos de Uso precisam mudar?** O texto fica no **frontend**
   (`dungeon-companion-web/src/app/legal/legal-page.component.html`, dados em `legal-info.ts`).
   - Mudança na API que altere o que é coletado, para quê, com quem é compartilhado, por quanto
     tempo, ou o que o usuário pode fazer **exige** atualizar o texto lá e o
     `LEGAL_LAST_UPDATED`.
   - Avisar o usuário. Mudança relevante na política deve ser comunicada aos usuários (o texto
     promete isso) e o usuário decide como.
   - Lembrar que o texto final passa por revisão jurídica.

## Ao achar uma falha existente

Se a análise revelar exposição de dados que já está em produção, como permissão faltando ou
dado de um usuário visível para outro:
- **não** corrigir em silêncio: avisar o usuário com a gravidade;
- propor a correção;
- seguir `dungeon-companion/procedimentos/incidente.md` (avaliar risco e registrar na tabela de incidentes).

## No resumo final

Incluir uma linha **LGPD**:
- "sem impacto" (dizendo por quê, em meia frase); ou
- os pontos do checklist que se aplicaram e o que foi feito, e se a Política ou os Termos
  precisam ser (ou foram) atualizados.

Atualizar `~/projects/docs/dungeon-companion/conceitos/lgpd.md` quando houver mudança relevante (dado novo,
terceiro novo, item novo de risco).
