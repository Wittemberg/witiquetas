//! Padronização de Saída Estruturada e Exit Codes para o Witiquetas Agent Core
//!
//! Este módulo provê a interface canônica para consumo por ferramentas automatizadas,
//! futuras GUIs (Electron/Tauri), assistentes de instalação (Inno Setup / WiX) e scripts corporativos.
//!
//! Quando a flag `--json` é fornecida, NENHUM texto humano ou banner é emitido para stdout.
//! Apenas o envelope padronizado `StructuredResponse<T>` é serializado.

use serde::{Deserialize, Serialize};

/// Versão canônica do schema JSON emitido pelo Agent Core
pub const SCHEMA_VERSION: u32 = 1;

/// Sucesso na operação
pub const EXIT_SUCCESS: i32 = 0;
/// Erro operacional genérico
pub const EXIT_GENERAL_ERROR: i32 = 1;
/// Argumentos de linha de comando inválidos ou ausentes
pub const EXIT_INVALID_ARGS: i32 = 2;
/// Falha de pareamento, código inválido, expirado ou rejeição de credenciais
pub const EXIT_AUTH_PAIRING: i32 = 10;
/// Falha de rede ou timeout ao contatar o servidor Witiquetas
pub const EXIT_NETWORK_ERROR: i32 = 20;
/// Permissão negada (ex: ausência de privilégios de Administrador/root/UAC)
pub const EXIT_PERMISSION_DENIED: i32 = 30;
/// Falha de comunicação com o Service Control Manager (SCM) do Windows
pub const EXIT_SCM_ERROR: i32 = 31;

/// Envelope padrão para respostas serializadas em JSON
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredResponse<T> {
    pub success: bool,
    pub schema_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<StructuredError>,
}

/// Descrição de erro estruturado
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredError {
    pub code: String,
    pub message: String,
    pub exit_code: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl<T: Serialize> StructuredResponse<T> {
    /// Cria uma resposta de sucesso com dados
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            schema_version: SCHEMA_VERSION,
            data: Some(data),
            error: None,
        }
    }

    /// Serializa para JSON formatado e finaliza o processo com o exit code especificado
    pub fn print_and_exit(&self, exit_code: i32) -> ! {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            println!("{}", json);
        } else {
            println!("{{\"success\":false,\"schemaVersion\":1,\"error\":{{\"code\":\"SERIALIZE_ERR\",\"message\":\"Falha na serialização do envelope JSON\",\"exitCode\":1}}}}");
        }
        std::process::exit(exit_code);
    }
}

impl StructuredResponse<()> {
    /// Cria uma resposta de erro estruturada
    pub fn err(code: impl Into<String>, message: impl Into<String>, exit_code: i32) -> Self {
        Self {
            success: false,
            schema_version: SCHEMA_VERSION,
            data: None,
            error: Some(StructuredError {
                code: code.into(),
                message: message.into(),
                exit_code,
                details: None,
            }),
        }
    }

    /// Cria uma resposta de erro estruturada com detalhes adicionais
    pub fn err_with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        exit_code: i32,
        details: serde_json::Value,
    ) -> Self {
        Self {
            success: false,
            schema_version: SCHEMA_VERSION,
            data: None,
            error: Some(StructuredError {
                code: code.into(),
                message: message.into(),
                exit_code,
                details: Some(details),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_structured_response_success_serialization() {
        #[derive(Serialize)]
        struct TestData {
            agent_id: String,
        }

        let resp = StructuredResponse::ok(TestData {
            agent_id: "agent-123".to_string(),
        });
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"schemaVersion\":1"));
        assert!(json.contains("\"agent_id\":\"agent-123\""));
        assert!(!json.contains("\"error\""));
    }

    #[test]
    fn test_structured_response_error_serialization() {
        let resp = StructuredResponse::err("AUTH_FAILED", "Código inválido", EXIT_AUTH_PAIRING);
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("\"schemaVersion\":1"));
        assert!(json.contains("\"code\":\"AUTH_FAILED\""));
        assert!(json.contains("\"exitCode\":10"));
        assert!(!json.contains("\"data\""));
    }
}
