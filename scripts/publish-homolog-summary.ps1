# scripts/publish-homolog-summary.ps1
# Script para publicação de evidências de homologação no GITHUB_STEP_SUMMARY

$ErrorActionPreference = 'Stop'

if (-not $env:GITHUB_STEP_SUMMARY) {
    Write-Host "GITHUB_STEP_SUMMARY nao definido no ambiente local. Pulando publicacao."
    exit 0
}

@'
### Package 5.7.1 — Disposable Homologation Gate (Scenarios K & L)
- **Runner:** Windows Server (Isolated GitHub Actions VM)
- **Database Engine:** PostgreSQL 14 (Isolated Ephemeral Cluster)
- **Execution Target:** `bin/agents/witiquetas-agent-windows-x64.exe` (Real PE Rust binary)
- **Validation Scope:** Scenario K (Manual Ambiguous Resolution) & Scenario L (Windows Agent Lifecycle)
- **Network Isolation:** Loopback only (Port 9100 closed/refused, zero physical printers)

#### Executed Test Results
'@ | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8

if (Test-Path "homolog-output.txt") {
    Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value '```text' -Encoding utf8
    Get-Content -Path "homolog-output.txt" | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8
    Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value '```' -Encoding utf8
} else {
    Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value '_Nenhum arquivo de saida homolog-output.txt gerado._' -Encoding utf8
}

Write-Host "Step Summary publicado com sucesso em: $env:GITHUB_STEP_SUMMARY"
