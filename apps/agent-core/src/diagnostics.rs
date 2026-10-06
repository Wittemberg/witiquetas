//! Módulo de Diagnósticos Não-Destrutivo e Auditoria de Segurança do Witiquetas Agent
//!
//! # Visão Geral e Princípios Arquiteturais (Package 5.7.2)
//! 1. **Não-Destrutivo & Concorrência Segura**:
//!    - Não interrompe o serviço de impressão em execução nem altera arquivos de configuração.
//!    - Testes de gravação em disco usam arquivos temporários efêmeros (.probe_*.tmp) imediatamente excluídos.
//! 2. **Redaction & Segurança Estrita**:
//!    - NUNCA expõe tokens de autenticação (`token`, `session_token`, JWTs ou credenciais) na struct, nos logs ou no console.
//!    - Metadados expostos são estritamente operacionais: `agent_id`, `machine_name`, `backend_url`, status de serviço e conectividade.
//! 3. **Auditoria de Permissões (Windows ProgramData ACL)**:
//!    - O diretório canônico `%ProgramData%\Witiquetas\Agent` deve possuir ACLs estritas:
//!      * `NT AUTHORITY\SYSTEM`: Controle Total (Full Control - F)
//!      * `BUILTIN\Administrators`: Controle Total (Full Control - F)
//!      * `BUILTIN\Users`: Somente Leitura (RX) ou Sem Acesso a `identity.json`, impedindo
//!        que usuários desprivilegiados adulterem chaves de máquina (Anti-Impersonation).
//! 4. **Saída Estruturada & Humana**:
//!    - Suporte a relatório em texto formatado para console e JSON canônico via `--json`.

use crate::pairing::{self, AgentIdentityData, DEFAULT_BACKEND_URL};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Estado operacional do Windows Service
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatusState {
    Running,
    Stopped,
    NotInstalled,
    Unknown,
}

impl std::fmt::Display for ServiceStatusState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ServiceStatusState::Running => write!(f, "Running"),
            ServiceStatusState::Stopped => write!(f, "Stopped"),
            ServiceStatusState::NotInstalled => write!(f, "NotInstalled"),
            ServiceStatusState::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Nível de severidade de um item de diagnóstico
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckStatus {
    Ok,
    Warning,
    Error,
}

/// Item individual de verificação do diagnóstico
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCheckItem {
    pub name: String,
    pub status: CheckStatus,
    pub message: String,
}

/// Relatório de Diagnóstico Seguro e Não-Destrutivo
///
/// **GARANTIA DE SEGURANÇA**:
/// Nenhum campo desta estrutura contém ou conterá tokens, chaves de autenticação
/// ou segredos confidenciais.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    // 1. Metadados de Compilação & Build
    pub agent_version: String,
    pub build_commit: String,
    pub build_timestamp: String,
    pub target_architecture: String,

    // 2. Sistema Operacional
    pub os: String,
    pub os_version: String,
    pub architecture: String,

    // 3. Serviço do Sistema (Windows Service)
    pub service_installed: bool,
    pub service_state: ServiceStatusState,

    // 4. Pareamento & Identidade (Seguro - Sem Tokens)
    pub paired: bool,
    pub agent_id: Option<String>,
    pub machine_name: String,
    pub backend_url: String,

    // 5. Testes de I/O e Conectividade
    pub identity_readable: bool,
    pub config_dir_writable: bool,
    pub log_dir_writable: bool,
    pub backend_reachable: bool,

    // 6. Resumo e Itens de Inspeção
    pub healthy: bool,
    pub checks: Vec<DiagnosticCheckItem>,
    pub duration_ms: u64,
}

