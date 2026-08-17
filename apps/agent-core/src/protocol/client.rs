use crate::config::AgentConfig;
use crate::protocol::dto::{
    AgentHeartbeatRequestDTO, AgentHeartbeatResponseDTO, PendingJobsResponseDTO, PrintJobItemDTO,
    UpdatePrintJobStatusRequestDTO, UpdatePrintJobStatusResponseDTO,
};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use reqwest::Client;
use std::time::Duration;
use thiserror::Error;

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
        headers.insert(USER_AGENT, HeaderValue::from_str(&user_agent).unwrap_or(HeaderValue::from_static("Witiquetas-Agent")));

        let client = Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(config.timeout_secs))
            .build()?;

        let backend_url = config.backend_url.trim_end_matches('/').to_string();

        Ok(Self {
            client,
            backend_url,
            agent_id: config.agent_id.clone(),
            agent_version: config.agent_version.clone(),
        })
    }

    /// Executa heartbeat periódico no backend
    pub async fn heartbeat(&self, status: Option<&str>) -> Result<AgentHeartbeatResponseDTO, ClientError> {
        let url = format!("{}/agents/heartbeat", self.backend_url);
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

    /// Realiza o claim de jobs pendentes associados a este agente
    pub async fn fetch_pending_jobs(&self) -> Result<Vec<PrintJobItemDTO>, ClientError> {
        let url = format!("{}/print-jobs/pending", self.backend_url);
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

    /// Atualiza o status de entrega/execução de um print job
    pub async fn update_job_status(
        &self,
        job_id: &str,
        request: &UpdatePrintJobStatusRequestDTO,
    ) -> Result<UpdatePrintJobStatusResponseDTO, ClientError> {
        let url = format!("{}/print-jobs/{}/status", self.backend_url, job_id);
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
