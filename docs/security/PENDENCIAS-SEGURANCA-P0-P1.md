# O que falta — Segurança P0/P1

## Atualização de 19/10/2026

Esta seção substitui os estados históricos de 17/10 abaixo. O candidato está no
PR [#10](https://github.com/matheusmarques6/worder1/pull/10), branch
`security/p0-p1-2026-10-17`. O usuário autorizou mover os gates pesados para o CI
remoto, devido à falta de memória local. Publicação na branch do PR é para teste;
promoção para produção depende dos resultados obrigatórios.

- Revisões de credenciais, identidade e código de mídia concluídas. Os achados
  CRED-1 a CRED-4, IR-01/02 e a referência cruzada mensagem/conversa foram corrigidos
  e aprovados em revisão posterior. Provas focais: 54 testes de credenciais,
  80 de identidade, 18 de handlers de mídia e 45 de mídia no runtime.
- Redis real: 2/2 passaram com SDK e Lua reais. O novo gate bloqueia o CI. A prova
  cobre o caminho Lua próprio; não certifica a variante proprietária legada Upstash.
- ChatPanel: troca de organização e resposta atrasada cobertas; 11/11 testes focais
  passaram. Lint estrito terminou sem warnings nem erros em 19/10.
- CI: pnpm fixado em 11.25.0, Node mínimo 22.13; política 44/44 passou. O scan
  remoto anterior reprovou uma fixture sintética; triagem limitada à regra,
  caminho e valor exatos, com testes de rejeição fora desse limite.
- Storage: perfil explícito com schema e API oficiais. A execução remota completa
  aprovou os 25 casos reais: 11 HTTP, 11 SQL/RLS e 3 de repositório. O lookup
  booleano `SECURITY DEFINER`, com `search_path` vazio, verifica sessão/vínculo/MFA
  e organização/conversa sem conceder SELECT da tabela privada ao usuário.

O commit de código `41e97cf1b7dc83262ff13c010e761807507f1ad2` foi validado no
[run 39308208509](https://github.com/matheusmarques6/worder1/actions/runs/39308208509):

| Gate | Resultado observado |
|---|---|
| App / política CI | 3.512 passed, 1 skip manual / 44 passed |
| Tipos / build | Sucesso / 153 páginas, lint e tipos habilitados |
| Interface | 50 passed nos seis grupos, sem skips ou retries |
| Runtime / fronteiras | 2.326 unitários / Ruff limpo e 4 contratos preservados |
| Banco / RLS / pipeline | 1.038 / 167 / 45 passed; zero falhas, erros ou skips |
| Redis real | 2 passed, SDK e Lua reais |
| Segurança | 9 passed; scanner do intervalo sem achados; audit 0 critical/high, 3 moderate |
| Jornadas / Release readiness | Falha por configuração de QA ausente / `Release blocked: journeys` |

Os 167 casos RLS coletados foram executados. O gate `db` seleciona `db and not rls`;
as contagens acima identificam as três seleções executadas. O skip do app é o gerador manual
`GEN_BUBBLE_VECTORS`, sem dispensar jornadas. O executor encerrou com
`scope=full`, `state=stopped` e `failure=null`; cleanup também passou.

- As falhas reais encontradas no CI foram corrigidas e revisadas antes dessa
  execução: lookup de mídia, expectativas exatas das políticas restritivas,
  contrato OAuth exclusivo de serviço e contexto transacional de DELETE Storage.
- Homologação não provisionada: o job de jornadas reprovou por configuração
  ausente. Não ignorar esse gate. KMS, rotação externa e aplicação de dados
  continuam pendentes; não afirmar conformidade LGPD integral.
- A validação das proteções de publicação segue pendente após a primeira
  homologação verde, conforme o runbook de QA. Diagnóstico operacional detalhado
  mantido na evidência local; o agregador reprovado não é prova de ativação.

A branch de produção foi conferida em `53e1d7d50060b896a7bedb50c0a4a6250f04b789`;
não houve promoção nesta execução. Commits posteriores somente de documentação
têm suas próprias execuções de CI; a evidência acima identifica o SHA testado.

Os metadados hospedados precisam ser conferidos novamente antes do rollout.
Identidade/runtime vêm antes ou junto do código; privatização de mídia vem depois
dos leitores compatíveis. **Não aplicar as três migrations antes do código.**

## Registro histórico de 17/10/2026

Mapa de pendências do plano `docs/superpowers/plans/2026-10-16-security-p0-p1.md`.
Estado em 17/10/2026, checkout `D:/worder1`, branch `security/p0-p1-2026-10-17`,
base `5642010`. Evidências e decisões em
`.superpowers/sdd/2026-10-16-security-p0-p1/progress.md`; estados por SEC-ID em
`docs/security/sec-id-status.md`.

O trabalho está em 5 commits na branch `security/p0-p1-2026-10-17` e no PR
[#10](https://github.com/matheusmarques6/worder1/pull/10), aberto contra
`claude/debug-console-error-FWrLE`. 401 arquivos. **O PR não pode ser mergeado antes
das migrations** — ver seção 1. A branch de deploy não recebeu nada: produção segue
como estava.

---

## 1. Bloqueio de deploy — ler antes de subir para produção

**Subir este código para `claude/debug-console-error-FWrLE` sem aplicar as
migrations derruba o login de todos os usuários.**

A rota de login chama uma função que só existe depois da migration:

```ts
// src/app/api/auth/route.ts:225
const { data: factors, error: factorsError } = await supabase.rpc('list_mfa_factors', { p_user_id: data.user.id })
if (factorsError || !Array.isArray(factors)) return NextResponse.json({ error: 'Não foi possível verificar MFA.' }, { status: 503 })
```

`internal.list_mfa_factors` é criada por `20261017050140_active_identity_security.sql`,
que **não foi aplicada**. Sem ela, `factorsError` vem preenchido e **todo login
responde 503**. O mesmo vale para `resolveActiveIdentity` logo acima, que depende de
`internal.has_active_org_access` da mesma migration (responde 403).

O fail-closed está correto como desenho de segurança — o que não pode acontecer é
o código chegar à produção antes do esquema.

**As três migrations não têm a mesma ordem.** Duas vêm antes do código e uma vem
depois — o próprio cabeçalho de cada arquivo diz qual:

| Migration | Ordem | Por quê |
|---|---|---|
| `20261017050140_active_identity_security.sql` | **antes/junto** do código | "Deploy together with the server identity guard". Cria `internal`, `has_active_org_access`, `list_mfa_factors` e uma política **restritiva** em toda tabela de `public` com `organization_id`. Sem ela: **login 503 / acesso 403 para todos** |
| `20261017051724_runtime_minimum_login.sql` | **antes**, indiferente | Só cria as roles LOGIN `runtime_worker_login` e `runtime_sender_login` (deliberadamente **sem senha**, a provisionar em separado) e os grants. Não afeta o app |
| `20261017161216_private_whatsapp_media.sql` | **depois** do código | "Deploy the owned-key readers before this migration". Torna o bucket `whatsapp-media` **privado** e cerca `storage.objects` com políticas restritivas. Aplicar antes do código **quebra a mídia da inbox**, porque as URLs públicas antigas passam a precisar de assinatura pelo app |

**Sequência correta:**

1. Aplicar `20261017050140` e `20261017051724`
2. Mergear o PR (código novo em produção)
3. Aplicar `20261017161216`

O rollback da de mídia não é reabrir o bucket: o próprio arquivo diz que "re-enabling
public access is not a safe security rollback" — o rollback é voltar os leitores para
uma release que assina chaves próprias.

### Medição em produção antes de aplicar (17/10)

Projeto **Worder CRM** `rqpmoavktzvxfcfsdkcc` (sa-east-1). Última migration aplicada:
`20261016000015`; as três acima não estão aplicadas. O risco da política restritiva de
identidade é baixo neste banco: **1 usuário, 0 fatores MFA verificados, 0 organizações
exigindo 2FA, 1 vínculo ativo e nenhum profile sem vínculo** — as cláusulas de MFA e de
`require_2fa` passam por vacuidade e o backfill não tem o que fazer. Risco residual: o
predicado exige que o JWT traga `session_id`, e os `revoke insert/update/delete` de
`authenticated` quebram qualquer escrita que o código **atual** faça direto pelo cliente
em vez de por handler de servidor. Rollback: `drop policy active_identity_required` nas
tabelas e re-grant.

Há um segundo detalhe no mesmo assunto: a edição de
`20261016000005_runtime_tool_grants.sql` adicionou um bloco idempotente que cria
`contact_activities` e `whatsapp_product_interests` com RLS. **Migration já aplicada
não roda de novo**, então em ambiente já migrado esse bloco não surte efeito. Se
essas tabelas existirem em produção criadas fora do stream canônico, continuam sem
RLS. Confirmar exige inspecionar o banco hospedado — ver pendência 4.1. Se confirmado,
a correção é uma migration nova, não essa edição.

---

## 2. O que falta por SEC-ID

| SEC-ID | Estado | O que falta, concretamente | Quem resolve |
|---|---|---|---|
| SEC-01 segredos | corrigido local | Revogar externamente a chave Evolution exposta no histórico git; primeira execução remota do job de segurança do CI | Você (console do provedor) + CI |
| SEC-02 dependências | corrigido local | Nada local. 3 `moderate` seguem registrados no audit | — |
| SEC-03/04/06 senha, MFA, vínculo | corrigido local | **Aplicar `20261017050140`** (ver seção 1); revisão de Auth já existe em disco | Você (banco) |
| SEC-05 permissões de agente | corrigido local, **com restrição** | O acesso restrito a números específicos **nega** em vez de conferir. Fechar exige migration de vínculo conversa↔número + prova em banco | Decisão de produto + migration |
| SEC-07 editor/preview | corrigido local | Nada. 13/13 focais + 471 vizinhos, revisão independente sem Critical/Important | — |
| SEC-08 credenciais cifradas | implementado | **Revisão independente de criptografia** (34 arquivos TS + 14 Python) — não feita | Revisor |
| SEC-09 envelope de chaves | **bloqueado** | Qual provedor de KMS já existe. Pergunta sem resposta; ausência de resposta não autoriza criar conta nem provisionar chave | Você |
| SEC-10 LGPD exclusão/exportação | corrigido local | Nada. GREEN 45 + 198 vizinhos | — |
| SEC-11 LGPD grafo verificável | **parcial** | A fronteira conservadora marca `needs_review` para o grafo não provado. Não tratar como fechado | Desenho + prova |
| SEC-17 mídia privada | implementado | **Revisão independente**, Storage por HTTP real, SQL real e **prova em banco da `20261017161216`** — o run observado não a cobriu | Revisor + banco |
| SEC-18 runtime mínimo | **parcial** | Subset provado: 119 unitários + 13 casos de banco preparados. Resto do escopo não executado | Execução |

---

## 3. O que falta por gate (Tarefa 11)

Verdes, executados de verdade nesta retomada:

| Gate | Resultado |
|---|---|
| Unitários do app | 3472 passed, 3 skipped, **0 failed** (3475 casos, 322 arquivos) |
| `test:ci-policy` | 44/44, 0 skips |
| `typecheck` | 0 erros TS |
| `build` | exit 0, 153 páginas estáticas |
| `test:ai:ui` | 50 passed — os 50 casos que o plano manda preservar |
| Runtime: unitários | 2273 passed |
| Runtime: Ruff | 0 erros (eram 55) |
| Runtime: import-linter | 4 contratos KEPT |
| Banco observado | 23 casos, 0 falhas/erros/skips |

Falta:

- [ ] **Revisão independente de criptografia (SEC-08) e de mídia (SEC-17).** Auth, LGPD
      e HTML têm relatório em disco; esses dois não.
- [ ] **Prova em banco da migration de mídia** `20261017161216` — fora do run observado.
- [ ] **Execução remota do job de segurança do CI.** Nunca rodou. Sem base no primeiro
      push, varre o histórico completo e **pode reprovar** por causa da exposição
      histórica, até triagem.
- [ ] **Jornadas reais e bloqueio remoto** — dependem de QA provisionado. O plano exige
      demonstrar uma falha controlada bloqueando promoção antes de declarar o gate ativo;
      check ausente, skipped, cancelado ou com zero casos conta como reprovação.
- [ ] `pnpm lint` (`next lint --max-warnings=0`) segue vermelho por **1 warning
      pré-existente**: `exhaustive-deps` em `src/components/whatsapp/inbox/ChatPanel.tsx:452`
      (falta `organizationId`). Arquivo idêntico ao do HEAD. Não está entre os gates que a
      Tarefa 11 lista, e mexer nas deps de um `useEffect` muda quando ele reexecuta —
      decisão explícita, não correção silenciosa.

---

## 4. Pendências externas que nenhum código fecha

1. **Provedor de KMS** — bloqueia SEC-09.
2. **Autorização específica para inspecionar metadados de produção.** A consulta foi
   recusada pela revisão automática e **não foi contornada**. SQL revisável em
   `docs/security/production-metadata-inspection.sql`. É o que destrava confirmar o
   item de RLS da seção 1.
3. **Revogação da chave Evolution** exposta no histórico git. A árvore atual já não tem
   o fallback literal, mas a exposição é histórica e só a revogação a encerra.
4. **QA provisionado** — jornadas reais e a demonstração de falha controlada.

---

## 5. Dívida descoberta durante os gates, fora do escopo deste plano

**O controle de acesso por número de WhatsApp está inoperante em todo o app, desde
antes deste plano.** `conversations/route.ts` filtra por `.in('whatsapp_number_id', …)`
e `permissions/route.ts` grava `whatsapp_number_ids` / `can_transfer_chats` — todas
colunas ausentes do esquema. O PostgREST recusa a linha inteira em silêncio, então
esses filtros nunca funcionaram. O esquema real tem
`agent_permissions.whatsapp_allowed_numbers` e a tabela `whatsapp_number_agents`, mas
nenhuma coluna de `whatsapp_conversations` diz de qual número da empresa a conversa é.
Fechar exige desenho de migration e prova em banco real.

Foi assim que a regressão do SEC-05 apareceu: o guard novo copiou o vocabulário
fantasma para uma cadeia `.from().select()` direta, onde o teste de schema-drift
consegue resolver a tabela e reprovou.

---

## 6. Ordem recomendada para fechar

1. Conferir os gates e metadados; aplicar identidade/runtime antes ou junto do
   código e a privatização de mídia somente depois dos leitores compatíveis,
   conforme a sequência detalhada da seção 1.
2. Responder as duas perguntas abertas: provedor de KMS e autorização de metadados de
   produção.
3. Revisão independente de criptografia (SEC-08) e de mídia (SEC-17).
4. Revogar a chave Evolution; depois rodar o job de segurança do CI e triar o que a
   varredura histórica acusar.
5. Provisionar QA; rodar jornadas reais e demonstrar a falha controlada bloqueando
   promoção.
6. Decidir SEC-05 (migration de vínculo conversa↔número) e SEC-11 (grafo), que são
   desenho, não execução.

---

## 7. Onde está a evidência

| Arquivo | Conteúdo |
|---|---|
| `.superpowers/sdd/2026-10-16-security-p0-p1/progress.md` | Ledger: números, rulings e o que foi descartado |
| `docs/security/sec-id-status.md` | Estados por SEC-ID e tabela de gates |
| `…/final-app-run3.log` | Suite do app, 3472 passed |
| `…/final-typecheck-run6.log` | Typecheck, 0 erros |
| `…/final-build4.log` | Build verde, 153 páginas |
| `…/final-ai-ui2.log` | UI, 50 passed |
| `…/final-ci-policy.log` | ci-policy, 44/44 |
| `…/runtime-unit.log`, `runtime-ruff.log`, `runtime-imports.log` | Gates do runtime |
| `…/identity-report.md`, `lgpd-fix-review.md` | Revisões independentes já feitas |
| `docs/security/production-metadata-inspection.sql` | SQL de inspeção, pendente de autorização |

Os artefatos foram varridos por padrões de segredo (JWT, `sk-`, `ghp_`, `AIza`,
`service_role`) e por pares chave=valor com valor longo: nenhum segredo real. Os únicos
casamentos são valores sintéticos de teste. São publicáveis.