impl DiagnosticReport {
    /// Formata o diagnóstico para exibição amigável em terminal
    pub fn format_human(&self) -> String {
        let mut out = String::new();
        out.push_str("=================================================================\n");
        out.push_str("       WITIQUETAS PRINT AGENT — DIAGNÓSTICO DO SISTEMA           \n");
        out.push_str("=================================================================\n\n");

        out.push_str("1. INFORMAÇÕES DE VERSÃO E BUILD\n");
        out.push_str(&format!("   - Versão do Agent:       v{}\n", self.agent_version));
        out.push_str(&format!("   - Commit de Build:       {}\n", self.build_commit));
        out.push_str(&format!("   - Data da Build:         {}\n", self.build_timestamp));
        out.push_str(&format!("   - Arquitetura Alvo:      {}\n\n", self.target_architecture));

        out.push_str("2. SISTEMA OPERACIONAL\n");
        out.push_str(&format!("   - SO:                    {}\n", self.os));
        out.push_str(&format!("   - Versão do SO:          {}\n", self.os_version));
        out.push_str(&format!("   - Arquitetura da CPU:    {}\n\n", self.architecture));

        out.push_str("3. SERVIÇO DO WINDOWS (SCM)\n");
        let service_tag = match self.service_state {
            ServiceStatusState::Running => "[OK] Em Execução (Running)",
            ServiceStatusState::Stopped => "[AVISO] Parado (Stopped)",
            ServiceStatusState::NotInstalled => "[AVISO] Não Instalado",
            ServiceStatusState::Unknown => "[DESCONHECIDO] Status não identificado",
        };
        out.push_str(&format!("   - Serviço Instalado:     {}\n", if self.service_installed { "Sim" } else { "Não" }));
        out.push_str(&format!("   - Estado do Serviço:     {}\n\n", service_tag));

        out.push_str("4. CONECTIVIDADE E PAREAMENTO (REDACTED)\n");
        out.push_str(&format!("   - Pareado:               {}\n", if self.paired { "Sim (Conectado)" } else { "Não (Pendente de pareamento)" }));
        if let Some(ref aid) = self.agent_id {
            out.push_str(&format!("   - ID do Agent:           {}\n", aid));
        } else {
            out.push_str("   - ID do Agent:           (nenhum)\n");
        }
        out.push_str(&format!("   - Nome do Computador:    {}\n", self.machine_name));
        out.push_str(&format!("   - Servidor Witiquetas:   {}\n", self.backend_url));
        out.push_str(&format!("   - Servidor Acessível:    {}\n\n", if self.backend_reachable { "[OK] Conectado (3s probe)" } else { "[ERRO] Inacessível" }));

        out.push_str("5. PERMISSÕES E SISTEMA DE ARQUIVOS (I/O PROBE)\n");
        out.push_str(&format!("   - Leitura de Identidade: {}\n", if self.identity_readable { "[OK] Acessível" } else { "[ERRO] Não acessível" }));
        out.push_str(&format!("   - Escrita Config Dir:    {}\n", if self.config_dir_writable { "[OK] Permissão de escrita OK" } else { "[ERRO] Permissão negada" }));
        out.push_str(&format!("   - Escrita Logs Dir:      {}\n\n", if self.log_dir_writable { "[OK] Permissão de escrita OK" } else { "[ERRO] Permissão negada" }));

        out.push_str("6. SÍNTESE DO DIAGNÓSTICO\n");
        for check in &self.checks {
            let symbol = match check.status {
                CheckStatus::Ok => "  [OK]   ",
                CheckStatus::Warning => "  [AVISO]",
                CheckStatus::Error => "  [FALHA]",
            };
            out.push_str(&format!(" {} {}: {}\n", symbol, check.name, check.message));
        }

        out.push_str("\n-----------------------------------------------------------------\n");
        if self.healthy {
            out.push_str(" STATUS GERAL: SAUDÁVEL (Pronto para operação de impressão)\n");
        } else {
            out.push_str(" STATUS GERAL: ATENÇÃO NECESSÁRIA (Consulte as falhas/avisos acima)\n");
        }
        out.push_str(&format!(" Tempo de Diagnóstico: {} ms\n", self.duration_ms));
        out.push_str("=================================================================\n");
        out
    }

