use std::error::Error;

pub const SERVICE_NAME: &str = "WitiquetasAgent";
pub const SERVICE_DISPLAY_NAME: &str = "Witiquetas Agent de Impressão";
pub const SERVICE_DESCRIPTION: &str = "Witiquetas Print Runtime & Agent Core Headless";

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
            ServiceAccess, ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState,
            ServiceStatus, ServiceType,
        },
        service_control_handler::{self, ServiceControlHandlerResult},
        service_dispatcher,
        service_manager::{ServiceManager, ServiceManagerAccess},
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
                    // Manter vivo em loop de espera por configuração para não derrubar o serviço
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

    /// Instala o executável atual como Windows Service com início automático atrasado e políticas de reinicialização
    pub fn install_service() -> Result<(), Box<dyn Error>> {
        let current_exe = env::current_exe()?;
        let exe_path_str = current_exe.to_str().ok_or("Caminho do executável inválido")?;

        let manager = match ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE) {
            Ok(m) => m,
            Err(err) => {
                eprintln!();
                eprintln!(" ========================================================================");
                eprintln!(" [ERRO DE ELEVAÇÃO] Permissão negada para acessar o Gerenciador de Serviços.");
                eprintln!(" Para instalar o Witiquetas Agent como serviço do Windows, execute:");
                eprintln!("   1. Abra o Terminal / PowerShell como Administrador ('Executar como Administrador')");
                eprintln!("   2. Execute novamente: {} --install-service", current_exe.file_name().unwrap_or_default().to_string_lossy());
                eprintln!(" ========================================================================");
                eprintln!();
                return Err(format!("Permissão de Administrador necessária: {}", err).into());
            }
        };

        // Montar comando com flag interna --run-service
        let bin_path = format!("\"{}\" --run-service", exe_path_str);

        // Se o serviço já existe, desinstalar primeiro para atualizar o path
        if let Ok(existing) = manager.open_service(SERVICE_NAME, ServiceAccess::ALL_ACCESS) {
            println!("[Serviço] Serviço anterior detectado. Atualizando registro...");
            let _ = existing.delete();
            std::thread::sleep(Duration::from_millis(500));
        }

        // Criar o serviço via sc.exe para aplicar automaticamente DelayedAutoStart e FailureActions
        println!("==================================================");
        println!(" Instalando Windows Service: {}", SERVICE_DISPLAY_NAME);
        println!(" Caminho do Executável: {}", bin_path);
        println!("==================================================");

        let sc_create = Command::new("sc.exe")
            .args([
                "create",
                SERVICE_NAME,
                &format!("binPath= {}", bin_path),
                &format!("DisplayName= {}", SERVICE_DISPLAY_NAME),
                "start= auto",
            ])
            .output()?;

        if !sc_create.status.success() {
            let stderr = String::from_utf8_lossy(&sc_create.stderr);
            let stdout = String::from_utf8_lossy(&sc_create.stdout);
            eprintln!("[Erro SC Create] {}", if !stderr.is_empty() { stderr } else { stdout });
            return Err("Falha ao registrar serviço via sc.exe".into());
        }

        // Configurar Descrição
        let _ = Command::new("sc.exe")
            .args(["description", SERVICE_NAME, SERVICE_DESCRIPTION])
            .output();

        // Configurar Delayed-Auto (Automatic Delayed Start)
        let _ = Command::new("sc.exe")
            .args(["config", SERVICE_NAME, "start= delayed-auto"])
            .output();

        // Configurar Ações de Recuperação (Restart em 1ª, 2ª e falhas subsequentes após 5 segundos)
        let _ = Command::new("sc.exe")
            .args([
                "failure",
                SERVICE_NAME,
                "reset= 86400",
                "actions= restart/5000/restart/5000/restart/5000",
            ])
            .output();

        println!(" [OK] Serviço '{}' registrado com sucesso.", SERVICE_NAME);
        println!(" [OK] Tipo de inicialização: Automático (Atraso na Inicialização / Delayed Start)");
        println!(" [OK] Política de recuperação: Reiniciar automaticamente a cada falha.");

        // Iniciar o serviço imediatamente
        println!(" Iniciando serviço...");
        let sc_start = Command::new("sc.exe")
            .args(["start", SERVICE_NAME])
            .output()?;

        if sc_start.status.success() {
            println!(" [OK] Serviço '{}' iniciado com sucesso!", SERVICE_NAME);
        } else {
            let out = String::from_utf8_lossy(&sc_start.stdout);
            println!(" [Aviso] Solicitação de início enviada: {}", out.trim());
        }

        println!("==================================================");
        println!(" O Witiquetas Agent agora opera em segundo plano.");
        println!(" O serviço iniciará automaticamente ao ligar o computador.");
        println!("==================================================");

        Ok(())
    }

    /// Desinstala e remove o serviço do Windows
    pub fn uninstall_service() -> Result<(), Box<dyn Error>> {
        let manager = match ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT) {
            Ok(m) => m,
            Err(err) => {
                eprintln!();
                eprintln!(" [ERRO] Execute o terminal como Administrador para desinstalar o serviço.");
                return Err(format!("Permissão de Administrador necessária: {}", err).into());
            }
        };

        println!("Parando e removendo serviço '{}'...", SERVICE_NAME);

        // Parar via sc.exe
        let _ = Command::new("sc.exe").args(["stop", SERVICE_NAME]).output();
        std::thread::sleep(Duration::from_millis(500));

        let service = match manager.open_service(SERVICE_NAME, ServiceAccess::ALL_ACCESS) {
            Ok(s) => s,
            Err(_) => {
                // Fallback para sc delete
                let _ = Command::new("sc.exe").args(["delete", SERVICE_NAME]).output();
                println!(" [OK] Serviço '{}' removido.", SERVICE_NAME);
                return Ok(());
            }
        };

        service.delete()?;
        println!(" [OK] Serviço '{}' desinstalado com sucesso.", SERVICE_NAME);
        Ok(())
    }

    /// Consulta e exibe o status atual do serviço
    pub fn service_status() -> Result<(), Box<dyn Error>> {
        let output = Command::new("sc.exe")
            .args(["query", SERVICE_NAME])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        println!("==================================================");
        println!(" Status do Serviço Windows: {}", SERVICE_NAME);
        println!("==================================================");
        if stdout.contains("RUNNING") {
            println!(" Estado: EM EXECUÇÃO (RUNNING)");
        } else if stdout.contains("STOPPED") {
            println!(" Estado: PARADO (STOPPED)");
        } else if stdout.contains("PAUSED") {
            println!(" Estado: PAUSADO (PAUSED)");
        } else if stdout.contains("1060") || stdout.contains("FAILED") || stdout.contains("não existe") {
            println!(" Estado: NÃO INSTALADO");
        } else {
            println!("{}", stdout);
        }
        println!("==================================================");
        Ok(())
    }
}

#[cfg(not(windows))]
pub mod non_win {
    use super::*;

    pub fn run_service() -> Result<(), Box<dyn Error>> {
        Err("Execução como serviço nativo está disponível apenas no Windows.".into())
    }

    pub fn install_service() -> Result<(), Box<dyn Error>> {
        println!("Aviso: O comando --install-service destina-se a sistemas Windows.");
        Ok(())
    }

    pub fn uninstall_service() -> Result<(), Box<dyn Error>> {
        println!("Aviso: O comando --uninstall-service destina-se a sistemas Windows.");
        Ok(())
    }

    pub fn service_status() -> Result<(), Box<dyn Error>> {
        println!("Aviso: O comando --service-status destina-se a sistemas Windows.");
        Ok(())
    }
}

#[cfg(windows)]
pub use win::*;

#[cfg(not(windows))]
pub use non_win::*;
