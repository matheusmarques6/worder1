# Auditoria IA — desenho de trace aceito e anotação

**Data:** 2026-09-15

**Branch:** `fix/ai-engine-schema-baseline`

**Estado:** desenho aprovado em conversa; implementação ainda não iniciada

## Objetivo

Persistir um único trace de produto para cada turno realmente aceito pelo CAS, preservando a identidade da conta WhatsApp, a tentativa selecionada e a capacidade de anotação humana usada por avaliações e propostas. O desenho não altera o metering operacional de todas as tentativas e não transforma conteúdo apenas gerado em conteúdo aceito.

## Decisões aprovadas

1. **M1 — histórico multi-WABA compartilhado.** A conversa canônica permanece por organização/contato. A identidade `channel_account_id` da WABA é imutável no inbound, turno, outbox e trace. A conta do último inbound incluído no `target_seq` recebe a resposta daquele turno; não se escolhe conta por recência depois da geração.
2. **Anotação restrita.** Somente `owner` e `admin` podem criar ou alterar avaliações `good`, `bad` e `fix`. Leitura segue o acesso autorizado da organização.
3. **Persistência atômica.** Depois de o CAS aceitar o turno, o runtime grava mensagem, outbox e trace na mesma transação. Falha do trace desfaz a transação e permite retry; CAS recusado não produz trace.
4. **Separação de semântica.** Traces históricos permanecem como `legacy_generated`; novos traces confirmados pelo runtime são `runtime_accepted`. Avaliações e propostas automáticas novas usam somente `runtime_accepted`; o legado continua consultável separadamente.
5. **Conteúdo protegido.** Input e resposta aceita podem ser persistidos. Argumentos e resultados de ferramentas passam por sanitização de segredos e headers, limite de tamanho e marcador de truncamento. A retenção existente permanece; nenhum histórico é apagado ou reclassificado.
6. **Compatibilidade de testes.** Nenhum teste existente será removido, ignorado ou enfraquecido para acomodar a mudança. Legado, caminho aceito e transição recebem provas separadas.

## Alternativas consideradas

### A. Escrita direta na mesma transação — escolhida

O worker conclui o CAS e, usando a mesma conexão/transação, registra o trace antes do commit. O identificador de outbox já produzido pelo turno é a chave natural de idempotência. Essa opção entrega consistência forte com a menor superfície nova.

### B. Evento transacional e projetor assíncrono — rejeitada

Separaria disponibilidade de serving e projeção analítica, mas exigiria nova fila, consumidor, retry e reconciliação. Não há requisito atual que justifique essa complexidade e o dataset ficaria eventualmente consistente.

### C. Upsert best-effort depois do commit — rejeitada

É a menor alteração inicial, mas permite resposta aceita sem trace e cria janelas de duplicação ou perda. Contradiz a atomicidade aprovada.

## Arquitetura e fluxo

```text
inbound com organization_id + conversation_id + channel_account_id
  -> job congela agent_id + target_seq + generation + channel_account_id
  -> tentativas de geração e tools
  -> GuardedOutcome seleciona uma tentativa
  -> transação escopada ao tenant
       -> internal.conclude_turn executa CAS
       -> se committed: mensagem + outbox já existem na transação
       -> registrar runtime_accepted para o outbox retornado
       -> commit
  -> sender usa a mesma channel_account_id
```

Regras:

- veto, superseded e CAS recusado não geram trace aceito;
- incerteza do cliente após commit não duplica trace, pois o outbox é único;
- falha antes do commit desfaz CAS, mensagem, outbox e trace juntos;
- retry posterior ao commit encontra o turno já concluído e não grava outra linha;
- o trace contém somente a tentativa selecionada, mesmo quando ela não é a última tentativa executada;
- tokens e custo de tentativas perdedoras, vetadas ou superseded permanecem em `internal.llm_calls` e estruturas operacionais existentes.

## Modelo de dados e transição

O caminho de migration é **expandir, migrar, verificar e somente então contrair**.

1. Expandir `public.agent_traces` de forma compatível com writers antigos, acrescentando identidade da origem, vínculo ao outbox, posição do turno, tentativa selecionada e classificação de origem.
2. Classificar inserts antigos e futuros do executor TypeScript como `legacy_generated` por default compatível. Não reescrever o significado das linhas existentes.
3. Gravar o novo caminho explicitamente como `runtime_accepted`.
4. Aplicar unicidade ao vínculo do trace aceito com o outbox. Não criar contador materializado nem segunda tabela de trace.
5. Trazer `public.agent_trace_annotations` para o fluxo canônico de migrations, preservando a relação única por trace e o histórico que eventualmente exista em ambientes antigos.
6. Não executar contração destrutiva neste trabalho. Qualquer retirada futura do writer legado exige prova de ausência de consumidores e autorização separada.

Antes de migration em produção, é obrigatória uma inspeção somente de leitura do catálogo remoto para descobrir tabelas, colunas, policies, grants e dados possivelmente criados por migrations arquivadas ou operações fora do repositório. A implementação local não presume que produção seja igual ao replay limpo.

## Segurança e isolamento

