use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Configuração incompleta: campo '{0}' é obrigatório.")]
    MissingField(String),
    #[error("Falha ao ler arquivo de configuração: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Falha ao desserializar JSON de configuração: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Valor de poll_interval_secs inválido ({0}s). Deve estar entre {1}s e {2}s.")]
    InvalidPollInterval(u64, u64, u64),
}

pub const MIN_POLL_INTERVAL_SECS: u64 = 5;
pub const MAX_POLL_INTERVAL_SECS: u64 = 300;
pub const DEFAULT_POLL_INTERVAL_SECS: u64 = 15;
pub const DEFAULT_TIMEOUT_SECS: u64 = 30;
pub const CURRENT_AGENT_VERSION: &str = "0.1.0";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub backend_url: String,
    pub agent_id: String,
    pub installation_id: String,
    pub token: String,
    #[serde(default = "default_agent_version")]
    pub agent_version: String,
    #[serde(default = "default_machine_name")]
    pub machine_name: String,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_secs: u64,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}

fn default_agent_version() -> String {
    CURRENT_AGENT_VERSION.to_string()
}

fn default_machine_name() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "WIT-LOCAL-AGENT".to_string())
}

fn default_poll_interval() -> u64 {
    DEFAULT_POLL_INTERVAL_SECS
}

fn default_timeout_secs() -> u64 {
    DEFAULT_TIMEOUT_SECS
}

impl AgentConfig {
    /// Carrega configuração combinando arquivo local (se existir) e variáveis de ambiente (prioridade)
    pub fn load_auto() -> Result<Self, ConfigError> {
        // 1. Tentar ler de arquivo se a variável WITIQUETAS_CONFIG_PATH estiver definida ou config.json existir
        let config_path = env::var("WITIQUETAS_CONFIG_PATH").unwrap_or_else(|_| "agent_config.json".to_string());
        let mut config = if Path::new(&config_path).exists() {
            Self::from_file(&config_path)?
        } else {
            Self::default_empty()
        };

        // 2. Sobrescrever com variáveis de ambiente explícitas
        if let Ok(val) = env::var("WITIQUETAS_BACKEND_URL") {
            config.backend_url = val;
        }
        if let Ok(val) = env::var("WITIQUETAS_AGENT_ID") {
            config.agent_id = val;
        }
        if let Ok(val) = env::var("WITIQUETAS_INSTALLATION_ID") {
            config.installation_id = val;
        }
        if let Ok(val) = env::var("WITIQUETAS_AGENT_TOKEN") {
            config.token = val;
        }
        if let Ok(val) = env::var("WITIQUETAS_MACHINE_NAME") {
            config.machine_name = val;
        }
        if let Ok(val) = env::var("WITIQUETAS_POLL_INTERVAL_SECS") {
            if let Ok(parsed) = val.parse::<u64>() {
                config.poll_interval_secs = parsed;
            }
        }
        if let Ok(val) = env::var("WITIQUETAS_TIMEOUT_SECS") {
            if let Ok(parsed) = val.parse::<u64>() {
                config.timeout_secs = parsed;
            }
        }

        config.validate()?;
        Ok(config)
    }

    pub fn from_file<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let content = fs::read_to_string(path)?;
        let config: AgentConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn default_empty() -> Self {
        Self {
            backend_url: String::new(),
            agent_id: String::new(),
            installation_id: String::new(),
            token: String::new(),
            agent_version: default_agent_version(),
            machine_name: default_machine_name(),
            poll_interval_secs: default_poll_interval(),
            timeout_secs: default_timeout_secs(),
        }
    }

    pub fn validate(&self) -> Result<(), ConfigError> {
        if self.backend_url.trim().is_empty() {
            return Err(ConfigError::MissingField("backend_url".to_string()));
        }
        if self.agent_id.trim().is_empty() {
            return Err(ConfigError::MissingField("agent_id".to_string()));
        }
        if self.token.trim().is_empty() {
            return Err(ConfigError::MissingField("token".to_string()));
        }

        if self.poll_interval_secs < MIN_POLL_INTERVAL_SECS || self.poll_interval_secs > MAX_POLL_INTERVAL_SECS {
            return Err(ConfigError::InvalidPollInterval(
                self.poll_interval_secs,
                MIN_POLL_INTERVAL_SECS,
                MAX_POLL_INTERVAL_SECS,
            ));
        }

        Ok(())
    }

    /// Normaliza o poll interval retornado pelo servidor aplicando limites defensivos
    pub fn sanitize_poll_interval(server_interval_secs: u64) -> u64 {
        server_interval_secs.clamp(MIN_POLL_INTERVAL_SECS, MAX_POLL_INTERVAL_SECS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_config_validation() {
        let config = AgentConfig {
            backend_url: "http://localhost:3000".to_string(),
            agent_id: "agent-01".to_string(),
            installation_id: "inst-01".to_string(),
            token: "agt_live_test".to_string(),
            agent_version: "0.1.0".to_string(),
            machine_name: "PDV-01".to_string(),
            poll_interval_secs: 15,
            timeout_secs: 30,
        };

        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_missing_backend_url() {
        let mut config = AgentConfig::default_empty();
        config.agent_id = "agent-01".to_string();
        config.token = "agt_live_test".to_string();

        assert!(matches!(config.validate(), Err(ConfigError::MissingField(f)) if f == "backend_url"));
    }

    #[test]
    fn test_missing_agent_id() {
        let mut config = AgentConfig::default_empty();
        config.backend_url = "http://localhost:3000".to_string();
        config.token = "agt_live_test".to_string();

        assert!(matches!(config.validate(), Err(ConfigError::MissingField(f)) if f == "agent_id"));
    }

    #[test]
    fn test_missing_token() {
        let mut config = AgentConfig::default_empty();
        config.backend_url = "http://localhost:3000".to_string();
        config.agent_id = "agent-01".to_string();

        assert!(matches!(config.validate(), Err(ConfigError::MissingField(f)) if f == "token"));
    }

    #[test]
    fn test_poll_interval_bounds() {
        assert_eq!(AgentConfig::sanitize_poll_interval(0), MIN_POLL_INTERVAL_SECS);
        assert_eq!(AgentConfig::sanitize_poll_interval(2), MIN_POLL_INTERVAL_SECS);
        assert_eq!(AgentConfig::sanitize_poll_interval(45), 45);
        assert_eq!(AgentConfig::sanitize_poll_interval(9999), MAX_POLL_INTERVAL_SECS);
    }
}

