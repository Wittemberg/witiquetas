# scripts/setup-postgres14-runner.ps1
# Script de provisionamento e validação estrita do PostgreSQL 14 para o runner descartável Windows (GitHub Actions)

$ErrorActionPreference = 'Stop'

Write-Host "=========================================================="
Write-Host "  PROVISIONAMENTO DO POSTGRESQL 14 (ISOLADO / HOMOLOGAÇÃO)"
Write-Host "=========================================================="

# 1. Identificar e desabilitar quaisquer serviços PostgreSQL pré-existentes de versões incompatíveis
Write-Host "`n[Passo 1/5] Verificando e desativando servicos PostgreSQL de versoes concorrentes..."
$existingServices = Get-Service | Where-Object { $_.Name -like "*postgres*" -and $_.Name -notlike "*14*" }
foreach ($svc in $existingServices) {
    Write-Host "  -> Parando e desabilitando servico concorrente: $($svc.Name)"
    Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
    Set-Service -Name $svc.Name -StartupType Disabled -ErrorAction SilentlyContinue
}

# 2. Localizar ou Instalar explicitamente o PostgreSQL 14 via Chocolatey
Write-Host "`n[Passo 2/5] Verificando binarios do PostgreSQL 14..."
$pg14Bin = "C:\Program Files\PostgreSQL\14\bin"

if (-not (Test-Path "$pg14Bin\pg_ctl.exe")) {
    $cand14 = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^14" } | Select-Object -First 1
    if ($cand14) {
        $pg14Bin = "$($cand14.FullName)\bin"
    }
}

if (-not (Test-Path "$pg14Bin\pg_ctl.exe")) {
    Write-Host "  -> PostgreSQL 14 nao encontrado pre-instalado. Instalando explicitamente via Chocolatey..."
    choco install postgresql14 --params "'/Password:root /Port:5432'" -y --no-progress
    if ($LASTEXITCODE -ne 0) {
        throw "FALHA: Chocolatey install postgresql14 falhou com exit code $LASTEXITCODE"
    }
}

# Re-verificar após instalação
if (-not (Test-Path "$pg14Bin\pg_ctl.exe")) {
    $cand14 = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^14" } | Select-Object -First 1
    if ($cand14) {
        $pg14Bin = "$($cand14.FullName)\bin"
    }
}

if (-not (Test-Path "$pg14Bin\pg_ctl.exe")) {
    throw "FALHA CRITICA: Binarios do PostgreSQL 14 nao foram encontrados apos instalacao."
}

Write-Host "  -> Binarios do PostgreSQL 14 localizados em: $pg14Bin"

# Exportar para GITHUB_PATH e PATH da sessão atual
if ($env:GITHUB_PATH) {
    $pg14Bin | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
}
$env:PATH = "$pg14Bin;$env:PATH"

# 3. Validar versão maior estrita: PostgreSQL major version = 14
Write-Host "`n[Passo 3/5] Validando versao do executavel psql..."
$versionRaw = & "$pg14Bin\psql.exe" --version
if ($LASTEXITCODE -ne 0) {
    throw "FALHA: psql --version falhou com exit code $LASTEXITCODE"
}
Write-Host "  -> Versao reportada: $versionRaw"

if ($versionRaw -notmatch "14\.") {
    throw "FALHA DE HOMOLOGACAO: Versao do PostgreSQL DEVE ser 14.x. Versao detectada: $versionRaw"
}
Write-Host "  -> VALIDACAO PASS: PostgreSQL major version = 14 confirmado."

# 4. Iniciar PostgreSQL 14 e aguardar pg_isready
Write-Host "`n[Passo 4/5] Inicializando servico / processo PostgreSQL 14 na porta 5432..."
$pg14Service = Get-Service | Where-Object { $_.Name -like "*postgres*14*" }
if ($pg14Service) {
    Write-Host "  -> Servico Windows '$($pg14Service.Name)' encontrado. Iniciando..."
    Set-Service -Name $pg14Service.Name -StartupType Automatic -ErrorAction SilentlyContinue
    Start-Service -Name $pg14Service.Name -ErrorAction SilentlyContinue
}