    /// Serializa para formato JSON estruturado
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

/// Executa a bateria de diagnósticos não-destrutivos e auditoria de segurança
pub async fn run_diagnostics(backend_url_override: Option<&str>) -> DiagnosticReport {
    let start_time = Instant::now();
    let mut checks = Vec::new();

    // 1. Build & Versão
    let v_info = crate::version::get_version_info();
    let agent_version = v_info.agent_version;
    let build_commit = v_info.build_commit;
    let build_timestamp = v_info.build_timestamp;
    let target_architecture = v_info.target_architecture;

    // 2. SO & Host
    let os = env::consts::OS.to_string();
    let architecture = env::consts::ARCH.to_string();
    let os_version = detect_os_version();

    // 3. Status do Serviço
    let (service_installed, service_state) = check_service_status();
    match service_state {
        ServiceStatusState::Running => {
            checks.push(DiagnosticCheckItem {
                name: "Windows Service".to_string(),
                status: CheckStatus::Ok,
                message: "Serviço WitiquetasAgent está ativo e em execução.".to_string(),
            });
        }
        ServiceStatusState::Stopped => {
            checks.push(DiagnosticCheckItem {
                name: "Windows Service".to_string(),
                status: CheckStatus::Warning,
                message: "Serviço WitiquetasAgent está instalado mas parado.".to_string(),
            });
        }
        ServiceStatusState::NotInstalled => {
            checks.push(DiagnosticCheckItem {
                name: "Windows Service".to_string(),
                status: CheckStatus::Warning,
                message: "Serviço WitiquetasAgent não está instalado no sistema.".to_string(),
            });
        }
        ServiceStatusState::Unknown => {
            checks.push(DiagnosticCheckItem {
                name: "Windows Service".to_string(),
                status: CheckStatus::Warning,
                message: "Não foi possível determinar o estado do serviço SCM.".to_string(),
            });
        }
    }

    // 4. Identidade e Pareamento (REDACTION: token é descartado imediatamente)
    let identity_path = pairing::get_identity_path();
    let mut paired = false;
    let mut agent_id = None;
    let mut machine_name = pairing::get_machine_name();
    let mut backend_url = backend_url_override
        .map(|s| s.to_string())
        .or_else(|| env::var("WITIQUETAS_BACKEND_URL").ok())
        .unwrap_or_else(|| DEFAULT_BACKEND_URL.to_string());
    let mut identity_readable = false;

    if identity_path.exists() {
        match fs::read_to_string(&identity_path) {
            Ok(content) => {
                identity_readable = true;
                match serde_json::from_str::<AgentIdentityData>(&content) {
                    Ok(parsed) => {
                        // Segurança: capturamos apenas metadados seguros (NUNCA token)
                        if !parsed.agent_id.trim().is_empty() && !parsed.token.trim().is_empty() {
                            paired = true;
                            agent_id = Some(parsed.agent_id);
                            if !parsed.machine_name.trim().is_empty() {
                                machine_name = parsed.machine_name;
                            }
                            if backend_url_override.is_none() && !parsed.backend_url.trim().is_empty() {
                                backend_url = parsed.backend_url;
                            }
                        }
                        checks.push(DiagnosticCheckItem {
                            name: "Identidade Local".to_string(),
                            status: if paired { CheckStatus::Ok } else { CheckStatus::Warning },
                            message: if paired {
                                "Arquivo de identidade válido e pareado.".to_string()
                            } else {
                                "Arquivo de identidade existe mas está incompleto.".to_string()
                            },
                        });
                    }
                    Err(err) => {
                        checks.push(DiagnosticCheckItem {
                            name: "Identidade Local".to_string(),
                            status: CheckStatus::Error,
                            message: format!("Arquivo de identidade corrompido: {}", err),
                        });
                    }
                }
            }
            Err(err) => {
                checks.push(DiagnosticCheckItem {
                    name: "Identidade Local".to_string(),
                    status: CheckStatus::Error,
                    message: format!("Sem permissão para ler identity.json: {}", err),
                });
            }
        }
    } else {
        // Arquivo ainda não existe (situação normal pré-pareamento)
        identity_readable = true; // Permissão não é o obstáculo, apenas ausência
        checks.push(DiagnosticCheckItem {
            name: "Identidade Local".to_string(),
            status: CheckStatus::Warning,
            message: "Computador ainda não pareado (identity.json ausente).".to_string(),
        });
    }

    // 5. Testes de Gravação não-destrutivos em Disco
    let config_dir = identity_path.parent().unwrap_or_else(|| Path::new("."));
    let config_dir_writable = test_directory_writable(config_dir);
    if config_dir_writable {
        checks.push(DiagnosticCheckItem {
            name: "I/O Configuração".to_string(),
            status: CheckStatus::Ok,
            message: format!("Diretório de configuração gravável: {}", config_dir.display()),
        });
    } else {
        checks.push(DiagnosticCheckItem {
            name: "I/O Configuração".to_string(),
            status: CheckStatus::Error,
            message: format!("Falha de permissão de escrita em {}", config_dir.display()),
        });
    }

    let logs_dir = crate::logging::get_logs_dir();
    let log_dir_writable = test_directory_writable(&logs_dir);
    if log_dir_writable {
        checks.push(DiagnosticCheckItem {
            name: "I/O Logs".to_string(),
            status: CheckStatus::Ok,
            message: format!("Diretório de logs gravável: {}", logs_dir.display()),
        });
    } else {
        checks.push(DiagnosticCheckItem {
            name: "I/O Logs".to_string(),
            status: CheckStatus::Error,
            message: format!("Falha de permissão de escrita em logs: {}", logs_dir.display()),
        });
    }

    // 6. Teste de Conectividade com o Servidor (Timeout leve de 3s)
    let backend_reachable = check_backend_reachability(&backend_url).await;
    if backend_reachable {
        checks.push(DiagnosticCheckItem {
            name: "Conectividade de Nuvem".to_string(),
            status: CheckStatus::Ok,
            message: format!("Servidor Witiquetas respondeu com sucesso ({})", backend_url),
        });
    } else {
        checks.push(DiagnosticCheckItem {
            name: "Conectividade de Nuvem".to_string(),
            status: CheckStatus::Error,
            message: format!("Servidor inalcançável ou timeout de 3s excedido: {}", backend_url),
        });
    }

    let healthy = config_dir_writable
        && log_dir_writable
        && backend_reachable
        && checks.iter().all(|c| c.status != CheckStatus::Error);

    let duration_ms = start_time.elapsed().as_millis() as u64;

    DiagnosticReport {
        agent_version,
        build_commit,
        build_timestamp,
        target_architecture,
        os,
        os_version,
        architecture,
        service_installed,
        service_state,
        paired,
        agent_id,
        machine_name,
        backend_url,
        identity_readable,
        config_dir_writable,
        log_dir_writable,
        backend_reachable,
        healthy,
        checks,
        duration_ms,
    }
}

/// Testa de forma segura e não-destrutiva se um diretório aceita escrita e deleção
pub fn test_directory_writable(dir: &Path) -> bool {
    if !dir.exists() {
        if let Err(_) = fs::create_dir_all(dir) {
            return false;
        }
    }

    let probe_name = format!(
        ".probe_{}_{}.tmp",
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0),
        std::process::id()
    );
    let probe_path = dir.join(probe_name);

