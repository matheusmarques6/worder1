# Fechamento local e rollout — 19/10/2026

Autorização: concluir revisões, mídia, Redis e lint; corrigir achados e publicar
somente depois das validações. Preservar dados e alterações do usuário.

1. Concluir revisões independentes de identidade/runtime, credenciais e mídia.
   Reproduzir os bloqueadores com testes e corrigir o ponto responsável.
2. Executar SQL de mídia em Supabase descartável e testar upload, leitura,
   assinatura e negações entre organizações pelo Storage HTTP real.
3. Executar atomicidade Redis com SDK real, Lua e Redis descartável. Os testes
   atualmente chamados de reais ainda estão sob mocks; separar essa fronteira
   antes de executar, sem transformar infraestrutura ausente em sucesso.
4. Corrigir o efeito do ChatPanel com prova de troca de organização, preservando
   cancelamento e limpando o nome anterior. Executar lint estrito.
5. Repetir app, runtime, banco/RLS/pipeline, tipos, build e interface após fixes.
   Conferir instalação congelada, audit e scanner. Documentar contagens/skips.
6. Revisar o diff final e o candidato remoto. Conferir os checks obrigatórios e
   a configuração de homologação; nunca ignorar um check vermelho ou ausente.
7. Após gates satisfeitos, inspecionar metadados necessários ao rollout,
   verificar recuperação/backup e aplicar somente mudanças não destrutivas
   compatíveis. Identidade/runtime antes ou junto do código; mídia privada
   depois dos leitores compatíveis. Verificar deploy e smoke, sem expor segredos.

KMS, rotação externa, cobertura integral LGPD e homologação seguem explícitos:
não afirmar que estão resolvidos por testes locais. Um bloqueio real de rollout
será apresentado com evidência; não será contornado para publicar.

## Ajuste de execução autorizado em 19/10

O usuário escolheu executar os gates pesados no GitHub em vez de liberar mais
memória local. Atualizar a branch do PR #10 e testar o commit remoto; isso não
equivale a promover o código para a branch de produção. Usar Supabase/Storage e
Redis descartáveis nos runners, sem credenciais ou dados de produção. Investigar
falhas do candidato e repetir somente os gates afetados. As jornadas reais
continuam obrigatórias e dependem da configuração de homologação; não transformar
configuração ausente, timeout ou teste não executado em aprovação.
