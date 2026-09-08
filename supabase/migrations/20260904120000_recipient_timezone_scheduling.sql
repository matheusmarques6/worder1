-- =============================================================
-- Agendamento no fuso do destinatário
--
-- A coluna contacts.timezone já existia, mas nada nunca escreveu nela:
-- 23.125 contatos, zero preenchidos. Ela alimentava um filtro de
-- segmento que não podia casar com ninguém. Esta migração:
--
--   1. dá à campanha um modo de fuso ('fixed' | 'recipient');
--   2. registra de ONDE veio o fuso de cada contato, para separar o
--      que o navegador informou do que foi deduzido pelo país;
--   3. faz o backfill inicial a partir do país;
--   4. indexa o que as consultas de envio passam a agrupar.
-- =============================================================

-- 1. Modo de fuso da campanha -------------------------------------
ALTER TABLE email_campaigns
  ADD COLUMN IF NOT EXISTS timezone_mode text NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_campaigns_timezone_mode_check'
  ) THEN
    ALTER TABLE email_campaigns
      ADD CONSTRAINT email_campaigns_timezone_mode_check
      CHECK (timezone_mode IN ('fixed', 'recipient'));
  END IF;
END $$;

COMMENT ON COLUMN email_campaigns.timezone_mode IS
  'fixed = todos recebem no mesmo instante (scheduled_at). recipient = cada contato recebe no horário de parede escolhido, no fuso DELE.';

