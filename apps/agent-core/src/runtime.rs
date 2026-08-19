use crate::config::AgentConfig;
use crate::identity::AgentIdentity;
use crate::payload::PayloadValidator;
use crate::protocol::client::{AgentClient, ClientError};
use crate::protocol::dto::{PrintJobItemDTO, UpdatePrintJobStatusRequestDTO};
use crate::transport::{PrinterTarget, PrinterTransport, TransportError};
use std::collections::HashSet;
use std::future::Future;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

/// Mensagem de erro amigável destinada ao usuário quando uma impressora não pode ser acessada na rede local
pub const USER_FRIENDLY_PRINTER_UNREACHABLE_MSG: &str =
    "Impressora não encontrada. Verifique se está ligada ou se houve alteração de endereço. Caso o problema persista, solicite ao responsável de TI da sua empresa a verificação da impressora ou da rede local.";

/// Mensagem de erro amigável para configurações inválidas de impressora
pub const USER_FRIENDLY_INVALID_TARGET_MSG: &str =
    "Configuração de impressora inválida ou incompleta. Verifique o cadastro da impressora no Witiquetas.";

/// Mapeia o erro técnico de transporte para uma mensagem amigável para o usuário final,
/// garantindo que termos técnicos como ECONNREFUSED, socket timeout ou host unreachable
/// fiquem restritos aos logs internos de diagnóstico.
pub fn format_user_facing_error(err: &TransportError) -> String {
    match err {
        TransportError::ConnectFailed(_) | TransportError::ConnectTimeout(_) => {
            USER_FRIENDLY_PRINTER_UNREACHABLE_MSG.to_string()
        }
        TransportError::InvalidTarget(_) => USER_FRIENDLY_INVALID_TARGET_MSG.to_string(),
        TransportError::WriteFailedBeforeAnyByte(_) | TransportError::WriteTimeout(_) => {
            "Falha na comunicação durante o envio para a impressora. Verifique o cabo ou conexão de rede da impressora.".to_string()
        }
        TransportError::PartialWrite { .. } => {
            "Transmissão interrompida antes da conclusão da impressão. Verifique a impressora e tente novamente.".to_string()
        }
        TransportError::Generic(_) => USER_FRIENDLY_PRINTER_UNREACHABLE_MSG.to_string(),
    }
}

/// Gerenciador de backoff progressivo com limites definidos
#[derive(Debug, Clone)]
pub struct BackoffManager {
    current_secs: u64,
    min_secs: u64,
    max_secs: u64,
}

impl BackoffManager {
    pub fn new(min_secs: u64, max_secs: u64) -> Self {
        Self {
            current_secs: min_secs,
            min_secs,
            max_secs,
        }
    }

    pub fn current(&self) -> Duration {
        Duration::from_secs(self.current_secs)
    }

    pub fn next(&mut self) -> Duration {
        let dur = self.current();
        // Progressão 2s -> 5s -> 10s -> 20s -> 30s -> max 60s
        self.current_secs = match self.current_secs {
            0..=2 => 5,
            3..=5 => 10,
            6..=10 => 20,
            11..=20 => 30,
            21..=30 => 60,
            _ => self.max_secs,
        }
        .min(self.max_secs);
        dur
    }

