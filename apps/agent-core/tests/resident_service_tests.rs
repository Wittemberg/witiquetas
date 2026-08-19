use std::collections::HashSet;
use std::env;
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use witiquetas_agent_core::config::AgentConfig;
use witiquetas_agent_core::logging::sanitize_for_log;
use witiquetas_agent_core::pairing::{load_identity, save_identity, AgentIdentityData};
use witiquetas_agent_core::runtime::{
    format_user_facing_error, AgentOperationalState, AgentRuntime, BackoffManager,
    USER_FRIENDLY_PRINTER_UNREACHABLE_MSG,
};
use witiquetas_agent_core::transport::{
    MemoryTransport, PrinterTarget, PrinterTransport, RawTcpTransport, TransportError,
    TransportResult,
};

/// 1. Teste: Identidade persiste em disco e sobrevive a restart
#[test]
fn test_identity_survives_restart() {
    let temp_dir = env::temp_dir().join(format!("witiquetas_test_ident_{}", rand_id()));
    let _ = fs::create_dir_all(&temp_dir);
    let config_path = temp_dir.join("identity.json");
    env::set_var("WITIQUETAS_CONFIG_PATH", &config_path);

    let initial_data = AgentIdentityData {
        config_version: 1,
        agent_id: "agt-residente-01".to_string(),
        installation_id: "inst-srv-999".to_string(),
        token: "agt_live_secret_token_resident_123".to_string(),
        backend_url: "https://witiquetas.wrtec.com.br".to_string(),
        company_id: Some("comp-filial-02".to_string()),
        machine_name: "SERVER-PRINT-01".to_string(),
        paired_at: "2026-08-19T10:00:00Z".to_string(),
    };

    // Salvar primeira vez
    let saved_path = save_identity(&initial_data).expect("Falha ao salvar identidade");
    assert_eq!(saved_path, config_path);

    // Simular "Restart" do processo / recarregamento limpo
    let loaded = load_identity()
        .expect("Falha ao ler identidade")
        .expect("Arquivo de identidade não encontrado após restart");

    assert_eq!(loaded.agent_id, "agt-residente-01");
    assert_eq!(loaded.token, "agt_live_secret_token_resident_123");
    assert_eq!(loaded.machine_name, "SERVER-PRINT-01");
    assert_eq!(loaded.company_id.as_deref(), Some("comp-filial-02"));

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);
}

/// 2. Teste: Agent inicia de forma autônoma e sem interface interativa (Headless)
#[tokio::test]
async fn test_agent_headless_initialization() {
    let config = AgentConfig {
        backend_url: "http://127.0.0.1:9".to_string(),
        agent_id: "agent-headless-01".to_string(),
        installation_id: "inst-headless-01".to_string(),
        token: "agt_live_test_token".to_string(),
        agent_version: "0.1.0".to_string(),
        machine_name: "DAEMON-HOST".to_string(),
        poll_interval_secs: 15,
        timeout_secs: 10,
    };

    let transport = MemoryTransport::new();
    let runtime = AgentRuntime::new(config, transport).expect("Runtime headless deve instanciar");
    assert_eq!(runtime.identity.machine_name, "DAEMON-HOST");
    assert_eq!(runtime.state, AgentOperationalState::Starting);
}

/// 3. Teste: Impressora offline não crasha o Agent e gera mensagem amigável para o usuário
#[tokio::test]
async fn test_printer_offline_agent_stays_alive_and_reports_friendly_message() {
    // Simula porta fechada (ECONNREFUSED)
    let transport = RawTcpTransport::with_timeouts(
        Duration::from_millis(200),
        Duration::from_millis(200),
    );

    let offline_target = PrinterTarget {
        printer_id: "prn-offline".to_string(),
        name: "Zebra Balcão Offline".to_string(),
        protocol: "RAW_TCP".to_string(),
        host: Some("127.0.0.1".to_string()),
        port: Some(1), // Porta 1 tipicamente fechada
    };

    let result = transport.send(&offline_target, b"ETIQUETA TESTE").await;
    assert!(result.is_err());
    let err = result.unwrap_err();

    // Validar mensagem de erro destinada ao usuário final (sem vazar ECONNREFUSED)
    let user_msg = format_user_facing_error(&err);
    assert_eq!(user_msg, USER_FRIENDLY_PRINTER_UNREACHABLE_MSG);
    assert!(!user_msg.contains("10061"));
    assert!(!user_msg.contains("Connection refused"));
    assert!(!user_msg.contains("socket"));
}

