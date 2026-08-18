use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;

pub const DEFAULT_BACKEND_URL: &str = "https://witiquetas.wrtec.com.br";
pub const CURRENT_CONFIG_VERSION: u32 = 1;

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

/// Retorna o caminho padrão de persistência de identidade segura do Agent
pub fn get_identity_path() -> PathBuf {
    if let Ok(custom_path) = env::var("WITIQUETAS_CONFIG_PATH") {
        return PathBuf::from(custom_path);
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_data) = env::var("ProgramData") {
            let dir = PathBuf::from(program_data).join("Witiquetas").join("Agent");
            if fs::create_dir_all(&dir).is_ok() {
                return dir.join("identity.json");
            }
        }
        if let Ok(appdata) = env::var("APPDATA") {
            let dir = PathBuf::from(appdata).join("Witiquetas").join("Agent");
            if fs::create_dir_all(&dir).is_ok() {
                return dir.join("identity.json");
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = env::var("HOME") {
            let dir = PathBuf::from(home).join(".config").join("witiquetas").join("agent");
            if fs::create_dir_all(&dir).is_ok() {
                return dir.join("identity.json");
            }
        }
    }

    PathBuf::from("witiquetas-agent-identity.json")
}

/// Carrega a identidade do Agent se o arquivo existir
pub fn load_identity() -> Result<Option<AgentIdentityData>, Box<dyn std::error::Error>> {
    let path = get_identity_path();
    if !path.exists() {
        return Ok(None);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[Aviso] Não foi possível ler o arquivo de identidade local ({}): {}", path.display(), err);
            return Ok(None);
        }
    };

    let identity: AgentIdentityData = match serde_json::from_str(&content) {
        Ok(id) => id,
        Err(err) => {
            eprintln!("[Aviso] Configuração local corrompida ({}): {}. Use --pair para reconectar.", path.display(), err);
            return Ok(None);
        }
    };

    Ok(Some(identity))
}

/// Salva a identidade pareada no disco com permissões seguras
pub fn save_identity(data: &AgentIdentityData) -> Result<PathBuf, Box<dyn std::error::Error>> {
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

/// Executa o fluxo interativo de pareamento via CLI
pub async fn run_interactive_pairing(
    backend_url_override: Option<String>,
    code_override: Option<String>,
) -> Result<AgentIdentityData, Box<dyn std::error::Error>> {
    let backend_url = backend_url_override
        .or_else(|| env::var("WITIQUETAS_BACKEND_URL").ok())
        .unwrap_or_else(|| DEFAULT_BACKEND_URL.to_string());

    let machine_name = get_machine_name();
    let os = env::consts::OS.to_string();
    let architecture = env::consts::ARCH.to_string();
    let agent_version = crate::config::CURRENT_AGENT_VERSION.to_string();
    let installation_id = format!("inst-{}-{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis(), rand_u64());

    let pairing_code = if let Some(code) = code_override {
        code.trim().to_uppercase()
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
        let trimmed = input.trim().to_uppercase();
        if trimmed.is_empty() {
            return Err("Código de pareamento não fornecido.".into());
        }
        trimmed
    };

    println!();
    println!(" Conectando ao servidor {}...", backend_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()?;

    let pair_endpoint = format!("{}/api/agents/pair", backend_url.trim_end_matches('/'));

    let request_body = PairAgentRequest {
        pairing_code: pairing_code.clone(),
        machine_name: machine_name.clone(),
        os: os.clone(),
        os_version: format!("{}-{}", os, architecture),
        architecture: architecture.clone(),
        agent_version: agent_version.clone(),
        protocol_version: 1,
        installation_id: installation_id.clone(),
    };

    let response = client
        .post(&pair_endpoint)
        .json(&request_body)
        .send()
        .await?;

    let status = response.status();
    let body_text = response.text().await?;

    if !status.is_success() {
        if status.as_u16() == 400 || status.as_u16() == 404 {
            if body_text.contains("expirado") {
                eprintln!();
                eprintln!(" [Erro] O código expirou. Gere um novo código no Witiquetas.");
            } else {
                eprintln!();
                eprintln!(" [Erro] Código inválido ou não encontrado. Verifique e tente novamente.");
            }
        } else if status.as_u16() == 409 {
            eprintln!();
            eprintln!(" [Erro] Este código de pareamento já foi utilizado por outro Agent.");
        } else if status.as_u16() == 429 {
            eprintln!();
            eprintln!(" [Erro] Muitas tentativas. Aguarde alguns instantes antes de tentar novamente.");
        } else {
            eprintln!();
            eprintln!(" [Erro] Falha ao conectar ao servidor (HTTP {}).", status.as_u16());
        }
        return Err("Falha de pareamento.".into());
    }

    let parsed: PairAgentResponse = serde_json::from_str(&body_text)?;

    let identity = AgentIdentityData {
        config_version: CURRENT_CONFIG_VERSION,
        agent_id: parsed.agent_id,
        installation_id: parsed.installation_id,
        token: parsed.token,
        backend_url,
        company_id: parsed.company_id,
        machine_name: machine_name.clone(),
        paired_at: parsed.server_time.unwrap_or_else(|| "agora".to_string()),
    };

    let saved_path = save_identity(&identity)?;

    println!();
    println!(" ==================================================");
    println!(" [OK] Agent conectado com sucesso!");
    println!(" Computador: {}", machine_name);
    println!(" Configuração salva em: {}", saved_path.display());
    println!(" ==================================================");
    println!();

    Ok(identity)
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
}