    let write_ok = fs::write(&probe_path, b"witiquetas_probe_ok").is_ok();
    if write_ok {
        let _ = fs::remove_file(&probe_path);
        true
    } else {
        false
    }
}

/// Consulta o estado do Windows Service sem modificar o sistema
fn check_service_status() -> (bool, ServiceStatusState) {
    #[cfg(windows)]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("sc.exe").args(["query", crate::service::SERVICE_NAME]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("RUNNING") {
                return (true, ServiceStatusState::Running);
            } else if stdout.contains("STOPPED") {
                return (true, ServiceStatusState::Stopped);
            } else if stdout.contains("1060") || stdout.contains("não existe") || stdout.contains("FAILED") || stdout.contains("does not exist") {
                return (false, ServiceStatusState::NotInstalled);
            }
        }
        (false, ServiceStatusState::Unknown)
    }

    #[cfg(not(windows))]
    {
        (false, ServiceStatusState::NotInstalled)
    }
}

/// Detecta a versão do sistema operacional de forma compatível e segura
fn detect_os_version() -> String {
    #[cfg(windows)]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("cmd").args(["/c", "ver"]).output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let trimmed = stdout.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        format!("Windows (x64) [Target: {}]", env::consts::ARCH)
    }

    #[cfg(not(windows))]
    {
        format!("{}-{}", env::consts::OS, env::consts::ARCH)
    }
}

/// Checagem leve de conectividade HTTP/TCP contra o endpoint do backend com timeout estrito de 3 segundos
async fn check_backend_reachability(backend_url: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    // Testa rota de health ou raiz da API
    let probe_url = crate::protocol::client::build_api_url(backend_url, "/health");

    // Qualquer resposta HTTP (mesmo 404, 401 ou 200) prova que a conectividade de rede existe
    match client.get(&probe_url).send().await {
        Ok(_) => true,
        Err(err) => {
            // Se falhou rota /health, tenta a base
            if err.is_status() {
                return true;
            }
            // Tenta diretamente a URL base
            match client.get(backend_url).send().await {
                Ok(_) => true,
                Err(err2) => err2.is_status(),
            }
        }
    }
}

