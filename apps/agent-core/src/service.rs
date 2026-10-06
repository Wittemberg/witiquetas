//! Gerenciamento do Serviço de Sistema (Windows Service) do Witiquetas Agent
//!
//! Este módulo implementa o ciclo de vida resiliente do Agent como serviço de segundo plano:
//! - Registro e ciclo no Service Control Manager (SCM) do Windows
//! - Idempotência estrita em todas as operações (install, uninstall, start, stop, status)
//! - Suporte a caminhos com espaços (ex: `C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe`)
//! - Configurações de recuperação automática (Delayed Auto-Start, restart em 5s)
//! - Retornos tipados e serializáveis (`ServiceOperationResult`, `ServiceStatusInfo`)

use serde::{Deserialize, Serialize};
use std::error::Error;

pub const SERVICE_NAME: &str = "WitiquetasAgent";
pub const SERVICE_DISPLAY_NAME: &str = "Witiquetas Agent de Impressão";
pub const SERVICE_DESCRIPTION: &str = "Witiquetas Print Runtime & Agent Core Headless";

/// Formata a linha de comando do binário para registro no SCM
pub fn format_service_bin_path(exe_path: &str) -> String {
    format!("\"{}\" --run-service", exe_path)
}

/// Formata o argumento `binPath=` para o utilitário `sc.exe`
pub fn format_sc_binpath_arg(exe_path: &str) -> String {
    format!("binPath= \"{}\" --run-service", exe_path)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceOperationResult {
    pub success: bool,
    pub service_name: String,
    pub action: String, // "install" | "uninstall" | "start" | "stop"
    pub status: String, // "created" | "updated" | "removed" | "already_running" | "already_stopped" | "not_installed" | "unsupported_platform"
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatusInfo {
    pub service_name: String,
    pub display_name: String,
    pub installed: bool,
    pub state: String, // "RUNNING" | "STOPPED" | "START_PENDING" | "STOP_PENDING" | "PAUSED" | "NOT_INSTALLED" | "UNKNOWN"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub binary_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_delayed_auto_start: Option<bool>,
}

#[cfg(windows)]
pub mod win {
    use super::*;
    use crate::config::AgentConfig;
    use crate::logging::init_logging;
    use crate::runtime::AgentRuntime;
    use crate::transport::DynamicRouterTransport;
    use std::env;
    use std::ffi::OsString;
    use std::process::Command;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::watch;
    use windows_service::{
        define_windows_service,
        service::{
            ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState,
            ServiceStatus, ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
    };

    define_windows_service!(ffi_service_main, service_main);

    /// Ponto de entrada chamado pelo Windows Service Control Manager (SCM)
    pub fn run_service() -> Result<(), Box<dyn Error>> {
        service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
        Ok(())
    }

    fn service_main(_arguments: Vec<OsString>) {
        if let Err(e) = run_service_impl() {
            eprintln!("[Windows Service] Falha na execução do serviço: {}", e);
        }
    }

    fn run_service_impl() -> Result<(), Box<dyn Error>> {
        let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
        let shutdown_requested = Arc::new(AtomicBool::new(false));
        let shutdown_requested_clone = shutdown_requested.clone();

        let event_handler = move |control_event| -> ServiceControlHandlerResult {
            match control_event {
                ServiceControl::Stop | ServiceControl::Shutdown => {
                    shutdown_requested_clone.store(true, Ordering::SeqCst);
                    let _ = shutdown_tx.send(true);
                    ServiceControlHandlerResult::NoError
                }
                ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
                _ => ServiceControlHandlerResult::NotImplemented,
            }
        };

        let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)?;

        // Notificar SCM: START_PENDING
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::StartPending,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 1,
            wait_hint: Duration::from_secs(5),
            process_id: None,
        })?;

        // Inicializar logging persistente em arquivo
        let _guard = init_logging(true);

        // Notificar SCM: RUNNING
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Running,
            controls_accepted: ServiceControlAccept::STOP | ServiceControlAccept::SHUTDOWN,
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        // Iniciar Tokio Runtime para o ciclo autônomo do Agent
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()?;

        rt.block_on(async {
            let config = match AgentConfig::load_auto() {
                Ok(cfg) => cfg,
                Err(err) => {
                    eprintln!("[Windows Service] Configuração não encontrada: {}. O serviço aguardará pareamento.", err);
                    while !shutdown_requested.load(Ordering::SeqCst) {
                        tokio::time::sleep(Duration::from_secs(10)).await;
                        if let Ok(cfg) = AgentConfig::load_auto() {
                            return run_agent_loop(cfg, &mut shutdown_rx).await;
                        }
                    }
                    return Ok(());
                }
            };

            run_agent_loop(config, &mut shutdown_rx).await
        })?;

        // Notificar SCM: STOPPED
        status_handle.set_service_status(ServiceStatus {
            service_type: ServiceType::OWN_PROCESS,
            current_state: ServiceState::Stopped,
            controls_accepted: ServiceControlAccept::empty(),
            exit_code: ServiceExitCode::Win32(0),
            checkpoint: 0,
            wait_hint: Duration::default(),
            process_id: None,
        })?;

        Ok(())
    }

    async fn run_agent_loop(config: AgentConfig, shutdown_rx: &mut watch::Receiver<bool>) -> Result<(), Box<dyn Error>> {
        let router_transport = DynamicRouterTransport::new();
        let mut runtime = AgentRuntime::new(config, router_transport)?;

        let shutdown_future = async {
            while !*shutdown_rx.borrow_and_update() {
                if shutdown_rx.changed().await.is_err() {
                    break;
                }
            }
        };

        tokio::pin!(shutdown_future);
        runtime.run_continuous_with_shutdown(shutdown_future).await?;
        Ok(())
    }

    /// Helper interno para obter status do SCM
    fn query_raw_service() -> Result<(bool, String), Box<dyn Error>> {
        let output = Command::new("sc.exe")
            .args(["query", SERVICE_NAME])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("1060") || stdout.contains("FAILED") || stdout.contains("não existe") || stdout.contains("does not exist") {
            return Ok((false, "NOT_INSTALLED".to_string()));
        }

        let state = if stdout.contains("RUNNING") {
            "RUNNING"
        } else if stdout.contains("STOPPED") {
            "STOPPED"
        } else if stdout.contains("START_PENDING") {
            "START_PENDING"
        } else if stdout.contains("STOP_PENDING") {
            "STOP_PENDING"
        } else if stdout.contains("PAUSED") {
            "PAUSED"
        } else {
            "UNKNOWN"
        };

        Ok((true, state.to_string()))
    }

    /// Instala ou reconfigura de forma idempotente o serviço com Delayed Auto-Start e auto-recovery
    pub fn install_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        let current_exe = env::current_exe()?;
        let exe_path_str = current_exe.to_str().ok_or("Caminho do executável inválido")?;

        let bin_path_arg = format_sc_binpath_arg(exe_path_str);
        let (is_installed, current_state) = query_raw_service().unwrap_or((false, "NOT_INSTALLED".to_string()));

        let action_status = if is_installed {
            // Reconfiguração idempotente de serviço já existente
            let sc_config = Command::new("sc.exe")
                .args([
                    "config",
                    SERVICE_NAME,
                    &bin_path_arg,
                    &format!("DisplayName= {}", SERVICE_DISPLAY_NAME),
                    "start= delayed-auto",
                ])
                .output()?;

            if !sc_config.status.success() {
                let err = String::from_utf8_lossy(&sc_config.stderr);
                return Ok(ServiceOperationResult {
                    success: false,
                    service_name: SERVICE_NAME.to_string(),
                    action: "install".to_string(),
                    status: "config_failed".to_string(),
                    message: format!("Falha ao reconfigurar serviço: {}", err.trim()),
                    details: Some(err.to_string()),
                });
            }
            "updated"
        } else {
            // Criação inicial
            let sc_create = Command::new("sc.exe")
                .args([
                    "create",
                    SERVICE_NAME,
                    &bin_path_arg,
                    &format!("DisplayName= {}", SERVICE_DISPLAY_NAME),
                    "start= auto",
                ])
                .output()?;

            if !sc_create.status.success() {
                let err = String::from_utf8_lossy(&sc_create.stderr);
                let stdout = String::from_utf8_lossy(&sc_create.stdout);
                let msg = if !err.is_empty() { err } else { stdout };
                return Ok(ServiceOperationResult {
                    success: false,
                    service_name: SERVICE_NAME.to_string(),
                    action: "install".to_string(),
                    status: "create_failed".to_string(),
                    message: format!("Falha ao registrar serviço no SCM: {}", msg.trim()),
                    details: Some(msg.to_string()),
                });
            }

            // Aplicar Delayed Auto-Start
            let _ = Command::new("sc.exe")
                .args(["config", SERVICE_NAME, "start= delayed-auto"])
                .output();

            "created"
        };

        // Descrição do serviço
        let _ = Command::new("sc.exe")
            .args(["description", SERVICE_NAME, SERVICE_DESCRIPTION])
            .output();

        // Política de recuperação resiliente: 24h reset, 3 tentativas imediatas a cada 5s
        let _ = Command::new("sc.exe")
            .args([
                "failure",
                SERVICE_NAME,
                "reset= 86400",
                "actions= restart/5000/restart/5000/restart/5000",
            ])
            .output();

        // Se parado ou recém-criado, iniciar
        if current_state != "RUNNING" {
            let _ = Command::new("sc.exe").args(["start", SERVICE_NAME]).output();
        }

        Ok(ServiceOperationResult {
            success: true,
            service_name: SERVICE_NAME.to_string(),
            action: "install".to_string(),
            status: action_status.to_string(),
            message: if action_status == "created" {
                format!("Serviço '{}' instalado e iniciado com sucesso.", SERVICE_NAME)
            } else {
                format!("Serviço '{}' já existente atualizado e reconfigurado com sucesso.", SERVICE_NAME)
            },
            details: Some(format!("binPath: \"{}\" --run-service | Startup: delayed-auto | Recovery: restart/5s", exe_path_str)),
        })
    }

    /// Desinstalação idempotente
    pub fn uninstall_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        let (is_installed, _) = query_raw_service().unwrap_or((false, "NOT_INSTALLED".to_string()));

        if !is_installed {
            return Ok(ServiceOperationResult {
                success: true,
                service_name: SERVICE_NAME.to_string(),
                action: "uninstall".to_string(),
                status: "not_installed".to_string(),
                message: format!("Serviço '{}' não está instalado no sistema.", SERVICE_NAME),
                details: None,
            });
        }

        // Parar serviço antes de deletar
        let _ = Command::new("sc.exe").args(["stop", SERVICE_NAME]).output();
        std::thread::sleep(Duration::from_millis(500));

        let sc_delete = Command::new("sc.exe").args(["delete", SERVICE_NAME]).output()?;
        if sc_delete.status.success() {
            Ok(ServiceOperationResult {
                success: true,
                service_name: SERVICE_NAME.to_string(),
                action: "uninstall".to_string(),
                status: "removed".to_string(),
                message: format!("Serviço '{}' desinstalado com sucesso.", SERVICE_NAME),
                details: None,
            })
        } else {
            let err = String::from_utf8_lossy(&sc_delete.stderr);
            Ok(ServiceOperationResult {
                success: false,
                service_name: SERVICE_NAME.to_string(),
                action: "uninstall".to_string(),
                status: "delete_failed".to_string(),
                message: format!("Falha ao remover serviço: {}", err.trim()),
                details: Some(err.to_string()),
            })
        }
    }

    /// Início de serviço idempotente
    pub fn start_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        let (is_installed, state) = query_raw_service()?;
        if !is_installed {
            return Ok(ServiceOperationResult {
                success: false,
                service_name: SERVICE_NAME.to_string(),
                action: "start".to_string(),
                status: "not_installed".to_string(),
                message: format!("Serviço '{}' não está instalado.", SERVICE_NAME),
                details: None,
            });
        }

        if state == "RUNNING" {
            return Ok(ServiceOperationResult {
                success: true,
                service_name: SERVICE_NAME.to_string(),
                action: "start".to_string(),
                status: "already_running".to_string(),
                message: format!("Serviço '{}' já está em execução.", SERVICE_NAME),
                details: None,
            });
        }

        let sc_start = Command::new("sc.exe").args(["start", SERVICE_NAME]).output()?;
        let success = sc_start.status.success();
        let stdout = String::from_utf8_lossy(&sc_start.stdout);

        Ok(ServiceOperationResult {
            success,
            service_name: SERVICE_NAME.to_string(),
            action: "start".to_string(),
            status: if success { "started".to_string() } else { "failed".to_string() },
            message: if success {
                format!("Serviço '{}' iniciado com sucesso.", SERVICE_NAME)
            } else {
                format!("Falha ao iniciar serviço: {}", stdout.trim())
            },
            details: Some(stdout.to_string()),
        })
    }

    /// Parada de serviço idempotente
    pub fn stop_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        let (is_installed, state) = query_raw_service()?;
        if !is_installed {
            return Ok(ServiceOperationResult {
                success: true,
                service_name: SERVICE_NAME.to_string(),
                action: "stop".to_string(),
                status: "not_installed".to_string(),
                message: format!("Serviço '{}' não está instalado.", SERVICE_NAME),
                details: None,
            });
        }

        if state == "STOPPED" {
            return Ok(ServiceOperationResult {
                success: true,
                service_name: SERVICE_NAME.to_string(),
                action: "stop".to_string(),
                status: "already_stopped".to_string(),
                message: format!("Serviço '{}' já se encontra parado.", SERVICE_NAME),
                details: None,
            });
        }

        let sc_stop = Command::new("sc.exe").args(["stop", SERVICE_NAME]).output()?;
        let success = sc_stop.status.success();
        let stdout = String::from_utf8_lossy(&sc_stop.stdout);

        Ok(ServiceOperationResult {
            success,
            service_name: SERVICE_NAME.to_string(),
            action: "stop".to_string(),
            status: if success { "stopped".to_string() } else { "failed".to_string() },
            message: if success {
                format!("Comando de parada enviado ao serviço '{}'.", SERVICE_NAME)
            } else {
                format!("Falha ao parar serviço: {}", stdout.trim())
            },
            details: Some(stdout.to_string()),
        })
    }

    /// Consulta de status tipada e completa
    pub fn service_status() -> Result<ServiceStatusInfo, Box<dyn Error>> {
        let (is_installed, state) = query_raw_service()?;
        if !is_installed {
            return Ok(ServiceStatusInfo {
                service_name: SERVICE_NAME.to_string(),
                display_name: SERVICE_DISPLAY_NAME.to_string(),
                installed: false,
                state: "NOT_INSTALLED".to_string(),
                start_type: None,
                binary_path: None,
                is_delayed_auto_start: None,
            });
        }

        // Consultar configuração detalhada via sc qc
        let qc_output = Command::new("sc.exe").args(["qc", SERVICE_NAME]).output();
        let mut binary_path = None;
        let mut start_type = None;
        let mut is_delayed = None;

        if let Ok(qc) = qc_output {
            let qc_text = String::from_utf8_lossy(&qc.stdout);
            for line in qc_text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("BINARY_PATH_NAME") {
                    if let Some((_, val)) = trimmed.split_once(':') {
                        binary_path = Some(val.trim().to_string());
                    }
                } else if trimmed.starts_with("START_TYPE") {
                    if let Some((_, val)) = trimmed.split_once(':') {
                        start_type = Some(val.trim().to_string());
                        if val.contains("DELAYED") || val.contains("ATRASO") {
                            is_delayed = Some(true);
                        }
                    }
                }
            }
        }

        Ok(ServiceStatusInfo {
            service_name: SERVICE_NAME.to_string(),
            display_name: SERVICE_DISPLAY_NAME.to_string(),
            installed: true,
            state,
            start_type,
            binary_path,
            is_delayed_auto_start: is_delayed,
        })
    }
}

