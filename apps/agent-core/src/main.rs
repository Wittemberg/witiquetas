pub mod config;
pub mod identity;
pub mod payload;
pub mod protocol;
pub mod runtime;
pub mod transport;

use config::AgentConfig;
use runtime::AgentRuntime;
use std::env;
use transport::MemoryTransport;

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
        println!("  --single-run    Executa um único ciclo de polling e encerra.");
        println!("  -v, --version   Exibe a versão do Agent Core.");
        println!("  -h, --help      Exibe esta mensagem de ajuda.");
        println!();
        println!("VARIÁVEIS DE AMBIENTE:");
        println!("  WITIQUETAS_BACKEND_URL       URL base da API backend (ex: http://localhost:3000)");
        println!("  WITIQUETAS_AGENT_ID          ID único do agente local (ex: agent-matriz-01)");
        println!("  WITIQUETAS_AGENT_TOKEN       Token de autenticação do agente (Bearer agt_live_...)");
        println!("  WITIQUETAS_INSTALLATION_ID   ID de instalação gerado no pareamento");
        println!("  WITIQUETAS_CONFIG_PATH       Caminho para arquivo de configuração JSON (opcional)");
        println!("  WITIQUETAS_POLL_INTERVAL_SECS Intervalo de polling em segundos (5 a 300)");
        return Ok(());
    }

    let is_single_run = args.iter().any(|arg| arg == "--single-run") || env::var("WITIQUETAS_SINGLE_RUN").unwrap_or_default() == "1";

    let config = match AgentConfig::load_auto() {
        Ok(cfg) => cfg,
        Err(err) => {
            eprintln!("[Agent Startup Error] Falha de configuração: {}", err);
            eprintln!("Verifique as variáveis de ambiente (WITIQUETAS_BACKEND_URL, WITIQUETAS_AGENT_ID, WITIQUETAS_AGENT_TOKEN) ou use --help.");
            std::process::exit(1);
        }
    };

    let memory_transport = MemoryTransport::new();
    let mut runtime = match AgentRuntime::new(config, memory_transport) {
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

    runtime.run_continuous().await?;
    Ok(())
}
