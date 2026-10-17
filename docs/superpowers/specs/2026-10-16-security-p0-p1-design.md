# Correções de segurança P0/P1 do Worder

## Autorização e escopo

Em 16/10/2026 o usuário autorizou implementar as correções do relatório, começando pelas P0/P1, com plano prévio e testes para preservar o comportamento existente. O relatório-base está em `test-results/security-audit-2026-10-16/worder-seguranca-lgpd-2026-10-16.html`; os IDs SEC-01 a SEC-18 identificam seus achados. Esta especificação transforma esse desenho já autorizado em entregas. Não exige nova aprovação para correções locais reversíveis.

Prioridades abrangidas: SEC-01/02/03/04/05/06/07/08/09/10/11/17/18. SEC-12 a SEC-16 são P2 e entram somente quando necessários ao fechamento de uma P0/P1; não devem desviar a primeira entrega.

## Desenho

1. **Conter exposição e atualizar a base:** nenhum segredo literal como fallback; aplicação falha sem configuração necessária; scanner redigido no CI. Migrar Next 14.0.4 para a linha suportada 15.5 com patch vigente verificado, ajustar suas APIs assíncronas e manter contratos HTTP/UI. Auditar transitivas; sem `audit fix --force`.
2. **Autoridade de acesso única:** autenticação validada, vínculo ativo, papel confiável e política MFA no servidor. Cookie auxiliar e `user_metadata` não decidem acesso. Dono/administrador e agente têm capacidades distintas; identidade do agente deriva do usuário autenticado. Offboarding impede novo acesso mesmo após novo login. Enrollment/recovery/logout continuam possíveis sem abrir APIs de negócio a AAL1 protegido.
3. **Senha e ações críticas:** troca exige senha atual ou prova recente independente; recuperação tem fluxo próprio de uso único. Não usar `admin.updateUserById` como atalho para uma sessão comum. Testar sucessos legítimos, revogação e efeitos colaterais ausentes na negação.
4. **HTML de email:** HTML arbitrário é dado não confiável. Não executá-lo no DOM do painel; isolar previews em iframe com sandbox sem scripts/same-origin. Preservar edição visual, texto rico, imagens e exportação de email; sanitização tem allowlist e testes de conteúdo legítimo.
5. **Credenciais e armazenamento:** reutilizar codec canônico autenticado, corrigir todos os caminhos de escrita/leitura de Shopify/Instagram/TikTok e preparar backfill idempotente em modo dry-run por padrão. Envelope/KMS para PII é entrega separada e explicitamente depende de provedor/identidade configurados. Nunca substituir chave existente ou recriptografar produção sem inventário e prova de restauração.
6. **LGPD e mídia:** erro de qualquer etapa impede `completed`; não escrever coluna gerada. Exclusão/exportação abrangem o grafo de cópias identificado, com escopo do titular/tenant e exceções de conservação documentadas. Não enviar export integral por email ou guardá-lo indefinidamente na resposta do pedido. Mídia privada, autorização por objeto/tenant e URLs temporárias; inspeção do catálogo real antes de afirmar exposição hospedada.
7. **Runtime:** logins DB mínimos reais e identidades/chaves por finalidade; `SET ROLE` não deve ser a única barreira. Mudanças de DSN/envelope são introduzidas com validação de configuração e ensaio local, sem derrubar operação que ainda usa a configuração antiga silenciosamente.

## Preservação e provas

- Trabalhar no checkout auditado `D:/worder1`, branch `codex/sync-debug-console-error-FWrLE`, preservando trabalho local de regressão. O `CLAUDE.md` aponta o worktree de referência `D:/worder1-fwrle`; sua branch e diferenças são conferidas somente leitura. Não modificar outros worktrees nem incorporar a reorganização documental deles nesta correção.
- Registrar hashes/snapshot local antes de editar. Não fazer reset, stash, clean, commit, push ou deploy automaticamente nesta etapa.
- Testes novos primeiro falham pelo comportamento vulnerável; depois passam com a correção. Mocks somente na fronteira externa, nunca substituir o guard que está sendo testado.
- Validar login, MFA/enrollment, permissões, troca/recuperação de senha, integrações, editor e LGPD também pelo caminho permitido.
- Usar PostgreSQL/Auth descartável e dados sintéticos para RLS/migrations, além das suítes existentes. Nunca usar DSN/usuários/tokens de produção nos testes.
- Gates finais: unitários do app, política CI, typecheck, build, runtime unit/import contracts, DB/RLS/pipeline e 50 casos UI simulados. Jornadas remotas somente em QA separado configurado; ausência de configuração não é aprovação.
- Rotação da chave histórica, KMS, configuração de Auth/WAF/Storage hospedado e gates nos dashboards têm evidências próprias. Código preparado não fecha esses itens operacionais.

## Aceite

Fechar uma tarefa requer diff revisado, teste negativo que falhou antes e passou depois, teste positivo preservado e gate vizinho verde. Fechar P0/P1 de produção requer também migrations/backfill/configuração efetivamente aplicados e verificados, sem publicar segredos ou dados pessoais como evidência. Riscos e itens dependentes de conta/provedor permanecem abertos no ledger.