    pub fn reset(&mut self) {
        self.current_secs = self.min_secs;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentOperationalState {
    Starting,
    Online,
    Degraded(String),
    AuthRequired,
    Stopped,
}

pub struct AgentRuntime<T: PrinterTransport> {
    pub config: AgentConfig,
    pub identity: AgentIdentity,
    pub client: AgentClient,
    pub transport: T,
    pub processed_attempts: HashSet<String>,
    pub state: AgentOperationalState,
}

impl<T: PrinterTransport + Clone + 'static> AgentRuntime<T> {
    pub fn new(config: AgentConfig, transport: T) -> Result<Self, ClientError> {
        let identity = AgentIdentity::new(
            config.agent_id.clone(),
            config.installation_id.clone(),
            config.machine_name.clone(),
            config.agent_version.clone(),
        );
        let client = AgentClient::new(&config)?;

        Ok(Self {
            config,
            identity,
            client,
            transport,
            processed_attempts: HashSet::new(),
            state: AgentOperationalState::Starting,
        })
    }

    /// Exibe o log de inicialização (Startup Banner) sem expor credenciais/tokens
    pub fn print_startup_banner(&self) {
        info!("========================================================");
        info!(" Witiquetas Agent Core v{} (Headless Print Runtime)", self.identity.agent_version);
        info!("========================================================");
        info!(" Backend URL:    {}", self.config.backend_url);
        info!(" Agent ID:       {}", self.identity.agent_id);
        info!(" Installation:   {}", self.identity.installation_id);
        info!(" Machine Name:   {}", self.identity.machine_name);
        info!(" OS / Arch:      {} / {}", self.identity.os, self.identity.architecture);
        info!(" Poll Interval:  {}s", self.config.poll_interval_secs);
        info!(" Status:         STARTING");
        info!("========================================================");
    }

    /// Executa o ciclo de heartbeat inicial e liveness
    pub async fn initialize(&mut self) -> Result<(), ClientError> {
        self.print_startup_banner();
        let heartbeat_res = self.client.heartbeat(Some("ONLINE")).await?;
        info!(
            server_time = %heartbeat_res.server_time,
            pending_jobs = heartbeat_res.pending_jobs_count,
            "[Agent] Conectado ao Backend com sucesso."
        );

        self.config.poll_interval_secs = AgentConfig::sanitize_poll_interval(heartbeat_res.poll_interval_seconds);
        self.state = AgentOperationalState::Online;
        Ok(())
    }

    /// Processa um único PrintJob respeitando idempotência, gates de status e copy strategy
    pub async fn process_job(&mut self, job: &PrintJobItemDTO) -> Result<bool, ClientError> {
        let attempt_key = format!("{}:{}", job.job_id, job.attempt_id);

        // 0. Verificação de idempotência em memória
        if self.processed_attempts.contains(&attempt_key) {
            info!(
                job_id = %job.job_id,
                attempt_id = %job.attempt_id,
                "[Agent] Idempotência: Job já processado anteriormente. Ignorando claim duplicado."
            );
            return Ok(false);
        }

        // 1. Validação de quantidade de cópias
        if job.copies < 1 {
            let err_msg = format!("Quantidade de cópias inválida ({}). Deve ser no mínimo 1.", job.copies);
            warn!(job_id = %job.job_id, error = %err_msg, "[Agent] Rejeitando job.");

            let _ = self
                .client
                .update_job_status(
                    &job.job_id,
                    &UpdatePrintJobStatusRequestDTO {
                        status: "FAILED".to_string(),
                        lease_id: Some(job.lease_id.clone()),
                        attempt_id: Some(job.attempt_id.clone()),
                        agent_id: Some(self.identity.agent_id.clone()),
                        execution_time_ms: None,
                        error: Some(err_msg),
                    },
                )
                .await;

            return Ok(false);
        }

        // 2. GATE 1: Notificar DOWNLOADED
        match self
            .client
            .update_job_status(
                &job.job_id,
                &UpdatePrintJobStatusRequestDTO {
                    status: "DOWNLOADED".to_string(),
                    lease_id: Some(job.lease_id.clone()),
                    attempt_id: Some(job.attempt_id.clone()),
                    agent_id: Some(self.identity.agent_id.clone()),
                    execution_time_ms: None,
                    error: None,
                },
            )
            .await
        {
            Ok(_) => {}
            Err(err) => {
                warn!(
                    job_id = %job.job_id,
                    error = %err,
                    "[Agent] Rejeitado pelo backend no GATE DOWNLOADED. Abortando execução."
                );
                return Ok(false);
            }
        }

        // 3. Validação binária estrita (Base64 -> Tamanho -> Checksum SHA-256)
        let payload_bytes = match PayloadValidator::validate_and_decode(
            &job.payload_base64,
            job.payload_bytes_length,
            &job.checksum_sha256,
        ) {
            Ok(bytes) => bytes,
            Err(err) => {
                let err_msg = format!("Falha na validação binária do payload: {}", err);
                error!(job_id = %job.job_id, error = %err_msg, "[Agent] Erro de integridade no payload.");

                let _ = self
                    .client
                    .update_job_status(
                        &job.job_id,
                        &UpdatePrintJobStatusRequestDTO {
                            status: "FAILED".to_string(),
                            lease_id: Some(job.lease_id.clone()),
                            attempt_id: Some(job.attempt_id.clone()),
                            agent_id: Some(self.identity.agent_id.clone()),
                            execution_time_ms: None,
                            error: Some(err_msg),
                        },
                    )
                    .await;

                return Ok(false);
            }
        };

        // 4. GATE 2: Notificar DELIVERING
        match self
            .client
            .update_job_status(
                &job.job_id,
                &UpdatePrintJobStatusRequestDTO {
                    status: "DELIVERING".to_string(),
                    lease_id: Some(job.lease_id.clone()),
                    attempt_id: Some(job.attempt_id.clone()),
                    agent_id: Some(self.identity.agent_id.clone()),
                    execution_time_ms: None,
                    error: None,
                },
            )
            .await
        {
            Ok(_) => {}
            Err(err) => {
                warn!(
                    job_id = %job.job_id,
                    error = %err,
                    "[Agent] Rejeitado pelo backend no GATE DELIVERING. Abortando execução."
                );
                return Ok(false);
            }
        }

        // 5. Determinar repetições de transporte conforme CopyStrategy
        let send_repetitions = if job.copy_strategy.as_str() == "TRANSPORT_REPEAT" {
            job.copies
        } else {
            1
        };

        let target = PrinterTarget {
            printer_id: job.printer_id.clone(),
            name: job.printer_name.clone(),
            protocol: job.protocol.clone(),
            host: job.host.clone(),
            port: job.port,
        };

        let mut total_execution_time_ms = 0u64;
        let mut transport_success = true;
        let mut is_ambiguous = false;
        let mut transport_error: Option<TransportError> = None;

        for i in 1..=send_repetitions {
            match self.transport.send(&target, &payload_bytes).await {
                Ok(res) => {
                    total_execution_time_ms += res.execution_time_ms;
                }
                Err(err) => {
                    transport_success = false;
                    is_ambiguous = err.is_ambiguous_partial_write();
                    error!(
                        job_id = %job.job_id,
                        printer = %job.printer_name,
                        repetition = i,
                        total_repetitions = send_repetitions,
                        technical_error = ?err,
                        "[Agent] Falha técnica de transporte ao enviar para a impressora."
                    );
                    transport_error = Some(err);
                    break;
                }
            }
        }

        if !transport_success {
            let status_report = if is_ambiguous {
                "UNKNOWN_RESULT"
            } else {
                "FAILED"
            };

            let user_msg = if let Some(ref err) = transport_error {
                format_user_facing_error(err)
            } else {
                USER_FRIENDLY_PRINTER_UNREACHABLE_MSG.to_string()
            };

            let _ = self
                .client
                .update_job_status(
                    &job.job_id,
                    &UpdatePrintJobStatusRequestDTO {
                        status: status_report.to_string(),
                        lease_id: Some(job.lease_id.clone()),
                        attempt_id: Some(job.attempt_id.clone()),
                        agent_id: Some(self.identity.agent_id.clone()),
                        execution_time_ms: Some(total_execution_time_ms),
                        error: Some(user_msg),
                    },
                )
                .await;

            return Ok(false);
        }

        info!(
            printer = %job.printer_name,
            repetitions = send_repetitions,
            time_ms = total_execution_time_ms,
            "[Agent] Bytes entregues com sucesso ao transporte físico/memória."
        );

        // 6. Notificar DELIVERED_TO_TRANSPORT (Nunca PRINTED em transportes sem confirmação física)
        let _ = self
            .client
            .update_job_status(
                &job.job_id,
                &UpdatePrintJobStatusRequestDTO {
                    status: "DELIVERED_TO_TRANSPORT".to_string(),
                    lease_id: Some(job.lease_id.clone()),
                    attempt_id: Some(job.attempt_id.clone()),
                    agent_id: Some(self.identity.agent_id.clone()),
                    execution_time_ms: Some(total_execution_time_ms),
                    error: None,
                },
            )
            .await;

        // Registrar idempotência
        self.processed_attempts.insert(attempt_key);
        Ok(true)
    }

    /// Executa um ciclo completo de polling, claim, validação binária, transmissão e reporte de status
    pub async fn execute_cycle(&mut self) -> Result<usize, ClientError> {
        // 1. Heartbeat periódico independente do estado das impressoras
        let _heartbeat = match self.client.heartbeat(Some("ONLINE")).await {
            Ok(hb) => {
                self.config.poll_interval_secs = AgentConfig::sanitize_poll_interval(hb.poll_interval_seconds);
                self.state = AgentOperationalState::Online;
                hb
            }
            Err(e) => {
                debug!("[Agent] Aviso transitório no heartbeat: {}", e);
                return Err(e);
            }
        };

        // 2. Claim de jobs pendentes
        let jobs = self.client.fetch_pending_jobs().await?;
        if jobs.is_empty() {
            return Ok(0);
        }

        info!(jobs_count = jobs.len(), "[Agent] Jobs reivindicados para processamento.");
        let mut processed_count = 0;

        for job in jobs {
            info!(
                job_id = %job.job_id,
                printer = %job.printer_name,
                attempt = %job.attempt_id,
                strategy = %job.copy_strategy,
                copies = job.copies,
                "[Agent] Processando PrintJob."
            );

            // Isolamento defensivo: falha em uma impressora/job não interrompe os demais
            match self.process_job(&job).await {
                Ok(true) => {
                    processed_count += 1;
                }
                Ok(false) => {
                    // Job concluído com falha reportada ou duplicado; continua para os demais jobs
                }
                Err(err) => {
                    error!(job_id = %job.job_id, error = %err, "[Agent] Erro de protocolo ao processar job. Continuando ciclo...");
                }
            }
        }

        Ok(processed_count)
    }

    /// Loop contínuo com suporte a shutdown gracioso, reconexão automática e backoff progressivo
    pub async fn run_continuous_with_shutdown<F>(&mut self, mut shutdown_signal: F) -> Result<(), ClientError>
    where
        F: Future<Output = ()> + Unpin,
    {
        let mut backoff = BackoffManager::new(2, 60);

        loop {
            // Verificar se o shutdown foi acionado
            tokio::select! {
                _ = &mut shutdown_signal => {
                    info!("[Agent] Sinal de encerramento recebido. Finalizando runtime com segurança...");
                    self.state = AgentOperationalState::Stopped;
                    break;
                }
                _ = self.run_single_tick(&mut backoff) => {}
            }
        }

        Ok(())
    }

    async fn run_single_tick(&mut self, backoff: &mut BackoffManager) {
        if self.state == AgentOperationalState::AuthRequired {
            warn!("[Agent] Estado AUTH_REQUIRED: Credenciais revogadas ou não autorizadas no servidor. Aguardando novo pareamento (--pair)...");
            sleep(Duration::from_secs(60)).await;
            return;
        }

        match self.execute_cycle().await {
            Ok(_) => {
                backoff.reset();
                sleep(Duration::from_secs(self.config.poll_interval_secs)).await;
            }
            Err(ClientError::ApiError { status, message }) if status == 401 || status == 403 => {
                error!(
                    status = status,
                    message = %message,
                    "[Segurança] Token ou Agent revogado/não autorizado pelo servidor. Entrando em estado AUTH_REQUIRED."
                );
                self.state = AgentOperationalState::AuthRequired;
                sleep(Duration::from_secs(60)).await;
            }
            Err(e) => {
                let wait_dur = backoff.next();
                debug!(
                    error = %e,
                    retry_in_secs = wait_dur.as_secs(),
                    "[Agent] Backend temporariamente indisponível. Aplicando backoff progressivo..."
                );
                sleep(wait_dur).await;
            }
        }
    }

    /// Inicia o loop contínuo de polling com suporte a shutdown padrão (SIGINT/Ctrl+C)
    pub async fn run_continuous(&mut self) -> Result<(), ClientError> {
        let ctrl_c_future = async {
            let _ = tokio::signal::ctrl_c().await;
        };
        tokio::pin!(ctrl_c_future);
        self.run_continuous_with_shutdown(ctrl_c_future).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::MemoryTransport;

    #[test]
    fn test_backoff_progression_and_bounds() {
        let mut backoff = BackoffManager::new(2, 60);
        assert_eq!(backoff.next(), Duration::from_secs(2));
        assert_eq!(backoff.next(), Duration::from_secs(5));
        assert_eq!(backoff.next(), Duration::from_secs(10));
        assert_eq!(backoff.next(), Duration::from_secs(20));
        assert_eq!(backoff.next(), Duration::from_secs(30));
        assert_eq!(backoff.next(), Duration::from_secs(60));
        assert_eq!(backoff.next(), Duration::from_secs(60)); // Limitado a 60s

        backoff.reset();
        assert_eq!(backoff.next(), Duration::from_secs(2));
    }

    #[test]
    fn test_user_facing_error_formatting_no_technical_leak() {
        let err_connect = TransportError::ConnectFailed("Connection refused (os error 10061)".to_string());
        let user_msg = format_user_facing_error(&err_connect);
        assert!(!user_msg.contains("10061"));
        assert!(!user_msg.contains("Connection refused"));
        assert_eq!(user_msg, USER_FRIENDLY_PRINTER_UNREACHABLE_MSG);

        let err_timeout = TransportError::ConnectTimeout("Connect timeout 3000ms".to_string());
        let user_msg_timeout = format_user_facing_error(&err_timeout);
        assert_eq!(user_msg_timeout, USER_FRIENDLY_PRINTER_UNREACHABLE_MSG);
    }

    #[test]
    fn test_runtime_initialization_state() {
        let config = AgentConfig {
            backend_url: "http://localhost:3000".to_string(),
            agent_id: "agent-01".to_string(),
            installation_id: "inst-01".to_string(),
            token: "agt_test".to_string(),
            agent_version: "0.1.0".to_string(),
            machine_name: "PDV-01".to_string(),
            poll_interval_secs: 15,
            timeout_secs: 30,
        };

        let transport = MemoryTransport::new();
        let runtime = AgentRuntime::new(config, transport).expect("Falha ao instanciar runtime");
        assert_eq!(runtime.identity.agent_id, "agent-01");
        assert_eq!(runtime.processed_attempts.len(), 0);
        assert_eq!(runtime.state, AgentOperationalState::Starting);
    }
}
