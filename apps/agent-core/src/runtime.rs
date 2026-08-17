use crate::config::AgentConfig;
use crate::identity::AgentIdentity;
use crate::payload::PayloadValidator;
use crate::protocol::client::{AgentClient, ClientError};
use crate::protocol::dto::{PrintJobItemDTO, UpdatePrintJobStatusRequestDTO};
use crate::transport::PrinterTransport;
use std::collections::HashSet;
use std::time::Duration;
use tokio::time::sleep;

pub struct AgentRuntime<T: PrinterTransport> {
    pub config: AgentConfig,
    pub identity: AgentIdentity,
    pub client: AgentClient,
    pub transport: T,
    pub processed_attempts: HashSet<String>,
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
            processed_attempts: HashSet::new(),
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

    /// Processa um único PrintJob respeitando idempotência, gates de status e copy strategy
    pub async fn process_job(&mut self, job: &PrintJobItemDTO) -> Result<bool, ClientError> {
        let attempt_key = format!("{}:{}", job.job_id, job.attempt_id);

        // 0. Verificação de idempotência em memória
        if self.processed_attempts.contains(&attempt_key) {
            println!(
                "[Agent] Idempotência: Job '{}' (Attempt '{}') já foi processado anteriormente. Ignorando claim duplicado.",
                job.job_id, job.attempt_id
            );
            return Ok(false);
        }

        // 1. Validação de quantidade de cópias
        if job.copies < 1 {
            let err_msg = format!("Quantidade de cópias inválida ({}). Deve ser no mínimo 1.", job.copies);
            eprintln!("[Agent] Rejeitando job '{}': {}", job.job_id, err_msg);

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
                eprintln!(
                    "[Agent] Rejeitado pelo backend no GATE DOWNLOADED (Job '{}'): {}. Abortando execução sem transporte.",
                    job.job_id, err
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
                eprintln!("[Agent] Erro de integridade no job '{}': {}", job.job_id, err_msg);

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
                eprintln!(
                    "[Agent] Rejeitado pelo backend no GATE DELIVERING (Job '{}'): {}. Abortando execução sem transporte.",
                    job.job_id, err
                );
                return Ok(false);
            }
        }

        // 5. Determinar repetições de transporte conforme CopyStrategy
        let send_repetitions = if job.copy_strategy.as_str() == "TRANSPORT_REPEAT" {
            job.copies
        } else {
            // EMBEDDED_IN_PAYLOAD ou padrão: 1 envio contendo as cópias incorporadas
            1
        };

        let mut total_execution_time_ms = 0u64;
        let mut transport_success = true;
        let mut last_error_msg = String::new();

        for i in 1..=send_repetitions {
            match self.transport.send(&job.printer_name, &payload_bytes) {
                Ok(res) => {
                    total_execution_time_ms += res.execution_time_ms;
                }
                Err(err) => {
                    transport_success = false;
                    last_error_msg = format!("Falha no envio de transporte (repetição {}/{}): {}", i, send_repetitions, err);
                    eprintln!("[Agent] Erro de transporte no job '{}': {}", job.job_id, last_error_msg);
                    break;
                }
            }
        }

        if !transport_success {
            let _ = self
                .client
                .update_job_status(
                    &job.job_id,
                    &UpdatePrintJobStatusRequestDTO {
                        status: "FAILED".to_string(),
                        lease_id: Some(job.lease_id.clone()),
                        attempt_id: Some(job.attempt_id.clone()),
                        agent_id: Some(self.identity.agent_id.clone()),
                        execution_time_ms: Some(total_execution_time_ms),
                        error: Some(last_error_msg),
                    },
                )
                .await;

            return Ok(false);
        }

        println!(
            "[Agent] Bytes entregues com sucesso ao transporte para '{}' ({} repetições em {}ms total).",
            job.printer_name, send_repetitions, total_execution_time_ms
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
                "[Agent] Processando PrintJob '{}' para a impressora '{}' (Attempt: '{}', Lease: '{}', Strategy: '{}', Copies: {})",
                job.job_id, job.printer_name, job.attempt_id, job.lease_id, job.copy_strategy, job.copies
            );

            match self.process_job(&job).await {
                Ok(true) => {
                    processed_count += 1;
                }
                Ok(false) => {
                    // Job rejeitado/abortado defensivamente; segue para o próximo job
                }
                Err(err) => {
                    eprintln!("[Agent] Erro inesperado ao processar job '{}': {}. Continuando ciclo...", job.job_id, err);
                }
            }
        }

        Ok(processed_count)
    }

    /// Inicia o loop contínuo de polling com suporte a shutdown limpo (Ctrl+C / SIGINT)
    pub async fn run_continuous(&mut self) -> Result<(), ClientError> {
        self.initialize().await?;

        loop {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {
                    println!("[Agent] Sinal de interrupção recebido (SIGINT/Ctrl+C). Encerrando runtime com segurança...");
                    break;
                }
                _ = sleep(Duration::from_secs(self.config.poll_interval_secs)) => {
                    if let Err(e) = self.execute_cycle().await {
                        eprintln!("[Agent] Erro no ciclo de execução: {}. Aguardando próximo intervalo...", e);
                    }
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::MemoryTransport;

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
    }
}

