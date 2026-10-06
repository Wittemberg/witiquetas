use std::env;
use witiquetas_agent_core::config::{self, AgentConfig};
use witiquetas_agent_core::diagnostics;
use witiquetas_agent_core::logging::init_logging;
use witiquetas_agent_core::output::*;
use witiquetas_agent_core::pairing::{self, PairingRequest};
use witiquetas_agent_core::runtime::AgentRuntime;
use witiquetas_agent_core::service;
use witiquetas_agent_core::transport::DynamicRouterTransport;
use witiquetas_agent_core::version;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let is_json = args.iter().any(|arg| arg == "--json");

    // 1. Despacho direto do Windows Service Control Manager (SCM)
    if args.iter().any(|arg| arg == "--run-service") {
        return service::run_service();
    }

    // 2. Extração de parâmetros de linha de comando
    let mut custom_backend_url = None;
    let mut custom_code = None;
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--backend-url" && i + 1 < args.len() {
            custom_backend_url = Some(args[i + 1].clone());
            i += 1;
        } else if args[i] == "--code" && i + 1 < args.len() {
            custom_code = Some(args[i + 1].clone());
            i += 1;
        }
        i += 1;
    }

    // 3. Informações de Versão & Build Metadata
    if args.iter().any(|arg| arg == "--version" || arg == "version" || arg == "-v") {
        let version_info = version::get_version_info();
        if is_json {
            StructuredResponse::ok(version_info).print_and_exit(EXIT_SUCCESS);
        } else {
            println!("{}", version_info.to_human_string());
            return Ok(());
        }
    }

    // 4. Diagnóstico Não-Destrutivo do Sistema
    if args.iter().any(|arg| arg == "--diagnostics" || arg == "diagnostics") {
        let report = diagnostics::run_diagnostics(custom_backend_url.as_deref()).await;
        if is_json {
            StructuredResponse::ok(report).print_and_exit(EXIT_SUCCESS);
        } else {
            println!("{}", report.format_human());
            return Ok(());
        }
    }

    // 5. Gerenciamento do Serviço (Windows Service)
    if args.iter().any(|arg| arg == "--service-status" || arg == "service-status") {
        match service::service_status() {
            Ok(info) => {
                if is_json {
                    StructuredResponse::ok(info).print_and_exit(EXIT_SUCCESS);
                } else {
                    println!("==================================================");
                    println!(" Status do Serviço: {}", info.service_name);
                    println!("==================================================");
                    println!(" Nome de Exibição: {}", info.display_name);
                    println!(" Instalado:        {}", if info.installed { "Sim" } else { "Não" });
                    println!(" Estado:           {}", info.state);
                    if let Some(ref bp) = info.binary_path {
                        println!(" Binário:          {}", bp);
                    }
                    if let Some(ref st) = info.start_type {
                        println!(" Tipo Início:      {}", st);
                    }
                    if let Some(delayed) = info.is_delayed_auto_start {
                        println!(" Delayed Auto:     {}", if delayed { "Sim" } else { "Não" });
                    }
                    println!("==================================================");
                    return Ok(());
                }
            }
            Err(err) => {
                if is_json {
                    StructuredResponse::err("SCM_QUERY_FAILED", err.to_string(), EXIT_SCM_ERROR)
                        .print_and_exit(EXIT_SCM_ERROR);
                } else {
                    eprintln!("Erro ao consultar serviço: {}", err);
                    std::process::exit(EXIT_SCM_ERROR);
                }
            }
        }
    }

    if args.iter().any(|arg| arg == "--install-service" || arg == "install-service") {
        match service::install_service() {
            Ok(res) => {
                if is_json {
                    let code = if res.success { EXIT_SUCCESS } else { EXIT_SCM_ERROR };
                    StructuredResponse::ok(res).print_and_exit(code);
                } else {
                    println!("{}", res.message);
                    if let Some(ref d) = res.details {
                        println!(" Detalhes: {}", d);
                    }
                    return Ok(());
                }
            }
            Err(err) => {
                let err_msg = err.to_string();
                let code = if err_msg.to_lowercase().contains("permissão") || err_msg.to_lowercase().contains("administrador") {
                    EXIT_PERMISSION_DENIED
                } else {
                    EXIT_SCM_ERROR
                };
                if is_json {
                    StructuredResponse::err("SERVICE_INSTALL_FAILED", err_msg, code).print_and_exit(code);
                } else {
                    eprintln!("Erro ao instalar serviço: {}", err_msg);
                    std::process::exit(code);
                }
            }
        }
    }

    if args.iter().any(|arg| arg == "--uninstall-service" || arg == "uninstall-service") {
        match service::uninstall_service() {
            Ok(res) => {
                if is_json {
                    let code = if res.success { EXIT_SUCCESS } else { EXIT_SCM_ERROR };
                    StructuredResponse::ok(res).print_and_exit(code);
                } else {
                    println!("{}", res.message);
                    return Ok(());
                }
            }
            Err(err) => {
                let err_msg = err.to_string();
                let code = if err_msg.to_lowercase().contains("permissão") || err_msg.to_lowercase().contains("administrador") {
                    EXIT_PERMISSION_DENIED
                } else {
                    EXIT_SCM_ERROR
                };
                if is_json {
                    StructuredResponse::err("SERVICE_UNINSTALL_FAILED", err_msg, code).print_and_exit(code);
                } else {
                    eprintln!("Erro ao desinstalar serviço: {}", err_msg);
                    std::process::exit(code);
                }
            }
        }
    }

    // 6. Despareamento Seguro (Unpair)
    if args.iter().any(|arg| arg == "--unpair" || arg == "unpair") {
        match pairing::unpair() {
            Ok(res) => {
                if is_json {
                    StructuredResponse::ok(res).print_and_exit(EXIT_SUCCESS);
                } else {
                    if res.removed {
                        println!("[OK] Identidade do Agent removida com sucesso (Arquivo: {})", res.path);
                    } else {
                        println!("[Aviso] Nenhuma identidade estava registrada em {}", res.path);
                    }
                    return Ok(());
                }
            }
            Err(err) => {
                if is_json {
                    StructuredResponse::err("UNPAIR_FAILED", err.to_string(), EXIT_GENERAL_ERROR)
                        .print_and_exit(EXIT_GENERAL_ERROR);
                } else {
                    eprintln!("[Erro] Falha ao desparear: {}", err);
                    std::process::exit(EXIT_GENERAL_ERROR);
                }
            }
        }
    }

    // 7. Manual de Ajuda
    if args.iter().any(|arg| arg == "--help" || arg == "help" || arg == "-h") {
        print_help();
        return Ok(());
    }

    let is_pair_cmd = args.iter().any(|arg| arg == "--pair" || arg == "pair" || arg == "--repair" || arg == "repair" || arg == "-p");

    // 8. Pareamento Headless (--json)
    if is_json && (is_pair_cmd || custom_code.is_some()) {
        let code = match custom_code {
            Some(c) => c,
            None => {
                StructuredResponse::err(
                    "MISSING_CODE",
                    "O parâmetro --code <CÓDIGO> é obrigatório no pareamento automatizado (--json)",
                    EXIT_INVALID_ARGS,
                )
                .print_and_exit(EXIT_INVALID_ARGS);
            }
        };

        let req = PairingRequest {
            pairing_code: code,
            backend_url: custom_backend_url,
            machine_name: None,
        };

        match pairing::execute_pairing(req).await {
            Ok(ident) => {
                StructuredResponse::ok(ident).print_and_exit(EXIT_SUCCESS);
            }
            Err(err) => {
                let (code_str, exit_code) = match &err {
                    pairing::PairingError::InvalidCode(_) => ("INVALID_CODE", EXIT_INVALID_ARGS),
                    pairing::PairingError::ExpiredCode => ("CODE_EXPIRED", EXIT_AUTH_PAIRING),
                    pairing::PairingError::AlreadyUsed => ("CODE_ALREADY_USED", EXIT_AUTH_PAIRING),
                    pairing::PairingError::RateLimited => ("RATE_LIMITED", EXIT_AUTH_PAIRING),
                    pairing::PairingError::ServerRejected(_) => ("AUTH_REJECTED", EXIT_AUTH_PAIRING),
                    pairing::PairingError::Network(_) => ("NETWORK_ERROR", EXIT_NETWORK_ERROR),
                    _ => ("INTERNAL_ERROR", EXIT_GENERAL_ERROR),
                };
                StructuredResponse::err(code_str, err.to_string(), exit_code).print_and_exit(exit_code);
            }
        }
    }

    // 9. Inicializar logging interativo se não for JSON
    let _log_guard = if !is_json { Some(init_logging(false)) } else { None };

    let is_single_run = args.iter().any(|arg| arg == "--single-run") || env::var("WITIQUETAS_SINGLE_RUN").unwrap_or_default() == "1";

    // 10. Pareamento Interativo no Terminal
    if is_pair_cmd || custom_code.is_some() {
        let identity = match pairing::run_interactive_pairing(custom_backend_url, custom_code).await {
            Ok(id) => id,
            Err(err) => {
                eprintln!("[Pareamento] {}", err);
                std::process::exit(EXIT_AUTH_PAIRING);
            }
        };

        let mut config = AgentConfig::default_empty();
        config.backend_url = identity.backend_url;
        config.agent_id = identity.agent_id;
        config.installation_id = identity.installation_id;
        config.token = identity.token;
        config.machine_name = identity.machine_name;
        config.validate()?;

        return start_agent_runtime(config, is_single_run).await;
    }

    // 11. Carregamento da Configuração Local
    let config = match AgentConfig::load_auto() {
        Ok(cfg) => cfg,
        Err(config::ConfigError::MissingField(_)) => {
            if is_json {
                StructuredResponse::err(
                    "NOT_PAIRED",
                    "Agent não está pareado neste computador. Execute pareamento prévio com --pair --code ...",
                    EXIT_AUTH_PAIRING,
                )
                .print_and_exit(EXIT_AUTH_PAIRING);
            }

            // Primeira execução interativa: inicia pareamento guiado automaticamente
            let identity = match pairing::run_interactive_pairing(custom_backend_url, None).await {
                Ok(id) => id,
                Err(err) => {
                    eprintln!("[Pareamento] {}", err);
                    std::process::exit(EXIT_AUTH_PAIRING);
                }
            };

            let mut config = AgentConfig::default_empty();
            config.backend_url = identity.backend_url;
            config.agent_id = identity.agent_id;
            config.installation_id = identity.installation_id;
            config.token = identity.token;
            config.machine_name = identity.machine_name;
            config.validate()?;
            config
        }
        Err(err) => {
            if is_json {
                StructuredResponse::err("CONFIG_ERROR", err.to_string(), EXIT_GENERAL_ERROR)
                    .print_and_exit(EXIT_GENERAL_ERROR);
            }
            eprintln!("Não foi possível carregar a configuração do Agent: {}", err);
            eprintln!("Dica: Execute com --pair para realizar um novo pareamento.");
            std::process::exit(EXIT_GENERAL_ERROR);
        }
    };

    start_agent_runtime(config, is_single_run).await
}

