//! Testes de Integração e Conformidade do Package 5.7.2
//! AGENT DISTRIBUTION FOUNDATION — CORE SERVICE & ZERO-TERMINAL READINESS

use std::env;
use std::fs;
use std::sync::Mutex;
use witiquetas_agent_core::diagnostics::{self, CheckStatus, DiagnosticCheckItem, DiagnosticReport, ServiceStatusState};
use witiquetas_agent_core::output::{
    StructuredResponse, EXIT_AUTH_PAIRING, EXIT_GENERAL_ERROR, EXIT_INVALID_ARGS,
    EXIT_NETWORK_ERROR, EXIT_PERMISSION_DENIED, EXIT_SCM_ERROR, EXIT_SUCCESS, SCHEMA_VERSION,
};
use witiquetas_agent_core::pairing::{
    self, normalize_pairing_code, unpair, AgentIdentityData,
};
use witiquetas_agent_core::service::{
    format_sc_binpath_arg, format_service_bin_path, ServiceOperationResult, ServiceStatusInfo,
    SERVICE_DISPLAY_NAME, SERVICE_NAME,
};
use witiquetas_agent_core::version;

static TEST_MUTEX: Mutex<()> = Mutex::new(());

/// 1. Teste de Formatação e Quoting de Caminho de Binário com Espaços (Program Files)
#[test]
fn test_program_files_service_quoting() {
    let program_files_path = r#"C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe"#;

    let bin_path = format_service_bin_path(program_files_path);
    assert_eq!(
        bin_path,
        r#""C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#
    );

    let sc_arg = format_sc_binpath_arg(program_files_path);
    assert_eq!(
        sc_arg,
        r#"binPath= "C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#
    );
    assert!(sc_arg.starts_with("binPath= \""));
}

/// 2. Teste de Constantes e Nomenclatura Canônica do Serviço
#[test]
fn test_service_canonical_naming() {
    assert_eq!(SERVICE_NAME, "WitiquetasAgent");
    assert_eq!(SERVICE_DISPLAY_NAME, "Witiquetas Agent de Impressão");
}

/// 3. Teste de Modelos de Dados de Serviço (Idempotência e Serde)
#[test]
fn test_service_models_serialization() {
    let op_created = ServiceOperationResult {
        success: true,
        service_name: SERVICE_NAME.to_string(),
        action: "install".to_string(),
        status: "created".to_string(),
        message: "Serviço instalado com sucesso.".to_string(),
        details: Some("Delayed automatic start configurado".to_string()),
    };
    let json_created = serde_json::to_string(&op_created).unwrap();
    assert!(json_created.contains("\"status\":\"created\""));

    let op_updated = ServiceOperationResult {
        success: true,
        service_name: SERVICE_NAME.to_string(),
        action: "install".to_string(),
        status: "updated".to_string(),
        message: "Serviço já existente atualizado.".to_string(),
        details: None,
    };
    let json_updated = serde_json::to_string(&op_updated).unwrap();
    assert!(json_updated.contains("\"status\":\"updated\""));

    let status_info = ServiceStatusInfo {
        service_name: SERVICE_NAME.to_string(),
        display_name: SERVICE_DISPLAY_NAME.to_string(),
        installed: true,
        state: "RUNNING".to_string(),
        start_type: Some("DELAYED_AUTO_START".to_string()),
        binary_path: Some(r#""C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#.to_string()),
        is_delayed_auto_start: Some(true),
    };
    let json_status = serde_json::to_string(&status_info).unwrap();
    assert!(json_status.contains("\"state\":\"RUNNING\""));
    assert!(json_status.contains("\"isDelayedAutoStart\":true"));
}

/// 4. Teste de Redaction Rigorosa de Segredos em Diagnósticos
#[test]
fn test_diagnostics_security_redaction_guarantee() {
    let report = DiagnosticReport {
        agent_version: "0.2.0".to_string(),
        build_commit: "0123456789abcdef".to_string(),
        build_timestamp: "2026-10-06T15:30:00Z".to_string(),
        target_architecture: "x86_64-pc-windows-msvc".to_string(),
        os: "windows".to_string(),
        os_version: "Microsoft Windows 11 Pro".to_string(),
        architecture: "x86_64".to_string(),
        service_installed: true,
        service_state: ServiceStatusState::Running,
        paired: true,
        agent_id: Some("agent-exp-9988".to_string()),
        machine_name: "PDV-PRINCIPAL".to_string(),
        backend_url: "https://witiquetas.wrtec.com.br".to_string(),
        identity_readable: true,
        config_dir_writable: true,
        log_dir_writable: true,
        backend_reachable: true,
        healthy: true,
        checks: vec![DiagnosticCheckItem {
            name: "Serviço Windows".to_string(),
            status: CheckStatus::Ok,
            message: "Em execução".to_string(),
        }],
        duration_ms: 35,
    };

    let json = report.to_json().unwrap();
    // NUNCA deve conter menção a token, JWT, machine secret ou bearer na saída
    assert!(!json.to_lowercase().contains("token"));
    assert!(!json.to_lowercase().contains("secret"));
    assert!(!json.to_lowercase().contains("password"));
    assert!(!json.to_lowercase().contains("bearer"));

    let human = report.format_human();
    assert!(!human.to_lowercase().contains("token"));
    assert!(!human.to_lowercase().contains("secret"));
}

/// 5. Teste de Probe de Escrita Não-Destrutivo
#[test]
fn test_directory_probe_non_destructive() {
    let temp_dir = env::temp_dir();
    let is_writable = diagnostics::test_directory_writable(&temp_dir);
    assert!(is_writable, "Diretório temp deve ser gravável");

    // Verificar que o probe foi excluído e não deixou lixo
    let entries = fs::read_dir(&temp_dir).unwrap();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        assert!(
            !name.starts_with(".probe_leak"),
            "Arquivo temporário de probe não pode vazar"
        );
    }
}