- Toda escrita usa conexão escopada à organização e valida que conversa, agente, WABA e outbox pertencem ao mesmo tenant.
- `worker_role` recebe somente a porta interna mínima necessária; não recebe insert amplo em tabelas públicas.
- A rota de anotação autentica o usuário, resolve a organização e exige papel `owner` ou `admin` antes de usar service role.
- A rota confirma que trace e agente pertencem à organização informada; IDs fornecidos pelo cliente nunca definem o tenant.
- Escrita direta em `agent_trace_annotations` por `anon` ou `authenticated` permanece indisponível.
- Segredos, tokens, cookies, authorization headers e credenciais reconhecíveis não entram em `tool_calls`.
- Payload sanitizado possui limite determinístico; truncamento é explícito para não simular completude.

## Consumidores e superfície de produto

- O fluxo de Eval e o gerador de propostas passam a consultar `runtime_accepted` quando produzem novos resultados automáticos.
- Histórico `legacy_generated` permanece acessível em uma visão ou filtro histórico, sem contaminar automaticamente o novo dataset.
- A superfície mínima de anotação vive no contexto de Eval/atividade já existente; não será criado um novo módulo de produto.
- A anotação oferece `good`, `bad` e `fix`; `fix` exige texto de correção. Upsert é idempotente por trace.
- Alterações de anotação registram autor e timestamps; exclusão física não faz parte deste escopo.

## Estratégia de implementação

### Pacote 1 — pré-requisito W2-T5

Implementar a ponte account-scoped aprovada para cinco RPCs e consumidores, congelar `channel_account_id` no evento/turno/outbox e provar duas contas da mesma organização com o mesmo contato. O fallback legado é permitido somente quando existe exatamente uma conta ativa; zero ou múltiplas contas são erro explícito sem mutação.

### Pacote 2 — schema canônico

Expandir `agent_traces`, promover `agent_trace_annotations` ao stream ativo, criar constraints, índices, policies e grants mínimos, além de provas de replay e upgrade com histórico legado.

### Pacote 3 — transporte atômico

Levar o `selected_attempt` e os metadados congelados até a transação de commit. Registrar o trace somente quando `conclude_turn` retornar `committed`, antes do commit externo da transação.

### Pacote 4 — anotação e consumidores

Adicionar a rota owner/admin e o controle mínimo na superfície Eval existente. Filtrar avaliações/propostas automáticas por `runtime_accepted` e manter consulta explícita do legado.

### Pacote 5 — integração e promoção local

Executar gates focais, suítes completas, replay limpo, upgrade de baseline e build Docker. A conclusão local não autoriza push, deploy, migration remota ou promoção.

## Pipeline de subagentes

- O controlador mantém a especificação, o plano, o ledger e arbitra conflitos.
- Cada pacote recebe um implementador novo e isolado; nunca dois implementadores escrevem em paralelo.
- Toda implementação segue RED -> confirmação da falha esperada -> GREEN mínimo -> refactor sem mudança de comportamento.
- Cada pacote recebe revisão independente de conformidade e qualidade. Findings Critical/Important entram no fix loop e são revistos.
- A execução Docker fica com um verificador sem autoria do código do pacote.
- A revisão global usa o agente mais capaz disponível e recebe o diff completo, a especificação e o ledger.

Distribuição pretendida:

| Pacote | Implementador | Revisor/verificador |
|---|---|---|
| W2-T5 multi-WABA | Astra | Astra independente + DB |
| Schema de traces/anotações | Sol | Astra |
| Transporte atômico | Astra | Astra independente |
| API/UI e consumidores | Sol | revisor de produto/segurança |
| Docker e regressões | Terra, somente verificação | Astra global |

## Provas de aceitação

1. Duas WABAs da mesma organização e o mesmo contato preservam histórico compartilhado, mas cada turno responde pela conta congelada no inbound incluído em `target_seq`.
2. Conta de outro tenant, conta ausente ou conta ambígua não produz LLM, mensagem, outbox nem trace.
3. CAS recusado, veto ou superseded não produz `runtime_accepted`.
4. Retry antes/depois do commit não duplica o trace.
5. Falha induzida na escrita do trace desfaz mensagem e outbox.
6. Tentativas 0, 1 e 2, com a 0 selecionada, persistem somente a saída/tools da 0 no trace; o metering mantém as três.
7. Sanitização remove valores secretos conhecidos, limita estruturas grandes e marca truncamento.
8. `owner` e `admin` anotam; demais papéis recebem 403 e não há mutação.
9. Eval/proposals automáticos ignoram `legacy_generated`; consulta histórica continua funcionando.
10. Todos os testes preexistentes continuam habilitados. Novos testes comprovam as duas semânticas e a transição.
11. Replay integral e upgrade de baseline chegam ao mesmo catálogo esperado, com DB/RLS/pipeline verdes.
12. Typecheck, lint, testes de app/runtime e build terminam sem falhas antes de qualquer afirmação de conclusão.

## Rollback e limites

- Rollback de aplicação desliga o novo writer e preserva todas as linhas já gravadas.
- Colunas e tabelas expandidas permanecem compatíveis; rollback não apaga traces ou anotações.
- Em ambiguidade de conta, o sistema falha fechado e não volta a selecionar a conta mais recente ou a primeira ativa.
- Não há backfill que declare traces históricos como aceitos sem evidência.
- Não há contador novo, nova fila, nova dependência ou abstração especulativa.
- Push, merge, deploy, migration remota e leitura de produção exigem autorização própria.
