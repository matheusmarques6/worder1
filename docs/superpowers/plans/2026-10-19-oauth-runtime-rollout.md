# OAuth e preparação do runtime — plano de execução

**Objetivo:** restaurar o contrato OAuth exclusivo do serviço e entregar as
instruções de implantação do runtime sem guardar credenciais.

**Arquitetura:** migration futura somente de ACL/RLS, sem alterações de linhas,
colunas ou constraints. Reutilizar Blueprint, roles e contratos HTTP existentes.
Executar os testes pesados no CI; preservar arquivos locais do usuário.

1. [x] Inventariar permissões hospedadas e reproduzir a falha do guarda OAuth
   com uma consulta de catálogo que não lê dados pessoais.
2. [x] Adicionar regressões de upgrade, preservação, idempotência e recusa de
   grants desconhecidos em `runtime/tests/db/test_oauth_states_forward.py`.
3. [x] Preencher a migration gerada pela CLI, executar Ruff/coleta e enviar
   para os gates remotos na branch `codex/oauth-runtime-rollout`.
4. [ ] Conferir resultados e aplicar a correção hospedada, sem reexecutar a
   migration histórica. Provar negação ao navegador e CRUD do serviço usando
   exclusivamente nonces sintéticos; preservar os estados anteriores.
5. [x] Entregar `docs/runbooks/2026-10-19-runtime-render-vercel.md`, com campos
   dos painéis, segredos, pooler, revisão implantada e critérios de aceite.
6. [x] Registrar evidências, abrir PR contra a branch solicitada e indicar
   precisamente o que permanece dependente do acesso do usuário aos provedores.

Rollback mantém o OAuth fechado ao navegador. Recuperar somente o handler de
servidor compatível; não restaurar grants amplos ou publicar tokens. O runtime
continua sem comprovação de funcionamento até configuração e health reais.
