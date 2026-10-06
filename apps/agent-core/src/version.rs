use serde::{Deserialize, Serialize};

/// Informações de versão e metadados de compilação do Witiquetas Agent Core.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentVersionInfo {
    /// Versão semântica definida no Cargo.toml (CARGO_PKG_VERSION)
    pub agent_version: String,
    /// Git commit SHA gerado em tempo de compilação ou fallback 'unknown'
    pub build_commit: String,
    /// Timestamp UTC da compilação em formato ISO 8601 (ex: 2026-10-06T18:50:40Z)
    pub build_timestamp: String,
    /// Arquitetura alvo da compilação (ex: x86_64-pc-windows-msvc)
    pub target_architecture: String,
}

impl AgentVersionInfo {
    /// Obtém as informações de versão injetadas em tempo de compilação pelo build script.
    pub fn get_version_info() -> Self {
        Self {
            agent_version: env!("CARGO_PKG_VERSION").to_string(),
            build_commit: option_env!("WITIQUETAS_BUILD_COMMIT")
                .unwrap_or("unknown")
                .to_string(),
            build_timestamp: option_env!("WITIQUETAS_BUILD_TIMESTAMP")
                .unwrap_or("unknown")
                .to_string(),
            target_architecture: option_env!("WITIQUETAS_BUILD_TARGET")
                .unwrap_or("unknown")
                .to_string(),
        }
    }

    /// Serializa as informações de versão para JSON compacto em linha única.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Serializa as informações de versão para JSON formatado (pretty-printed).
    pub fn to_json_pretty(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    /// Formatação amigável para humanos em linha única (adequada para CLI e banners de inicialização).
    pub fn to_human_string(&self) -> String {
        let short_commit = if self.build_commit.len() > 8 {
            &self.build_commit[..8]
        } else {
            &self.build_commit
        };
        format!(
            "witiquetas-agent-core v{} (commit: {}, built: {}, target: {})",
            self.agent_version, short_commit, self.build_timestamp, self.target_architecture
        )
    }

    /// Formatação detalhada multi-linha para diagnósticos de suporte técnico.
    pub fn to_detailed_string(&self) -> String {
        format!(
            "Witiquetas Agent Core v{}\n  Commit:        {}\n  Build Time:    {}\n  Target Arch:   {}",
            self.agent_version, self.build_commit, self.build_timestamp, self.target_architecture
        )
    }
}

impl std::fmt::Display for AgentVersionInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_human_string())
    }
}

/// Função de conveniência no nível do módulo para obtenção direta dos metadados de versão.
pub fn get_version_info() -> AgentVersionInfo {
    AgentVersionInfo::get_version_info()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_version_info_fields_populated() {
        let info = get_version_info();
        assert_eq!(info.agent_version, env!("CARGO_PKG_VERSION"));
        assert!(!info.build_commit.is_empty(), "build_commit não deve ser vazio");
        assert!(!info.build_timestamp.is_empty(), "build_timestamp não deve ser vazio");
        assert!(!info.target_architecture.is_empty(), "target_architecture não deve ser vazio");
    }

    #[test]
    fn test_version_info_serialization_roundtrip() {
        let info = AgentVersionInfo {
            agent_version: "0.1.0".to_string(),
            build_commit: "0e00fcd89491e87ebf58ea7071d3a2148403f292".to_string(),
            build_timestamp: "2026-10-06T18:50:40Z".to_string(),
            target_architecture: "x86_64-pc-windows-msvc".to_string(),
        };

        let json = info.to_json().expect("Falha ao serializar JSON");
        assert!(json.contains("\"agent_version\":\"0.1.0\""));
        assert!(json.contains("\"build_commit\":\"0e00fcd89491e87ebf58ea7071d3a2148403f292\""));
        assert!(json.contains("\"build_timestamp\":\"2026-10-06T18:50:40Z\""));
        assert!(json.contains("\"target_architecture\":\"x86_64-pc-windows-msvc\""));

        let deserialized: AgentVersionInfo = serde_json::from_str(&json).expect("Falha ao desserializar JSON");
        assert_eq!(info, deserialized);
    }

    #[test]
    fn test_version_info_human_string_formatting() {
        let info = AgentVersionInfo {
            agent_version: "0.1.0".to_string(),
            build_commit: "0e00fcd89491e87ebf58ea7071d3a2148403f292".to_string(),
            build_timestamp: "2026-10-06T18:50:40Z".to_string(),
            target_architecture: "x86_64-pc-windows-msvc".to_string(),
        };

        let human = info.to_human_string();
        assert_eq!(
            human,
            "witiquetas-agent-core v0.1.0 (commit: 0e00fcd8, built: 2026-10-06T18:50:40Z, target: x86_64-pc-windows-msvc)"
        );
        assert_eq!(format!("{}", info), human);
    }

    #[test]
    fn test_version_info_short_commit_fallback() {
        let info = AgentVersionInfo {
            agent_version: "0.1.0".to_string(),
            build_commit: "unknown".to_string(),
            build_timestamp: "2026-10-06T18:50:40Z".to_string(),
            target_architecture: "x86_64-pc-windows-msvc".to_string(),
        };

        let human = info.to_human_string();
        assert!(human.contains("commit: unknown"));
    }

    #[test]
    fn test_version_info_pretty_json() {
        let info = AgentVersionInfo {
            agent_version: "0.1.0".to_string(),
            build_commit: "abc12345".to_string(),
            build_timestamp: "2026-10-06T18:50:40Z".to_string(),
            target_architecture: "x86_64-pc-windows-msvc".to_string(),
        };

        let pretty = info.to_json_pretty().expect("Falha ao gerar pretty JSON");
        assert!(pretty.contains('\n'));
        assert!(pretty.contains("  \"agent_version\": \"0.1.0\""));
    }
}
