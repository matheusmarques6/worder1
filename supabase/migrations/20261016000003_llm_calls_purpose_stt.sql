-- 20261016000003_llm_calls_purpose_stt.sql
--
-- Plano IA (15/10/2026), M1 passo 6 — runtime/docs/alteracoes/2026-10-15-03.
--
-- O runtime passa a transcrever áudio (purpose `stt`) e, nos passos seguintes
-- do M1/M4/M5, a gravar `copilot`, `playground`, `topic`, `gap_suggestion` e
-- `eval`. O CHECK de `internal.llm_calls.purpose` e o mapa purpose→feature do
-- espelho em `ai_usage_logs` são fechados de propósito ("feature inventada é
-- pior que coluna vazia"), então cada finalidade nova entra aqui, nos dois.
--
-- `stt` espelha como `transcription`, a MESMA feature que o motor legado já
-- usava (`src/lib/ai/media/transcription.ts`), para a tela de uso somar os
-- dois motores na mesma linha.
--
-- down: recriar o CHECK anterior (sem os seis valores) e a função de
--       20260902000003.

alter table internal.llm_calls drop constraint if exists llm_calls_purpose_check;
alter table internal.llm_calls add constraint llm_calls_purpose_check
  check (purpose in (
    'agent_reply', 'judge_pre', 'judge_async', 'prompt_generator',
    'copy_variation', 'embedding',
    'stt', 'copilot', 'playground', 'topic', 'gap_suggestion', 'eval'
  ));

create or replace function internal.mirror_llm_call_to_usage_logs()
    returns trigger
    language plpgsql
as $body$
declare
    v_feature text;
begin
    if new.organization_id is null then
        return new;
    end if;

    case new.purpose
        when 'agent_reply'      then v_feature := 'runtime_agent_reply';
        when 'judge_pre'        then v_feature := 'runtime_judge_pre';
        when 'judge_async'      then v_feature := 'runtime_judge_async';
        when 'prompt_generator' then v_feature := 'runtime_prompt_generator';
        when 'copy_variation'   then v_feature := 'runtime_copy_variation';
        when 'embedding'        then v_feature := 'runtime_embedding';
        when 'stt'              then v_feature := 'transcription';
        when 'copilot'          then v_feature := 'copilot';
        when 'playground'       then v_feature := 'runtime_playground';
        when 'topic'            then v_feature := 'runtime_topic';
        when 'gap_suggestion'   then v_feature := 'gap_suggestion';
        when 'eval'             then v_feature := 'runtime_eval';
        else
            raise exception
                'internal.llm_calls.purpose sem mapa para ai_usage_logs.feature: %', new.purpose;
    end case;

    insert into public.ai_usage_logs
        (organization_id, provider, model, feature, agent_id, conversation_id,
         prompt_tokens, completion_tokens, cost_usd, duration_ms, success)
    values
        (new.organization_id, new.provider, new.model, v_feature, new.agent_id,
         new.conversation_id, coalesce(new.input_tokens, 0), coalesce(new.output_tokens, 0),
         new.cost_usd, new.latency_ms, true);

    return new;
end;
$body$;
