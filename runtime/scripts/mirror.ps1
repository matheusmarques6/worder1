# Espelha o banco de produção (Supabase nuvem) no db local do compose.
# Repetível: rodar de novo re-espelha por cima. O dump vive só em /tmp do
# container — dados sensíveis não tocam o disco do host.
# Uso:  cd runtime; powershell -ExecutionPolicy Bypass -File scripts\mirror.ps1
$ErrorActionPreference = 'Stop'
$runtimeDir = Split-Path -Parent $PSScriptRoot
Set-Location $runtimeDir

# 1. DSN da nuvem — fonte única: .env.piloto
$envFile = Join-Path $runtimeDir '.env.piloto'
if (-not (Test-Path $envFile)) { throw "Crie runtime/.env.piloto a partir do .env.piloto.example antes de espelhar." }
$dsnLine = (Select-String -Path $envFile -Pattern '^SUPABASE_DB_URL=').Line
if (-not $dsnLine) { throw "SUPABASE_DB_URL ausente no .env.piloto." }
$cloudDsn = $dsnLine.Substring('SUPABASE_DB_URL='.Length).Trim()
if ($cloudDsn -match 'SENHA_DO_BANCO') { throw "Preencha a senha real no .env.piloto (ainda esta com placeholder)." }

# 2. db de pé e saudável
docker compose --profile bancada up -d db
if ($LASTEXITCODE -ne 0) { throw "docker compose up db falhou." }
$deadline = (Get-Date).AddMinutes(3)
do {
  $health = docker inspect -f '{{.State.Health.Status}}' runtime-db-1
  if ($health -eq 'healthy') { break }
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)
if ($health -ne 'healthy') { throw "db nao ficou healthy em 3 min (status: $health). Veja: docker logs runtime-db-1" }

# 3. runtime-bancada parado durante o restore (conexoes abertas travam DROPs)
docker compose --profile bancada stop runtime-bancada

# 4. dump da nuvem, dentro do container (pg_dump 17 da propria imagem)
Write-Host ">> pg_dump (public, internal, auth) da nuvem..."
docker compose exec -T db pg_dump "$cloudDsn" -Fc -n public -n internal -n auth --no-owner -f /tmp/mirror.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou — confira a senha/DSN do .env.piloto (session pooler 5432)." }

# 5. pre-restore: roles + extensoes
docker compose cp scripts/pre-restore.sql db:/tmp/pre-restore.sql
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/pre-restore.sql
if ($LASTEXITCODE -ne 0) { throw "pre-restore.sql falhou." }

# 6. restore (avisos sao esperados na 1a carga do schema auth; erro real para no passo 8)
Write-Host ">> pg_restore no db local..."
docker compose exec -T db pg_restore -U postgres -d postgres --clean --if-exists --no-owner /tmp/mirror.dump
Write-Host ">> pg_restore terminou (exit $LASTEXITCODE; avisos tolerados, validacao decide)."

# 7. post-restore: filas vazias + heartbeats zerados + grants pgmq
docker compose cp scripts/post-restore.sql db:/tmp/post-restore.sql
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/post-restore.sql
if ($LASTEXITCODE -ne 0) { throw "post-restore.sql falhou." }
docker compose exec -T db rm -f /tmp/mirror.dump /tmp/pre-restore.sql /tmp/post-restore.sql

# 8. validacao de fidelidade: contagens local x nuvem nas tabelas que o runtime le
$checkSql = "select 'organizations', count(*) from public.organizations union all select 'contacts', count(*) from public.contacts union all select 'organization_api_keys', count(*) from public.organization_api_keys order by 1;"
Write-Host "`n== NUVEM =="
docker compose exec -T db psql "$cloudDsn" -t -c "$checkSql"
Write-Host "== LOCAL =="
docker compose exec -T db psql -U postgres -d postgres -t -c "$checkSql"
Write-Host "== filas (esperado 8) e heartbeats (esperado 0) =="
docker compose exec -T db psql -U postgres -d postgres -t -c "select count(*) from pgmq.meta; select count(*) from internal.runtime_heartbeats;"

Write-Host "`nCompare as contagens acima. Se baterem: docker compose --profile bancada up -d  (religa o runtime)"