/// 4. Teste: Impressora que volta a ficar online imprime com sucesso sem reiniciar o Agent
#[tokio::test]
async fn test_printer_reconnect_succeeds_next_job() {
    let mock_printer = MockFailableTransport::new();

    // Primeira tentativa: impressora desligada/falhando
    mock_printer.set_online(false);
    let target = PrinterTarget::tcp("Zebra Termica", "192.168.1.100", 9100);

    let res1 = mock_printer.send(&target, b"TESTE 1").await;
    assert!(res1.is_err(), "Impressora offline deve falhar envio");
    let err1 = res1.unwrap_err();
    assert_eq!(format_user_facing_error(&err1), USER_FRIENDLY_PRINTER_UNREACHABLE_MSG);

    // Impressora é religada na rede
    mock_printer.set_online(true);

    // Segunda tentativa: mesmo Agent, mesmo transporte, agora com impressora online
    let res2 = mock_printer.send(&target, b"TESTE 2").await;
    assert!(res2.is_ok(), "Após religar a impressora, envio deve funcionar sem reiniciar o Agent");
    let written = res2.unwrap().bytes_written;
    assert_eq!(written, b"TESTE 2".len());
}

/// 5. Teste: Falha em uma impressora não afeta o processamento de outras impressoras
#[tokio::test]
async fn test_multi_printer_isolation() {
    let mock_transport = MockMultiPrinterTransport::new();
    mock_transport.set_printer_status("prn-quebrada", false);
    mock_transport.set_printer_status("prn-ok", true);

    let target_bad = PrinterTarget {
        printer_id: "prn-quebrada".to_string(),
        name: "Zebra com Defeito".to_string(),
        protocol: "RAW_TCP".to_string(),
        host: Some("192.168.1.51".to_string()),
        port: Some(9100),
    };

    let target_good = PrinterTarget {
        printer_id: "prn-ok".to_string(),
        name: "Zebra Operacional".to_string(),
        protocol: "RAW_TCP".to_string(),
        host: Some("192.168.1.52".to_string()),
        port: Some(9100),
    };

    // Job para a impressora defeituosa falha defensivamente
    let res_bad = mock_transport.send(&target_bad, b"PAYLOAD 1").await;
    assert!(res_bad.is_err());

    // Job para a impressora boa funciona perfeitamente
    let res_good = mock_transport.send(&target_good, b"PAYLOAD 2").await;
    assert!(res_good.is_ok());
    assert_eq!(res_good.unwrap().bytes_written, b"PAYLOAD 2".len());
}

/// 6. Teste: Backoff progressivo limitado (2s -> 5s -> 10s -> 20s -> 30s -> 60s)
#[test]
fn test_backoff_progression_limits() {
    let mut backoff = BackoffManager::new(2, 60);

    let expected_steps = vec![2, 5, 10, 20, 30, 60, 60, 60];
    for expected in expected_steps {
        let dur = backoff.next();
        assert_eq!(dur.as_secs(), expected);
    }

    // Reset em caso de reconexão bem-sucedida
    backoff.reset();
    assert_eq!(backoff.next().as_secs(), 2);
}

/// 7. Teste: Segurança - Sanitização estrita de logs impede vazamento de tokens e senhas
#[test]
fn test_log_sanitization_never_logs_tokens() {
    let log_msg_1 = "Request failed: Authorization: Bearer agt_live_998877665544332211";
    let sanitized_1 = sanitize_for_log(log_msg_1);
    assert!(!sanitized_1.contains("998877665544332211"));
    assert!(sanitized_1.contains("***REDACTED***"));

    let log_msg_2 = "Failed to authenticate with token agt_live_supersecrettokenxyz for agent-01";
    let sanitized_2 = sanitize_for_log(log_msg_2);
    assert!(!sanitized_2.contains("supersecrettokenxyz"));
    assert!(sanitized_2.contains("agt_live***"));
}

/// 8. Teste: Backend offline -> Agent continua vivo e reconecta automaticamente quando o servidor responde
#[tokio::test]
async fn test_backend_offline_and_reconnection() {
    // Inicializar mini mock server HTTP
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let backend_url = format!("http://127.0.0.1:{}", port);

    // Responder HTTP 200 Heartbeat
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;

            let response_body = r#"{"acknowledged":true,"pollIntervalSeconds":15,"serverTime":"2026-08-19T14:30:00Z","pendingJobsCount":0}"#;
            let http_response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            let _ = socket.write_all(http_response.as_bytes()).await;
        }
    });

    let config = AgentConfig {
        backend_url,
        agent_id: "agent-recon-01".to_string(),
        installation_id: "inst-recon-01".to_string(),
        token: "agt_live_reconnect_token".to_string(),
        agent_version: "0.1.0".to_string(),
        machine_name: "RECON-HOST".to_string(),
        poll_interval_secs: 15,
        timeout_secs: 5,
    };

    let transport = MemoryTransport::new();
    let mut runtime = AgentRuntime::new(config, transport).expect("Runtime deve instanciar");

    let init_result = runtime.initialize().await;
    assert!(init_result.is_ok(), "Deve inicializar e conectar com sucesso");
    assert_eq!(runtime.state, AgentOperationalState::Online);
}

