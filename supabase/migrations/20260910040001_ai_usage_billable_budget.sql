-- Separa consumo cobrável da organização do consumo pago pela plataforma.
-- Histórico sem metadata.billable mantém a regra anterior: é cobrável.

DO $guard$
BEGIN
    IF to_regclass('public.ai_usage_logs') IS NULL THEN
        RAISE NOTICE 'ai_usage_logs ausente — pulando filtro billable do budget';
        RETURN;
    END IF;

    CREATE OR REPLACE FUNCTION public.ai_monthly_cost_usd(
        p_organization_id uuid,
        p_month_start     timestamptz
    )
    RETURNS TABLE (spent_usd numeric, has_unknown_cost boolean)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $body$
        SELECT
            COALESCE(SUM(cost_usd), 0)                  AS spent_usd,
            COALESCE(BOOL_OR(cost_usd IS NULL), false) AS has_unknown_cost
        FROM public.ai_usage_logs
        WHERE organization_id = p_organization_id
          AND created_at >= p_month_start
          AND (metadata ->> 'billable') IS DISTINCT FROM 'false';
    $body$;

    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.ai_monthly_cost_usd(uuid, timestamptz) TO service_role;
END
$guard$;

-- Rollback: uma migration compensatória deve restaurar o corpo anterior da
-- função, sem apagar ai_usage_logs, metadata, custos NULL ou histórico.
