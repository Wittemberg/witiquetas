use crate::config::AgentConfig;
use crate::identity::AgentIdentity;
use crate::payload::PayloadValidator;
use crate::protocol::client::{AgentClient, ClientError};
use crate::protocol::dto::UpdatePrintJobStatusRequestDTO;
use crate::transport::PrinterTransport;
use std::time::Duration;
use tokio::time::sleep;

pub struct AgentRuntime<T: PrinterTransport> {
    pub config: AgentConfig,
    pub identity: AgentIdentity,
    pub client: AgentClient,
    pub transport: T,
}

impl<T: PrinterTransport> AgentRuntime<T> {
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
        })
    }

    /// Exibe o log de inicialização (Startup Banner) sem expor credenciais/tokens
    pub fn print_startup_banner(&self) {
        println!("========================================================");
        println!(" Witiquetas Agent Core v{} (Headless Print Runtime)", self.identity.agent_version);
        println!("========================================================");
        println!(" Backend URL:    {}", self.config.backend_url);
        println!(" Agent ID:       {}", self.identity.agent_id);
        println!(" Installation:   {}", self.identity.installation_id);
        println!(" Machine Name:   {}", self.identity.machine_name);
        println!(" OS / Arch:      {} / {}", self.identity.os, self.identity.architecture);
        println!(" Poll Interval:  {}s", self.config.poll_interval_secs);
        println!(" Status:         STARTING");
        println!("========================================================");
    }

    /// Executa o ciclo de heartbeat inicial e liveness
    pub async fn initialize(&mut self) -> Result<(), ClientError> {
        self.print_startup_banner();
        let heartbeat_res = self.client.heartbeat(Some("ONLINE")).await?;
        println!(
            "[Agent] Conectado ao Backend com sucesso. ServerTime: {} | Fila Pendente: {}",
            heartbeat_res.server_time, heartbeat_res.pending_jobs_count
        );

        self.config.poll_interval_secs = AgentConfig::sanitize_poll_interval(heartbeat_res.poll_interval_seconds);
        Ok(())
    }

    /// Executa um ciclo completo de polling, claim, validação binária, transmissão e reporte de status
    pub async fn execute_cycle(&mut self) -> Result<usize, ClientError> {
        // 1. Heartbeat periódico
        let _heartbeat = match self.client.heartbeat(Some("ONLINE")).await {
            Ok(hb) => {
                self.config.poll_interval_secs = AgentConfig::sanitize_poll_interval(hb.poll_interval_seconds);
                hb
            }
            Err(e) => {
                eprintln!("[Agent] Aviso: Falha no heartbeat: {}", e);
                return Err(e);
            }
        };

        // 2. Claim de jobs pendentes
        let jobs = self.client.fetch_pending_jobs().await?;
        if jobs.is_empty() {
            return Ok(0);
        }

        println!("[Agent] {} job(s) reivindicado(s) para execução.", jobs.len());
        let mut processed_count = 0;

        for job in jobs {
            println!(
                "[Agent] Processando PrintJob '{}' para a impressora '{}' (Attempt: '{}', Lease: '{}')",
                job.job_id, job.printer_name, job.attempt_id, job.lease_id
            );

            // A. Notificar DOWNLOADED
            let _ = self
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
                .await;

            // B. Validação binária estrita (Base64 -> Tamanho -> Checksum SHA-256)
            let payload_bytes = match PayloadValidator::validate_and_decode(
                &job.payload_base64,
                job.payload_bytes_length,
                &job.checksum_sha256,
            ) {
                Ok(bytes) => bytes,
                Err(err) => {
                    let err_msg = format!("Falha na validação binária do payload: {}", err);
                    eprintln!("[Agent] Erro no job '{}': {}", job.job_id, err_msg);

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

                    continue;
                }
            };

            // C. Notificar DELIVERING
            let _ = self
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
                .await;

            // D. Enviar bytes ao Transport adapter
            match self.transport.send(&job.printer_name, &payload_bytes) {
                Ok(res) => {
                    println!(
                        "[Agent] Bytes transmitidos com sucesso para '{}' ({} bytes em {}ms).",
                        job.printer_name, res.bytes_written, res.execution_time_ms
                    );

                    // E. Notificar PRINTED
                    let _ = self
                        .client
                        .update_job_status(
                            &job.job_id,
                            &UpdatePrintJobStatusRequestDTO {
                                status: "PRINTED".to_string(),
                                lease_id: Some(job.lease_id.clone()),
                                attempt_id: Some(job.attempt_id.clone()),
                                agent_id: Some(self.identity.agent_id.clone()),
                                execution_time_ms: Some(res.execution_time_ms),
                                error: None,
                            },
                        )
                        .await;

                    processed_count += 1;
                }
                Err(err) => {
                    let err_msg = format!("Falha na transmissão para o transporte: {}", err);
                    eprintln!("[Agent] Erro de transporte no job '{}': {}", job.job_id, err_msg);

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
                }
            }
        }

        Ok(processed_count)
    }

    /// Inicia o loop contínuo de polling e execução do Agent Core Headless
    pub async fn run_continuous(&mut self) -> Result<(), ClientError> {
        self.initialize().await?;

        loop {
            if let Err(e) = self.execute_cycle().await {
                eprintln!("[Agent] Erro no ciclo de execução: {}. Aguardando próximo intervalo...", e);
            }

            sleep(Duration::from_secs(self.config.poll_interval_secs)).await;
        }
    }
}