fn print_help() {
    println!("================================================================");
    println!(" Witiquetas Print Runtime & Windows Service (v{})", config::CURRENT_AGENT_VERSION);
    println!("================================================================");
    println!();
    println!("USO:");
    println!("  witiquetas-agent.exe [COMANDO | OPÇÕES]");
    println!();
    println!("OPERAÇÕES DE SERVIÇO (Requer Administrador):");
    println!("  --install-service     Instala e inicia como Windows Service (Delayed Auto-Start).");
    println!("  --uninstall-service   Para e remove o Windows Service do sistema.");
    println!("  --service-status      Consulta o status atual no Service Control Manager (SCM).");
    println!();
    println!("PAREAMENTO E OPERAÇÃO:");
    println!("  --pair, --repair      Inicia assistente de pareamento.");
    println!("  --code <CÓDIGO>       Informa código de pareamento (ex: WIT-7K4P-92MX).");
    println!("  --unpair              Remove a identidade local com segurança.");
    println!("  --diagnostics         Executa diagnóstico seguro não-destrutivo do sistema.");
    println!("  --backend-url <URL>   Sobrescreve URL do servidor Witiquetas.");
    println!("  --single-run          Executa um único ciclo de polling e finaliza.");
    println!("  --json                Emite saída estritamente em formato JSON estruturado.");
    println!("  -v, --version         Exibe versão semântica e metadados de compilação.");
    println!("  -h, --help            Exibe este manual.");
    println!();
    println!("LOCAIS DE DADOS PADRÃO (PROGRAMDATA):");
    println!("  Identidade:           %ProgramData%\\Witiquetas\\Agent\\identity.json");
    println!("  Logs Rotativos:       %ProgramData%\\Witiquetas\\Agent\\logs\\witiquetas-agent.log");
    println!("================================================================");
}