-- 2. Procedência do fuso do contato -------------------------------
-- Sem isto não dá para dizer se "America/Sao_Paulo" veio do navegador
-- do contato ou é o palpite do país — e a diferença importa quando o
-- lojista pergunta por que alguém recebeu às 6h.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS timezone_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_timezone_source_check'
  ) THEN
    ALTER TABLE contacts
      ADD CONSTRAINT contacts_timezone_source_check
      CHECK (timezone_source IS NULL OR timezone_source IN ('browser', 'country', 'shopify', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN contacts.timezone IS
  'Fuso IANA do contato. Preenchido pelo pixel (Intl.DateTimeFormat) ou deduzido do país — veja timezone_source.';

-- 3. Backfill pelo país -------------------------------------------
-- Só onde o fuso ainda está vazio: o dado do navegador, quando
-- chegar, é melhor e não pode ser sobrescrito por um palpite.
-- Países de fuso único ficam exatos; nos de vários (US, CA, AU, RU,
-- MX, ID) entra o fuso mais populoso, que é o mesmo critério que a
-- concorrência usa na ausência do dado do navegador.
WITH mapa(iso, tz) AS (
  VALUES
    ('BR','America/Sao_Paulo'), ('PT','Europe/Lisbon'), ('US','America/New_York'),
    ('CA','America/Toronto'), ('MX','America/Mexico_City'), ('AR','America/Argentina/Buenos_Aires'),
    ('CL','America/Santiago'), ('CO','America/Bogota'), ('PE','America/Lima'),
    ('UY','America/Montevideo'), ('PY','America/Asuncion'), ('BO','America/La_Paz'),
    ('EC','America/Guayaquil'), ('VE','America/Caracas'), ('CR','America/Costa_Rica'),
    ('PA','America/Panama'), ('GT','America/Guatemala'), ('DO','America/Santo_Domingo'),
    ('PR','America/Puerto_Rico'),
    ('GB','Europe/London'), ('IE','Europe/Dublin'), ('FR','Europe/Paris'),
    ('ES','Europe/Madrid'), ('IT','Europe/Rome'), ('DE','Europe/Berlin'),
    ('NL','Europe/Amsterdam'), ('BE','Europe/Brussels'), ('CH','Europe/Zurich'),
    ('AT','Europe/Vienna'), ('SE','Europe/Stockholm'), ('NO','Europe/Oslo'),
    ('DK','Europe/Copenhagen'), ('FI','Europe/Helsinki'), ('PL','Europe/Warsaw'),
    ('CZ','Europe/Prague'), ('GR','Europe/Athens'), ('RO','Europe/Bucharest'),
    ('HU','Europe/Budapest'), ('BG','Europe/Sofia'), ('UA','Europe/Kyiv'),
    ('RU','Europe/Moscow'), ('TR','Europe/Istanbul'),
    ('AU','Australia/Sydney'), ('NZ','Pacific/Auckland'),
    ('JP','Asia/Tokyo'), ('CN','Asia/Shanghai'), ('KR','Asia/Seoul'),
    ('IN','Asia/Kolkata'), ('ID','Asia/Jakarta'), ('TH','Asia/Bangkok'),
    ('VN','Asia/Ho_Chi_Minh'), ('PH','Asia/Manila'), ('MY','Asia/Kuala_Lumpur'),
    ('SG','Asia/Singapore'), ('HK','Asia/Hong_Kong'), ('TW','Asia/Taipei'),
    ('PK','Asia/Karachi'), ('BD','Asia/Dhaka'), ('LK','Asia/Colombo'),
    ('AE','Asia/Dubai'), ('SA','Asia/Riyadh'), ('IL','Asia/Jerusalem'),
    ('ZA','Africa/Johannesburg'), ('NG','Africa/Lagos'), ('KE','Africa/Nairobi'),
    ('EG','Africa/Cairo'), ('MA','Africa/Casablanca'), ('AO','Africa/Luanda'),
    ('MZ','Africa/Maputo')
),
nomes(nome, iso) AS (
  VALUES
    ('brazil','BR'), ('brasil','BR'), ('portugal','PT'),
    ('united states','US'), ('usa','US'), ('united states of america','US'),
    ('canada','CA'), ('mexico','MX'), ('méxico','MX'), ('argentina','AR'),
    ('chile','CL'), ('colombia','CO'), ('peru','PE'), ('uruguay','UY'),
    ('united kingdom','GB'), ('england','GB'), ('ireland','IE'), ('france','FR'),
    ('spain','ES'), ('italy','IT'), ('germany','DE'), ('netherlands','NL'),
    ('belgium','BE'), ('switzerland','CH'), ('austria','AT'), ('sweden','SE'),
    ('norway','NO'), ('denmark','DK'), ('finland','FI'), ('poland','PL'),
    ('greece','GR'), ('turkey','TR'), ('russia','RU'),
    ('australia','AU'), ('new zealand','NZ'), ('japan','JP'), ('china','CN'),
    ('south korea','KR'), ('india','IN'), ('indonesia','ID'), ('thailand','TH'),
    ('vietnam','VN'), ('philippines','PH'), ('malaysia','MY'), ('singapore','SG'),
    ('hong kong','HK'), ('taiwan','TW'), ('pakistan','PK'), ('bangladesh','BD'),
    ('united arab emirates','AE'), ('saudi arabia','SA'), ('israel','IL'),
    ('south africa','ZA'), ('nigeria','NG'), ('kenya','KE'), ('egypt','EG'),
    ('morocco','MA')
)
UPDATE contacts c
SET timezone = m.tz,
    timezone_source = 'country'
FROM mapa m
WHERE c.timezone IS NULL
  AND c.country IS NOT NULL
  AND m.iso = COALESCE(
        CASE WHEN length(btrim(c.country)) = 2 THEN upper(btrim(c.country)) END,
        (SELECT n.iso FROM nomes n WHERE n.nome = lower(btrim(c.country)))
      );

-- 4. Índices ------------------------------------------------------
-- A campanha no fuso do destinatário agrupa os contatos por fuso; sem
-- índice isso é varredura completa em toda campanha grande.
CREATE INDEX IF NOT EXISTS idx_contacts_org_timezone
  ON contacts (organization_id, timezone)
  WHERE timezone IS NOT NULL;

-- O cron de campanhas passa a olhar uma janela adiantada para o modo
-- 'recipient' (o fuso mais a leste chega ao horário local antes).
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled
  ON email_campaigns (status, scheduled_at)
  WHERE status = 'scheduled';