#[cfg(not(windows))]
pub mod non_win {
    use super::*;

    pub fn run_service() -> Result<(), Box<dyn Error>> {
        Err("Execução como serviço nativo de sistema está disponível apenas no Windows.".into())
    }

    pub fn install_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        Ok(ServiceOperationResult {
            success: false,
            service_name: SERVICE_NAME.to_string(),
            action: "install".to_string(),
            status: "unsupported_platform".to_string(),
            message: "Gerenciamento de serviço nativo Windows não suportado nesta plataforma.".to_string(),
            details: None,
        })
    }

    pub fn uninstall_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        Ok(ServiceOperationResult {
            success: true,
            service_name: SERVICE_NAME.to_string(),
            action: "uninstall".to_string(),
            status: "unsupported_platform".to_string(),
            message: "Serviço não aplicável nesta plataforma.".to_string(),
            details: None,
        })
    }

    pub fn start_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        Ok(ServiceOperationResult {
            success: false,
            service_name: SERVICE_NAME.to_string(),
            action: "start".to_string(),
            status: "unsupported_platform".to_string(),
            message: "Comando start não aplicável nesta plataforma.".to_string(),
            details: None,
        })
    }

    pub fn stop_service() -> Result<ServiceOperationResult, Box<dyn Error>> {
        Ok(ServiceOperationResult {
            success: false,
            service_name: SERVICE_NAME.to_string(),
            action: "stop".to_string(),
            status: "unsupported_platform".to_string(),
            message: "Comando stop não aplicável nesta plataforma.".to_string(),
            details: None,
        })
    }

    pub fn service_status() -> Result<ServiceStatusInfo, Box<dyn Error>> {
        Ok(ServiceStatusInfo {
            service_name: SERVICE_NAME.to_string(),
            display_name: SERVICE_DISPLAY_NAME.to_string(),
            installed: false,
            state: "UNSUPPORTED_PLATFORM".to_string(),
            start_type: None,
            binary_path: None,
            is_delayed_auto_start: None,
        })
    }
}