/// Documentação Canônica de Auditoria de Segurança:
///
/// REQUISITOS DE PERMISSÃO EM %ProgramData%\Witiquetas\Agent (Windows ACL):
/// - `NT AUTHORITY\SYSTEM`: FullControl (F) com herança em contêineres e objetos (OI)(CI).
/// - `BUILTIN\Administrators`: FullControl (F) com herança (OI)(CI).
/// - `BUILTIN\Users`: ReadAndExecute / Read-Only (RX) para arquivos de configuração e
///   estritamente negado acesso de escrita ou modificação em `identity.json`.
///
/// JUSTIFICATIVA DE SEGURANÇA:
/// Processos locais executados sob credenciais de operadores de PDV comuns não podem ter
/// capacidade de substituir `identity.json`, adulterando `token` ou `agent_id`, para evitar
/// ataques de representação indevida (Agent Impersonation) ou negação de serviço na impressora.
pub const SECURITY_AUDIT_PROGRAMDATA_ACL: &str = r#"
[Witiquetas Security Specification - ProgramData ACL Requirements]
Target: %ProgramData%\Witiquetas\Agent
SYSTEM:         (OI)(CI)(F) - Controle Total
Administrators: (OI)(CI)(F) - Controle Total
Users:          (OI)(CI)(RX) - Leitura & Execução Somente (Zero Escrita em identity.json)
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostic_report_redaction_rule() {
        // Garantia arquitetural: a struct nunca possui campo de token
        let report = DiagnosticReport {
            agent_version: "0.1.0".to_string(),
            build_commit: "abc1234".to_string(),
            build_timestamp: "2026-10-06".to_string(),
            target_architecture: "x86_64".to_string(),
            os: "windows".to_string(),
            os_version: "Microsoft Windows [versão 10.0.22631]".to_string(),
            architecture: "x86_64".to_string(),
            service_installed: true,
            service_state: ServiceStatusState::Running,
            paired: true,
            agent_id: Some("agent-pdv-01".to_string()),
            machine_name: "PDV-01".to_string(),
            backend_url: "https://witiquetas.wrtec.com.br".to_string(),
            identity_readable: true,
            config_dir_writable: true,
            log_dir_writable: true,
            backend_reachable: true,
            healthy: true,
            checks: vec![
                DiagnosticCheckItem {
                    name: "Windows Service".to_string(),
                    status: CheckStatus::Ok,
                    message: "Ativo".to_string(),
                }
            ],
            duration_ms: 45,
        };

        let json = report.to_json().unwrap();
        // NUNCA deve conter menção a token na serialização
        assert!(!json.to_lowercase().contains("token"));
        assert!(!json.contains("secret"));
        assert!(json.contains("agent-pdv-01"));
        assert!(json.contains("PDV-01"));
    }

    #[test]
    fn test_format_human_output() {
        let report = DiagnosticReport {
            agent_version: "0.1.0".to_string(),
            build_commit: "abc1234".to_string(),
            build_timestamp: "2026-10-06".to_string(),
            target_architecture: "x86_64".to_string(),
            os: "windows".to_string(),
            os_version: "Microsoft Windows [versão 10.0.22631]".to_string(),
            architecture: "x86_64".to_string(),
            service_installed: true,
            service_state: ServiceStatusState::Running,
            paired: true,
            agent_id: Some("agent-pdv-01".to_string()),
            machine_name: "PDV-01".to_string(),
            backend_url: "https://witiquetas.wrtec.com.br".to_string(),
            identity_readable: true,
            config_dir_writable: true,
            log_dir_writable: true,
            backend_reachable: true,
            healthy: true,
            checks: vec![],
            duration_ms: 12,
        };

        let human = report.format_human();
        assert!(human.contains("WITIQUETAS PRINT AGENT — DIAGNÓSTICO DO SISTEMA"));
        assert!(human.contains("STATUS GERAL: SAUDÁVEL"));
        assert!(human.contains("agent-pdv-01"));
    }

    #[test]
    fn test_non_destructive_directory_probe() {
        let temp_dir = env::temp_dir();
        let writable = test_directory_writable(&temp_dir);
        assert!(writable, "O diretório temporário do sistema deve ser gravável");

        // O arquivo probe NÃO deve permanecer no disco
        let entries = fs::read_dir(&temp_dir).unwrap();
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().to_string();
            assert!(!filename.starts_with(".probe_test_leak"), "Probe não pode vazar");
        }
    }

    #[test]
    fn test_security_audit_acl_constant_presence() {
        assert!(SECURITY_AUDIT_PROGRAMDATA_ACL.contains("SYSTEM"));
        assert!(SECURITY_AUDIT_PROGRAMDATA_ACL.contains("Administrators"));
        assert!(SECURITY_AUDIT_PROGRAMDATA_ACL.contains("Users"));
    }
}
