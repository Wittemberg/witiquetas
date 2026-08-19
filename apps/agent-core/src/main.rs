use std::env;
use witiquetas_agent_core::config::{self, AgentConfig};
use witiquetas_agent_core::logging::init_logging;
use witiquetas_agent_core::pairing;
use witiquetas_agent_core::runtime::AgentRuntime;
use witiquetas_agent_core::service;
use witiquetas_agent_core::transport::DynamicRouterTransport;


#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    // 1. Despacho de Serviço Windows Control Manager (SCM)
    if args.iter().any(|arg| arg == "--run-service") {
        return service::run_service();
    }

    // 2. Comandos Administrativos de Gerenciamento do Windows Service
    if args.iter().any(|arg| arg == "--install-service") {
        return service::install_service();
    }

    if args.iter().any(|arg| arg == "--uninstall-service") {
        return service::uninstall_service();
    }

    if args.iter().any(|arg| arg == "--service-status") {
        return service::service_status();
    }

    // 3. Informações de Versão
    if args.iter().any(|arg| arg == "--version" || arg == "-v") {
        println!("Witiquetas Agent Core v{}", config::CURRENT_AGENT_VERSION);
        return Ok(());
    }

    // 4. Manual de Ajuda
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        print_help();
        return Ok(());
    }

    // Inicializar subsistema de logging no modo interativo
    let _log_guard = init_logging(false);

    let is_force_pair = args.iter().any(|arg| arg == "--pair" || arg == "--repair" || arg == "-p");
    let is_single_run = args.iter().any(|arg| arg == "--single-run") || env::var("WITIQUETAS_SINGLE_RUN").unwrap_or_default() == "1";

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

    // Se solicitado pareamento forçado ou fornecido código via flag
    if is_force_pair || custom_code.is_some() {
        let identity = match pairing::run_interactive_pairing(custom_backend_url, custom_code).await {
            Ok(id) => id,
            Err(err) => {
                eprintln!("[Pareamento] {}", err);
                std::process::exit(1);
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

    // Carregamento automático normal
    let config = match AgentConfig::load_auto() {
        Ok(cfg) => cfg,
        Err(config::ConfigError::MissingField(_)) => {
            // Primeira execução sem configuração prévia: inicia pareamento interativo automaticamente
            let identity = match pairing::run_interactive_pairing(custom_backend_url, None).await {
                Ok(id) => id,
                Err(err) => {
                    eprintln!("[Pareamento] {}", err);
                    std::process::exit(1);
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
            eprintln!("Não foi possível carregar a configuração do Agent: {}", err);
            eprintln!("Dica: Execute com --pair para realizar um novo pareamento.");
            std::process::exit(1);
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
    println!("  witiquetas-agent-windows-x64.exe [OPÇÕES]");
    println!();
    println!("GERENCIAMENTO DO SERVIÇO WINDOWS (Requer Administrador):");
    println!("  --install-service     Instala e inicia como Windows Service automático permanente.");
    println!("  --uninstall-service   Para e remove o Windows Service do sistema.");
    println!("  --service-status      Consulta o status atual do serviço no Windows Service Manager.");
    println!();
    println!("PAREAMENTO E OPERAÇÃO:");
    println!("  --pair, --repair      Inicia o assistente para conectar ou reconectar o computador.");
    println!("  --code <CÓDIGO>       Informa o código de pareamento diretamente (ex: WIT-7K4P-92MX).");
    println!("  --backend-url <URL>   Sobrescreve a URL do servidor Witiquetas.");
    println!("  --single-run          Executa um único ciclo de polling e encerra com diagnóstico.");
    println!("  -v, --version         Exibe a versão do Agent.");
    println!("  -h, --help            Exibe esta mensagem de ajuda.");
    println!();
    println!("LOCAIS DE ARMAZENAMENTO PADRÃO:");
    println!("  Identidade:           %ProgramData%\\Witiquetas\\Agent\\identity.json");
    println!("  Logs Rotativos:       %ProgramData%\\Witiquetas\\Agent\\logs\\witiquetas-agent.log");
    println!("================================================================");
}

async fn start_agent_runtime(config: AgentConfig, is_single_run: bool) -> Result<(), Box<dyn std::error::Error>> {
    println!("--------------------------------------------------");
    println!(" Witiquetas Agent v{}", config.agent_version);
    println!(" Computador: {}", config.machine_name);
    println!(" Status: Conectado");
    println!(" Backend: {}", config.backend_url);
    println!(" Aguardando trabalhos de impressão...");
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