$ready = $false
for ($i = 1; $i -le 15; $i++) {
    & "$pg14Bin\pg_isready.exe" -h 127.0.0.1 -p 5432
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host "  -> Servico Windows nao respondeu. Inicializando cluster de homologacao via initdb e pg_ctl..."
    $pgData = "$env:TEMP\pgdata_homolog14"
    if (-not (Test-Path "$pgData\PG_VERSION")) {
        New-Item -ItemType Directory -Force -Path $pgData | Out-Null
        Write-Host "  -> Executando initdb em $pgData..."
        & "$pg14Bin\initdb.exe" -D $pgData -U postgres -A trust -E UTF8
        if ($LASTEXITCODE -ne 0) {
            throw "FALHA: initdb falhou com exit code $LASTEXITCODE"
        }
    }
    Write-Host "  -> Iniciando PostgreSQL 14 via pg_ctl na porta 5432..."
    & "$pg14Bin\pg_ctl.exe" -D $pgData -l "$pgData\postgres.log" -o "-p 5432" start
    if ($LASTEXITCODE -ne 0) {
        throw "FALHA: pg_ctl start falhou com exit code $LASTEXITCODE"
    }

    for ($i = 1; $i -le 15; $i++) {
        & "$pg14Bin\pg_isready.exe" -h 127.0.0.1 -p 5432
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    throw "FALHA FATAL: pg_isready nao retornou sucesso para PostgreSQL 14 na porta 5432."
}
Write-Host "  -> VALIDACAO PASS: pg_isready retornou sucesso."

# 5. Validar SELECT 1, autenticação e criar banco descartável witiquetas_homolog
Write-Host "`n[Passo 5/5] Testando autenticacao, SELECT 1 e criando banco witiquetas_homolog..."
$env:PGPASSWORD = "root"

# Testar conexão no banco padrão postgres
& "$pg14Bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT 1;"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  -> Falha com senha root. Tentando conexao trust sem senha..."
    $env:PGPASSWORD = ""
    & "$pg14Bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT 1;"
    if ($LASTEXITCODE -ne 0) {
        throw "FALHA: Nao foi possivel conectar ao banco postgres via psql."
    }
    # Atualizar senha para 'root' de modo determinístico
    Write-Host "  -> Definindo senha 'root' para o usuario postgres..."
    & "$pg14Bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'root';"
    if ($LASTEXITCODE -ne 0) {
        throw "FALHA: Falha ao executar ALTER USER postgres WITH PASSWORD 'root'."
    }
    $env:PGPASSWORD = "root"
}
Write-Host "  -> VALIDACAO PASS: SELECT 1 executado com sucesso no banco padrao."

# Dropar witiquetas_homolog se já existir e recriar limpo
& "$pg14Bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "DROP DATABASE IF EXISTS witiquetas_homolog;"
if ($LASTEXITCODE -ne 0) {
    throw "FALHA: DROP DATABASE witiquetas_homolog falhou com exit code $LASTEXITCODE"
}

# Criar banco witiquetas_homolog
& "$pg14Bin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres witiquetas_homolog
if ($LASTEXITCODE -ne 0) {
    throw "FALHA: createdb witiquetas_homolog falhou com exit code $LASTEXITCODE"
}
Write-Host "  -> VALIDACAO PASS: Banco temporario witiquetas_homolog criado com sucesso."

# Validar SELECT 1 no banco witiquetas_homolog recém-criado
& "$pg14Bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d witiquetas_homolog -c "SELECT 1;"
if ($LASTEXITCODE -ne 0) {
    throw "FALHA: SELECT 1 no banco witiquetas_homolog falhou com exit code $LASTEXITCODE"
}
Write-Host "  -> VALIDACAO PASS: SELECT 1 executado com sucesso em witiquetas_homolog."

Write-Host "`n=========================================================="
Write-Host "  POSTGRESQL 14 PROVISIONADO E VALIDADO COM SUCESSO!"
Write-Host "=========================================================="