async fn start_agent_runtime(config: AgentConfig, is_single_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    println!("--------------------------------------------------");
    println!(" Witiquetas Agent de Impressão (v{})", config.agent_version);
    println!(" Identidade existente encontrada.");
    println!(" Agent ID:    {}", config.agent_id);
    println!(" Computador:  {}", config.machine_name);
    println!(" Backend:     {}", config.backend_url);
    println!(" Status:      Conectando...");
    println!();
    println!(" Para realizar novo pareamento, execute com --pair.");
    println!("--------------------------------------------------");

    let router_transport = DynamicRouterTransport::new();
    let mut runtime = match AgentRuntime::new(config, router_transport) {
        Ok(rt) => rt,
        Err(err) => {
            eprintln!("[Agent Runtime Error] Falha ao inicializar runtime: {}", err);
            std::process::exit(1);
        }
    };

    if is_single_run {
        runtime.initialize().await?;
        let processed = runtime.execute_cycle().await?;
        println!("[Agent Single-Run] Ciclo concluído. {} job(s) processado(s).", processed);
        return Ok(());
    }

    match runtime.run_continuous().await {
        Ok(()) => Ok(()),
        Err(err) => {
            let err_str = err.to_string();
            if err_str.contains("401") || err_str.contains("403") {
                eprintln!();
                eprintln!(" [Segurança] Este Agent não está mais autorizado no servidor.");
                eprintln!(" Para reconectar este computador, execute:");
                eprintln!("   witiquetas-agent.exe --pair");
                eprintln!();
                std::process::exit(1);
            }
            eprintln!("[Agent Erro] {}", err);
            Err(err.into())
        }
    }
}
