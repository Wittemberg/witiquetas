use crate::config::AgentConfig;
use crate::protocol::dto::{
    AgentHeartbeatRequestDTO, AgentHeartbeatResponseDTO, PendingJobsResponseDTO, PrintJobItemDTO,
    UpdatePrintJobStatusRequestDTO, UpdatePrintJobStatusResponseDTO,
};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use reqwest::Client;
use std::time::Duration;
use thiserror::Error;

/// Constrói URLs canônicas da API pública do Witiquetas garantindo prefixo /api sem duplicações
pub fn build_api_url(backend_url: &str, endpoint_path: &str) -> String {
    let mut base = backend_url.trim().trim_end_matches('/');

    // Se a base já terminar com /api, normaliza para evitar /api/api
    if base.ends_with("/api") {
        base = base[..base.len() - 4].trim_end_matches('/');
    }

    let mut path = endpoint_path.trim().trim_start_matches('/');
    // Se o path fornecido já começar com api/, remove para normalizar
    if path.starts_with("api/") {
        path = path[4..].trim_start_matches('/');
    }

    format!("{}/api/{}", base, path)
}

#[derive(Error, Debug)]
pub enum ClientError {
    #[error("Token com caracteres inválidos para header HTTP")]
    InvalidTokenHeader,
    #[error("Erro de comunicação HTTP com o backend: {0}")]
    ReqwestError(#[from] reqwest::Error),
    #[error("Servidor retornou erro HTTP {status}: {message}")]
    ApiError { status: u16, message: String },
    #[error("Falha ao desserializar JSON de resposta: {0}")]
    JsonError(#[from] serde_json::Error),
}

impl ClientError {
    /// Determina se o erro é de autenticação/autorização (HTTP 401 ou 403)
    pub fn is_auth_error(&self) -> bool {
        matches!(self, ClientError::ApiError { status, .. } if *status == 401 || *status == 403)
    }

    /// Determina se o erro é de configuração ou incompatibilidade de rota/protocolo (HTTP 404 ou 405)
    pub fn is_protocol_or_config_error(&self) -> bool {
        matches!(self, ClientError::ApiError { status, .. } if *status == 404 || *status == 405)
    }

    /// Determina se o erro é transitório de rede (DNS, timeout, conexão recusada, erro 5xx do servidor)
    pub fn is_transient_network_error(&self) -> bool {
        match self {
            ClientError::ReqwestError(err) => {
                err.is_timeout() || err.is_connect() || err.is_request()
            }
            ClientError::ApiError { status, .. } => *status >= 500,
            _ => false,
        }
    }
}

#[derive(Clone)]
pub struct AgentClient {
    client: Client,
    backend_url: String,
    agent_id: String,
    agent_version: String,
}

impl AgentClient {
    pub fn new(config: &AgentConfig) -> Result<Self, ClientError> {
        let mut headers = HeaderMap::new();

        let auth_val = format!("Bearer {}", config.token.trim());
        let mut auth_header_val = HeaderValue::from_str(&auth_val)
            .map_err(|_| ClientError::InvalidTokenHeader)?;
        auth_header_val.set_sensitive(true);
        headers.insert(AUTHORIZATION, auth_header_val);

        let user_agent = format!("Witiquetas-Agent/{}", config.agent_version);
        headers.insert(
            USER_AGENT,
            HeaderValue::from_str(&user_agent)
                .unwrap_or(HeaderValue::from_static("Witiquetas-Agent")),
        );

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()?;

        let backend_url = config.backend_url.trim().to_string();

        Ok(Self {
            client,
            backend_url,
            agent_id: config.agent_id.clone(),
            agent_version: config.agent_version.clone(),
        })
    }

    /// Executa heartbeat periódico no backend utilizando rota canônica pública /api/agents/heartbeat
    pub async fn heartbeat(&self, status: Option<&str>) -> Result<AgentHeartbeatResponseDTO, ClientError> {
        let url = build_api_url(&self.backend_url, "/agents/heartbeat");
        let body = AgentHeartbeatRequestDTO {
            agent_id: Some(self.agent_id.clone()),
            status: status.map(|s| s.to_string()),
            agent_version: Some(self.agent_version.clone()),
        };

        let response = self.client.post(&url).json(&body).send().await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let text = response.text().await.unwrap_or_default();
            return Err(ClientError::ApiError {
                status,
                message: text,
            });
        }

        let dto = response.json::<AgentHeartbeatResponseDTO>().await?;
        Ok(dto)
    }

    /// Realiza o claim de jobs pendentes utilizando rota canônica pública /api/print-jobs/pending
    pub async fn fetch_pending_jobs(&self) -> Result<Vec<PrintJobItemDTO>, ClientError> {
        let url = build_api_url(&self.backend_url, "/print-jobs/pending");
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let text = response.text().await.unwrap_or_default();
            return Err(ClientError::ApiError {
                status,
                message: text,
            });
        }

        let dto = response.json::<PendingJobsResponseDTO>().await?;
        Ok(dto.jobs)
    }

    /// Atualiza o status de entrega/execução de um print job utilizando rota canônica pública /api/print-jobs/:id/status
    pub async fn update_job_status(
        &self,
        job_id: &str,
        request: &UpdatePrintJobStatusRequestDTO,
    ) -> Result<UpdatePrintJobStatusResponseDTO, ClientError> {
        let url = build_api_url(&self.backend_url, &format!("/print-jobs/{}/status", job_id));
        let response = self.client.patch(&url).json(request).send().await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let text = response.text().await.unwrap_or_default();
            return Err(ClientError::ApiError {
                status,
                message: text,
            });
        }

        let dto = response.json::<UpdatePrintJobStatusResponseDTO>().await?;
        Ok(dto)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_api_url_standard() {
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br", "/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
    }

    #[test]
    fn test_build_api_url_trailing_slash() {
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br/", "/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
    }

    #[test]
    fn test_build_api_url_already_contains_api() {
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br/api", "/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br/api/", "/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
    }

    #[test]
    fn test_build_api_url_path_with_api() {
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br", "/api/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br/api", "/api/agents/heartbeat"),
            "https://witiquetas.wrtec.com.br/api/agents/heartbeat"
        );
    }

    #[test]
    fn test_build_api_url_pending_and_status() {
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br", "/print-jobs/pending"),
            "https://witiquetas.wrtec.com.br/api/print-jobs/pending"
        );
        assert_eq!(
            build_api_url("https://witiquetas.wrtec.com.br", "/print-jobs/job-01/status"),
            "https://witiquetas.wrtec.com.br/api/print-jobs/job-01/status"
        );
    }

    #[test]
    fn test_client_error_classification() {
        let auth_err = ClientError::ApiError {
            status: 401,
            message: "Unauthorized".to_string(),
        };
        assert!(auth_err.is_auth_error());
        assert!(!auth_err.is_protocol_or_config_error());
        assert!(!auth_err.is_transient_network_error());

        let proto_err_405 = ClientError::ApiError {
            status: 405,
            message: "Method Not Allowed".to_string(),
        };
        assert!(proto_err_405.is_protocol_or_config_error());
        assert!(!proto_err_405.is_transient_network_error());

        let proto_err_404 = ClientError::ApiError {
            status: 404,
            message: "Not Found".to_string(),
        };
        assert!(proto_err_404.is_protocol_or_config_error());
        assert!(!proto_err_404.is_transient_network_error());

        let server_500 = ClientError::ApiError {
            status: 500,
            message: "Internal Server Error".to_string(),
        };
        assert!(server_500.is_transient_network_error());
        assert!(!server_500.is_protocol_or_config_error());
    }
}