#[cfg(windows)]
pub use win::*;

#[cfg(not(windows))]
pub use non_win::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bin_path_quoting_with_spaces() {
        let path = r#"C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe"#;
        let formatted = format_service_bin_path(path);
        assert_eq!(
            formatted,
            r#""C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#
        );

        let sc_arg = format_sc_binpath_arg(path);
        assert_eq!(
            sc_arg,
            r#"binPath= "C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#
        );
    }

    #[test]
    fn test_service_operation_result_serialization() {
        let result = ServiceOperationResult {
            success: true,
            service_name: SERVICE_NAME.to_string(),
            action: "install".to_string(),
            status: "created".to_string(),
            message: "Serviço instalado com sucesso.".to_string(),
            details: Some("Delayed auto-start configurado".to_string()),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"serviceName\":\"WitiquetasAgent\""));
        assert!(json.contains("\"action\":\"install\""));
    }

    #[test]
    fn test_service_status_info_serialization() {
        let status = ServiceStatusInfo {
            service_name: SERVICE_NAME.to_string(),
            display_name: SERVICE_DISPLAY_NAME.to_string(),
            installed: true,
            state: "RUNNING".to_string(),
            start_type: Some("DELAYED_AUTO_START".to_string()),
            binary_path: Some(r#""C:\Program Files\Witiquetas\Agent\witiquetas-agent.exe" --run-service"#.to_string()),
            is_delayed_auto_start: Some(true),
        };

        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"installed\":true"));
        assert!(json.contains("\"state\":\"RUNNING\""));
    }
}
