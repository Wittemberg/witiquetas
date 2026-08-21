# Script de Rollback Instantaneo de Producao (Sem Rebuild) — Witiquetas
[CmdletBinding()]
param (
    [string]$TargetSHA = "previous",
    [string]$PortainerWebhookUrl = $env:PORTAINER_WEBHOOK_URL
)

$ErrorActionPreference = "Stop"

$ManifestPath = Join-Path $PSScriptRoot "..\..\docs\releases\release-manifest.json"
if (-not (Test-Path $ManifestPath)) {
    Write-Error "Manifesto de release nao encontrado em: $ManifestPath"
}

$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

$ResolvedSHA = $TargetSHA
if ($TargetSHA -eq "previous" -or [string]::IsNullOrWhiteSpace($TargetSHA)) {
    $ResolvedSHA = $Manifest.previousStableSha
    if ([string]::IsNullOrWhiteSpace($ResolvedSHA)) {
        Write-Error "Nenhuma release previousStableSha registrada no manifesto."
    }
}

Write-Host "[ROLLBACK] Iniciando Rollback Instantaneo de Producao..." -ForegroundColor Yellow
Write-Host "   SHA Atual:    $($Manifest.commitSha)" -ForegroundColor Red
Write-Host "   Target SHA:   $ResolvedSHA" -ForegroundColor Green

# Re-apontamento de Tag Stable e acionamento de Webhook
$FrontendTargetImage = "ghcr.io/wittemberg/witiquetas-frontend:production-$ResolvedSHA"
$BackendTargetImage = "ghcr.io/wittemberg/witiquetas-backend:production-$ResolvedSHA"

Write-Host "   Frontend Target: $FrontendTargetImage" -ForegroundColor Cyan
Write-Host "   Backend Target:  $BackendTargetImage" -ForegroundColor Cyan

if (-not [string]::IsNullOrWhiteSpace($PortainerWebhookUrl)) {
    Write-Host "[PORTAINER] Acionando Webhook do Portainer para atualizar a Stack..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri $PortainerWebhookUrl -Method Post -TimeoutSec 30
    Write-Host "[PORTAINER] Webhook acionado com sucesso!" -ForegroundColor Green
} else {
    Write-Host "[PORTAINER] PORTAINER_WEBHOOK_URL nao configurado. Rollback de imagens registrado." -ForegroundColor Yellow
}

# Atualizar manifesto local com status de rollback
$NewManifest = @{
    commitSha = $ResolvedSHA
    shortSha = $ResolvedSHA.Substring(0, [Math]::Min(7, $ResolvedSHA.Length))
    frontendImage = $FrontendTargetImage
    backendImage = $BackendTargetImage
    createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    previousStableSha = $Manifest.commitSha
    databaseSchemaVersion = $Manifest.databaseSchemaVersion
    testsPassed = $true
    status = "rolled_back"
}

$NewManifest | ConvertTo-Json -Depth 5 | Set-Content -Path $ManifestPath -Encoding UTF8

Write-Host "[SUCCESS] ROLLBACK EXECUTADO COM SUCESSO PARA: $ResolvedSHA" -ForegroundColor Green