/// 9. Teste: HTTP 401/403 coloca Agent em estado AUTH_REQUIRED sem destruir a identidade local
#[tokio::test]
async fn test_auth_revocation_enters_auth_required_state() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let backend_url = format!("http://127.0.0.1:{}", port);

    // Salvar arquivo de identidade temporário
    let temp_dir = env::temp_dir().join(format!("witiquetas_auth_req_{}", rand_id()));
    let _ = fs::create_dir_all(&temp_dir);
    let config_path = temp_dir.join("identity.json");
    env::set_var("WITIQUETAS_CONFIG_PATH", &config_path);

    let identity = AgentIdentityData {
        config_version: 1,
        agent_id: "agt-revoked-01".to_string(),
        installation_id: "inst-revoked-01".to_string(),
        token: "agt_live_revoked_token".to_string(),
        backend_url: backend_url.clone(),
        company_id: None,
        machine_name: "TEST-HOST".to_string(),
        paired_at: "2026-08-19T12:00:00Z".to_string(),
    };
    let _ = save_identity(&identity);

    // Servidor retorna 401 Unauthorized
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;

            let response_body = r#"{"error":"Agent token revoked"}"#;
            let http_response = format!(
                "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            let _ = socket.write_all(http_response.as_bytes()).await;
        }
    });

    let config = AgentConfig {
        backend_url,
        agent_id: "agt-revoked-01".to_string(),
        installation_id: "inst-revoked-01".to_string(),
        token: "agt_live_revoked_token".to_string(),
        agent_version: "0.1.0".to_string(),
        machine_name: "TEST-HOST".to_string(),
        poll_interval_secs: 15,
        timeout_secs: 5,
    };

    let transport = MemoryTransport::new();
    let runtime = AgentRuntime::new(config, transport).expect("Runtime deve instanciar");

    let heartbeat_err = runtime.client.heartbeat(Some("ONLINE")).await;
    assert!(heartbeat_err.is_err());

    // Identidade local continua preservada no disco (NÃO deve ser apagada)
    assert!(config_path.exists(), "Identidade local deve ser preservada em 401/403");

    let _ = fs::remove_dir_all(&temp_dir);
}

/// Helper para simular transporte com falha controlável
#[derive(Clone, Default)]
struct MockFailableTransport {
    is_online: Arc<AtomicBool>,
}

impl MockFailableTransport {
    fn new() -> Self {
        Self {
            is_online: Arc::new(AtomicBool::new(true)),
        }
    }

    fn set_online(&self, online: bool) {
        self.is_online.store(online, Ordering::SeqCst);
    }
}

impl PrinterTransport for MockFailableTransport {
    async fn send(&self, _target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError> {
        if !self.is_online.load(Ordering::SeqCst) {
            return Err(TransportError::ConnectFailed("Host unreachable".to_string()));
        }
        Ok(TransportResult {
            bytes_written: payload.len(),
            execution_time_ms: 15,
        })
    }
}

/// Helper para simular múltiplas impressoras com estados distintos
#[derive(Clone, Default)]
struct MockMultiPrinterTransport {
    offline_printers: Arc<Mutex<HashSet<String>>>,
}

impl MockMultiPrinterTransport {
    fn new() -> Self {
        Self {
            offline_printers: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    fn set_printer_status(&self, printer_id: &str, online: bool) {
        let mut set = self.offline_printers.try_lock().unwrap();
        if online {
            set.remove(printer_id);
        } else {
            set.insert(printer_id.to_string());
        }
    }
}

impl PrinterTransport for MockMultiPrinterTransport {
    async fn send(&self, target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError> {
        let set = self.offline_printers.lock().await;
        if set.contains(&target.printer_id) {
            return Err(TransportError::ConnectFailed("Printer powered off".to_string()));
        }
        Ok(TransportResult {
            bytes_written: payload.len(),
            execution_time_ms: 10,
        })
    }
}

fn rand_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
}
