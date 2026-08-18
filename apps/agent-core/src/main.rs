pub mod config;
pub mod identity;
pub mod pairing;
pub mod payload;
pub mod protocol;
pub mod runtime;
pub mod transport;

use config::AgentConfig;
use runtime::AgentRuntime;
use std::env;
use transport::DynamicRouterTransport;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();

    if args.iter().any(|arg| arg == "--version" || arg == "-v") {
        println!("Witiquetas Agent Core v{}", config::CURRENT_AGENT_VERSION);
        return Ok(());
    }

    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("Witiquetas Print Runtime & Agent Core Headless");
        println!();
        println!("USO:");
        println!("  witiquetas-agent-core [OPÇÕES]");
        println!();
        println!("OPÇÕES:");
        println!("  --pair, --repair   Executa o assistente interativo para conectar à sua empresa.");
        println!("  --code <CÓDIGO>    Informa o código de pareamento diretamente via linha de comando.");
        println!("  --backend-url <URL> URL do servidor Witiquetas (padrão: https://witiquetas.wrtec.com.br).");
        println!("  --single-run       Executa um único ciclo de polling e encerra.");
        println!("  -v, --version      Exibe a versão do Agent Core.");
        println!("  -h, --help         Exibe esta mensagem de ajuda.");
        println!();
        println!("VARIÁVEIS DE AMBIENTE:");
        println!("  WITIQUETAS_BACKEND_URL       URL base da API backend");
        println!("  WITIQUETAS_AGENT_ID          ID único do agente local");
        println!("  WITIQUETAS_AGENT_TOKEN       Token de autenticação do agente");
        println!("  WITIQUETAS_CONFIG_PATH       Caminho personalizado para o arquivo de identidade local");
        return Ok(());
    }

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
