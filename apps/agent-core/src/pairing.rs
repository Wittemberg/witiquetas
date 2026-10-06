//! Módulo de Pareamento e Identidade do Witiquetas Agent
//!
//! Este módulo separa rigorosamente a lógica pura de negócio do pareamento
//! de qualquer interação de console/terminal:
//! - `execute_pairing(request)`: Executa handshake de rede e salva credenciais (sem stdin/stdout)
//! - `unpair()`: Remove a identidade local de forma segura e não-destrutiva
//! - `normalize_pairing_code(raw)`: Valida e formata códigos (tolerante a minúsculas, hífens e espaços)
//! - `run_interactive_pairing(...)`: Adapter de console legado para uso exclusivo em terminal humano

use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;
use thiserror::Error;

pub const DEFAULT_BACKEND_URL: &str = "https://witiquetas.wrtec.com.br";
pub const CURRENT_CONFIG_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum PairingError {
    #[error("Código de pareamento inválido: {0}")]
    InvalidCode(String),

    #[error("O código de pareamento expirou. Gere um novo código no painel.")]
    ExpiredCode,

    #[error("Este código de pareamento já foi utilizado por outro Agent.")]
    AlreadyUsed,

    #[error("Muitas tentativas de pareamento. Aguarde alguns instantes.")]
    RateLimited,

    #[error("Falha de autenticação/pareamento: {0}")]
    ServerRejected(String),

    #[error("Erro de rede ao conectar no servidor: {0}")]
    Network(String),

    #[error("Erro de I/O no sistema de arquivos: {0}")]
    Io(#[from] io::Error),

    #[error("Erro de serialização JSON: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Nenhuma identidade local encontrada")]
    IdentityNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingRequest {
    pub pairing_code: String,
    pub backend_url: Option<String>,
    pub machine_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpairResult {
    pub removed: bool,
    pub path: String,
    pub agent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentIdentityData {
    pub config_version: u32,
    pub agent_id: String,
    pub installation_id: String,
    pub token: String,
    pub backend_url: String,
    #[serde(default)]
    pub company_id: Option<String>,
    #[serde(default)]
    pub machine_name: String,
    #[serde(default)]
    pub paired_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PairAgentRequest {
    pairing_code: String,
    machine_name: String,
    os: String,
    os_version: String,
    architecture: String,
    agent_version: String,
    protocol_version: u32,
    installation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct PairAgentResponse {
    success: bool,
    agent_id: String,
    installation_id: String,
    token: String,
    company_id: Option<String>,
    company_name: Option<String>,
    server_time: Option<String>,
    error: Option<String>,
}

/// Normaliza e valida código de pareamento no padrão WIT-XXXX-XXXX
/// Aceita: minúsculas, maiúsculas, com ou sem 'WIT-', com ou sem hífens/espaços
pub fn normalize_pairing_code(raw: &str) -> Result<String, PairingError> {
    let clean: String = raw
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();

    let core = if clean.starts_with("WIT") && clean.len() >= 11 {
        &clean[3..]
    } else {
        &clean[..]
    };

    if core.len() != 8 {
        return Err(PairingError::InvalidCode(format!(
            "O código deve conter 8 caracteres alfanuméricos (recebido: '{}')",
            raw.trim()
        )));
    }

    Ok(format!("WIT-{}-{}", &core[0..4], &core[4..8]))
}

/// Retorna o caminho canônico de persistência da identidade do Agent
pub fn get_identity_path() -> PathBuf {
    if let Ok(custom_path) = env::var("WITIQUETAS_CONFIG_PATH") {
        return PathBuf::from(custom_path);
    }

    #[cfg(target_os = "windows")]
    {
        let program_data = env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let dir = PathBuf::from(program_data).join("Witiquetas").join("Agent");
        let _ = fs::create_dir_all(&dir);
        return dir.join("identity.json");
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = env::var("HOME") {
            let dir = PathBuf::from(home).join(".config").join("witiquetas").join("agent");
            let _ = fs::create_dir_all(&dir);
            return dir.join("identity.json");
        }
        PathBuf::from("witiquetas-agent-identity.json")
    }
}

/// Carrega a identidade do Agent se o arquivo existir
pub fn load_identity() -> Result<Option<AgentIdentityData>, PairingError> {
    let path = get_identity_path();
    if !path.exists() {
        return Ok(None);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(err) => {
            return Err(PairingError::Io(err));
        }
    };

    let identity: AgentIdentityData = match serde_json::from_str(&content) {
        Ok(id) => id,
        Err(err) => {
            return Err(PairingError::Serialization(err));
        }
    };

    Ok(Some(identity))
}

/// Salva a identidade pareada no disco
pub fn save_identity(data: &AgentIdentityData) -> Result<PathBuf, PairingError> {
    let path = get_identity_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let json = serde_json::to_string_pretty(data)?;
    fs::write(&path, json)?;
    Ok(path)
}

/// Detecta o nome da máquina local (hostname)
pub fn get_machine_name() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DESKTOP-AGENT".to_string())
}

/// Lógica Pura: Zero println!, zero stdin.
/// Executa o handshake de pareamento com o servidor Witiquetas e persiste a identidade.
pub async fn execute_pairing(request: PairingRequest) -> Result<AgentIdentityData, PairingError> {
    let normalized_code = normalize_pairing_code(&request.pairing_code)?;
    let backend_url = request
        .backend_url
        .or_else(|| env::var("WITIQUETAS_BACKEND_URL").ok())
        .unwrap_or_else(|| DEFAULT_BACKEND_URL.to_string());

    let machine_name = request.machine_name.unwrap_or_else(get_machine_name);
    let os = env::consts::OS.to_string();
    let architecture = env::consts::ARCH.to_string();
    let agent_version = crate::config::CURRENT_AGENT_VERSION.to_string();

    let now_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let installation_id = format!("inst-{}-{:x}", now_millis, rand_u64());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| PairingError::Network(e.to_string()))?;

    let pair_endpoint = crate::protocol::client::build_api_url(&backend_url, "/agents/pair");

    let request_body = PairAgentRequest {
        pairing_code: normalized_code,
        machine_name: machine_name.clone(),
        os: os.clone(),
        os_version: format!("{}-{}", os, architecture),
        architecture,
        agent_version,
        protocol_version: 1,
        installation_id: installation_id.clone(),
    };

    let response = client
        .post(&pair_endpoint)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| PairingError::Network(e.to_string()))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| PairingError::Network(e.to_string()))?;

    if !status.is_success() {
        if status.as_u16() == 400 || status.as_u16() == 404 {
            if body_text.contains("expirado") {
                return Err(PairingError::ExpiredCode);
            }
            return Err(PairingError::InvalidCode("Código não encontrado ou inválido no servidor.".into()));
        } else if status.as_u16() == 409 {
            return Err(PairingError::AlreadyUsed);
        } else if status.as_u16() == 429 {
            return Err(PairingError::RateLimited);
        }
        return Err(PairingError::ServerRejected(format!("HTTP {}: {}", status.as_u16(), body_text)));
    }

    let parsed: PairAgentResponse = serde_json::from_str(&body_text)?;

    let identity = AgentIdentityData {
        config_version: CURRENT_CONFIG_VERSION,
        agent_id: parsed.agent_id,
        installation_id: parsed.installation_id,
        token: parsed.token,
        backend_url,
        company_id: parsed.company_id,
        machine_name,
        paired_at: parsed.server_time.unwrap_or_else(|| "agora".to_string()),
    };

    save_identity(&identity)?;
    Ok(identity)
}

/// Remove com segurança o arquivo de identidade local (unpair)
pub fn unpair() -> Result<UnpairResult, PairingError> {
    let path = get_identity_path();
    if !path.exists() {
        return Ok(UnpairResult {
            removed: false,
            path: path.display().to_string(),
            agent_id: None,
        });
    }

    let agent_id = load_identity().ok().flatten().map(|id| id.agent_id);
    fs::remove_file(&path)?;

    Ok(UnpairResult {
        removed: true,
        path: path.display().to_string(),
        agent_id,
    })
}

/// Adaptador Interativo para Terminal Humano (CLI legado)
pub async fn run_interactive_pairing(
    backend_url_override: Option<String>,
    code_override: Option<String>,
) -> Result<AgentIdentityData, Box<dyn std::error::Error>> {
    let agent_version = crate::config::CURRENT_AGENT_VERSION.to_string();

    let pairing_code = if let Some(code) = code_override {
        code
    } else {
        println!("--------------------------------------------------");
        println!(" Witiquetas Agent de Impressão (v{})", agent_version);
        println!("--------------------------------------------------");
        println!();
        println!(" Este computador ainda não está conectado.");
        println!(" Acesse o Witiquetas no navegador, clique em 'Conectar Agent'");
        println!(" e digite o código de pareamento abaixo.");
        println!();
        print!(" Código de pareamento (ex: WIT-7K4P-92MX): ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let trimmed = input.trim().to_string();
        if trimmed.is_empty() {
            return Err("Código de pareamento não fornecido.".into());
        }
        trimmed
    };

    println!();
    println!(" Conectando ao servidor...");

    let request = PairingRequest {
        pairing_code,
        backend_url: backend_url_override,
        machine_name: None,
    };

    match execute_pairing(request).await {
        Ok(identity) => {
            let path = get_identity_path();
            println!();
            println!(" ==================================================");
            println!(" [OK] Agent conectado com sucesso!");
            println!(" Computador: {}", identity.machine_name);
            println!(" Configuração salva em: {}", path.display());
            println!(" ==================================================");
            println!();
            Ok(identity)
        }
        Err(err) => {
            eprintln!();
            eprintln!(" [Erro de Pareamento] {}", err);
            Err(Box::new(err))
        }
    }
}

fn rand_u64() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos() as u64;
    nanos ^ 0x5555_AAAA_5555_AAAA
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn test_identity_serialization_roundtrip() {
        let identity = AgentIdentityData {
            config_version: 1,
            agent_id: "agent-test-01".to_string(),
            installation_id: "inst-test-123".to_string(),
            token: "agt_live_secret_token_123456789".to_string(),
            backend_url: "https://witiquetas.wrtec.com.br".to_string(),
            company_id: Some("comp-matriz-01".to_string()),
            machine_name: "ESTOQUE-01".to_string(),
            paired_at: "2026-08-18T12:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&identity).unwrap();
        let deserialized: AgentIdentityData = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.config_version, 1);
        assert_eq!(deserialized.agent_id, "agent-test-01");
        assert_eq!(deserialized.token, "agt_live_secret_token_123456789");
        assert_eq!(deserialized.machine_name, "ESTOQUE-01");
    }

    #[test]
    fn test_machine_name_fallback() {
        let name = get_machine_name();
        assert!(!name.is_empty());
    }

    #[test]
    fn test_identity_default_path_valid() {
        let path = get_identity_path();
        assert!(path.to_string_lossy().contains("identity.json") || path.to_string_lossy().contains("witiquetas"));
    }

    #[test]
    fn test_normalize_valid_codes() {
        assert_eq!(normalize_pairing_code("WIT-7K4P-92MX").unwrap(), "WIT-7K4P-92MX");
        assert_eq!(normalize_pairing_code("wit-7k4p-92mx").unwrap(), "WIT-7K4P-92MX");
        assert_eq!(normalize_pairing_code("7k4p92mx").unwrap(), "WIT-7K4P-92MX");
        assert_eq!(normalize_pairing_code("WIT7K4P92MX").unwrap(), "WIT-7K4P-92MX");
        assert_eq!(normalize_pairing_code(" 7k4p-92mx ").unwrap(), "WIT-7K4P-92MX");
    }

    #[test]
    fn test_normalize_invalid_codes() {
        assert!(normalize_pairing_code("").is_err());
        assert!(normalize_pairing_code("WIT-123").is_err());
        assert!(normalize_pairing_code("WIT-TOOLONGCODE123").is_err());
        assert!(normalize_pairing_code("WIT-7K4P-92M!").is_err());
    }
}