/// 6. Teste de Normalização de Código de Pareamento WIT-XXXX-XXXX
#[test]
fn test_pairing_code_normalization() {
    // Casos válidos
    assert_eq!(
        normalize_pairing_code("WIT-7K4P-92MX").unwrap(),
        "WIT-7K4P-92MX"
    );
    assert_eq!(
        normalize_pairing_code("wit-7k4p-92mx").unwrap(),
        "WIT-7K4P-92MX"
    );
    assert_eq!(
        normalize_pairing_code("7k4p92mx").unwrap(),
        "WIT-7K4P-92MX"
    );
    assert_eq!(
        normalize_pairing_code("WIT7K4P92MX").unwrap(),
        "WIT-7K4P-92MX"
    );
    assert_eq!(
        normalize_pairing_code(" 7k4p-92mx ").unwrap(),
        "WIT-7K4P-92MX"
    );
    assert_eq!(
        normalize_pairing_code("WIT - 7K4P - 92MX").unwrap(),
        "WIT-7K4P-92MX"
    );

    // Casos inválidos
    assert!(normalize_pairing_code("").is_err());
    assert!(normalize_pairing_code("   ").is_err());
    assert!(normalize_pairing_code("WIT-123").is_err());
    assert!(normalize_pairing_code("7K4P92M").is_err()); // 7 chars
    assert!(normalize_pairing_code("7K4P92MXX").is_err()); // 9 chars
    assert!(normalize_pairing_code("WIT-7K4P-92M!").is_err());
}

/// 7. Teste de Despareamento Não-Destrutivo (Unpair)
#[test]
fn test_unpair_idempotent() {
    let _lock = TEST_MUTEX.lock().unwrap();

    let temp_dir = env::temp_dir().join(format!("witiquetas_test_unpair_{}", std::process::id()));
    let _ = fs::create_dir_all(&temp_dir);
    let config_path = temp_dir.join("identity.json");
    env::set_var("WITIQUETAS_CONFIG_PATH", &config_path);

    // Cenário 1: Sem arquivo existente -> unpair não falha
    if config_path.exists() {
        let _ = fs::remove_file(&config_path);
    }
    let res1 = unpair().unwrap();
    assert_eq!(res1.removed, false);
    assert!(res1.agent_id.is_none());

    // Cenário 2: Com arquivo existente -> remove e reporta agent_id
    let dummy_identity = AgentIdentityData {
        config_version: 1,
        agent_id: "agent-test-remove-01".to_string(),
        installation_id: "inst-001".to_string(),
        token: "agt_secret_123".to_string(),
        backend_url: "https://witiquetas.wrtec.com.br".to_string(),
        company_id: None,
        machine_name: "TEST-PC".to_string(),
        paired_at: "2026-10-06T15:00:00Z".to_string(),
    };
    pairing::save_identity(&dummy_identity).unwrap();
    assert!(config_path.exists());

    let res2 = unpair().unwrap();
    assert_eq!(res2.removed, true);
    assert_eq!(res2.agent_id.as_deref(), Some("agent-test-remove-01"));
    assert!(!config_path.exists(), "identity.json deve ter sido excluído");

    // Cleanup
    let _ = fs::remove_dir_all(&temp_dir);
    env::remove_var("WITIQUETAS_CONFIG_PATH");
}

/// 8. Teste de Envelope de Saída Estruturada e Exit Codes
#[test]
fn test_structured_response_and_exit_codes() {
    assert_eq!(SCHEMA_VERSION, 1);
    assert_eq!(EXIT_SUCCESS, 0);
    assert_eq!(EXIT_GENERAL_ERROR, 1);
    assert_eq!(EXIT_INVALID_ARGS, 2);
    assert_eq!(EXIT_AUTH_PAIRING, 10);
    assert_eq!(EXIT_NETWORK_ERROR, 20);
    assert_eq!(EXIT_PERMISSION_DENIED, 30);
    assert_eq!(EXIT_SCM_ERROR, 31);

    #[derive(serde::Serialize)]
    struct MockData {
        installed: bool,
    }

    let ok_resp = StructuredResponse::ok(MockData { installed: true });
    let ok_json = serde_json::to_string(&ok_resp).unwrap();
    assert!(ok_json.contains("\"success\":true"));
    assert!(ok_json.contains("\"schemaVersion\":1"));
    assert!(ok_json.contains("\"installed\":true"));
    assert!(!ok_json.contains("\"error\""));

    let err_resp = StructuredResponse::err("TEST_ERR", "Mensagem de teste", EXIT_SCM_ERROR);
    let err_json = serde_json::to_string(&err_resp).unwrap();
    assert!(err_json.contains("\"success\":false"));
    assert!(err_json.contains("\"schemaVersion\":1"));
    assert!(err_json.contains("\"code\":\"TEST_ERR\""));
    assert!(err_json.contains("\"exitCode\":31"));
    assert!(!err_json.contains("\"data\""));
}

/// 9. Teste de Metadados de Versão Injetados em Compile-Time
#[test]
fn test_version_info_metadata() {
    let info = version::get_version_info();
    assert_eq!(info.agent_version, "0.2.0");
    assert!(!info.build_commit.is_empty());
    assert!(!info.build_timestamp.is_empty());
    assert!(!info.target_architecture.is_empty());

    let human = info.to_human_string();
    assert!(human.contains("0.2.0"));
    assert!(human.contains("commit:"));

    let json = info.to_json().unwrap();
    assert!(json.contains("\"agent_version\":\"0.2.0\""));
}
