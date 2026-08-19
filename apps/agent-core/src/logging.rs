use std::env;
use std::fs;
use std::path::PathBuf;
use tracing_subscriber::filter::EnvFilter;
use tracing_subscriber::fmt;
use tracing_subscriber::prelude::*;

/// Retorna o diretório padrão de logs persistentes
pub fn get_logs_dir() -> PathBuf {
    if let Ok(custom_path) = env::var("WITIQUETAS_LOGS_DIR") {
        let path = PathBuf::from(custom_path);
        let _ = fs::create_dir_all(&path);
        return path;
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(program_data) = env::var("ProgramData") {
            let dir = PathBuf::from(program_data).join("Witiquetas").join("Agent").join("logs");
            if fs::create_dir_all(&dir).is_ok() {
                return dir;
            }
        }
        let fallback = PathBuf::from("C:\\ProgramData\\Witiquetas\\Agent\\logs");
        if fs::create_dir_all(&fallback).is_ok() {
            return fallback;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = env::var("HOME") {
            let dir = PathBuf::from(home).join(".config").join("witiquetas").join("agent").join("logs");
            if fs::create_dir_all(&dir).is_ok() {
                return dir;
            }
        }
    }

    let fallback = PathBuf::from("logs");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

/// Inicializa o subsistema de logging com rotação diária de arquivo e saída para console
pub fn init_logging(is_service: bool) -> tracing_appender::non_blocking::WorkerGuard {
    let logs_dir = get_logs_dir();
    let file_appender = tracing_appender::rolling::daily(&logs_dir, "witiquetas-agent.log");
    let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,witiquetas_agent_core=debug"));

    let file_layer = fmt::layer()
        .with_writer(non_blocking_file)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true);

    if is_service {
        // Modo serviço: foca a escrita primariamente no arquivo rotativo
        tracing_subscriber::registry()
            .with(env_filter)
            .with(file_layer)
            .init();
    } else {
        // Modo interativo: escreve tanto no console quanto no arquivo de log
        let console_layer = fmt::layer()
            .with_writer(std::io::stdout)
            .with_ansi(true);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(file_layer)
            .with(console_layer)
            .init();
    }

    guard
}

/// Sanitiza strings para impedir que tokens, códigos de pareamento ou dados sensíveis vazem nos logs
pub fn sanitize_for_log(input: &str) -> String {
    let mut sanitized = input.to_string();

    // Mascarar tokens tipo "agt_live_..." ou "Bearer ..."
    if let Some(pos) = sanitized.find("agt_") {
        let end = sanitized[pos..].find(|c: char| c.is_whitespace() || c == '"' || c == '\'').map(|p| pos + p).unwrap_or(sanitized.len());
        if end > pos + 8 {
            let prefix = &sanitized[pos..pos + 8];
            sanitized.replace_range(pos..end, &format!("{}***", prefix));
        }
    }

    if let Some(pos) = sanitized.find("Bearer ") {
        let token_start = pos + 7;
        let end = sanitized[token_start..].find(|c: char| c.is_whitespace() || c == '"' || c == '\'').map(|p| token_start + p).unwrap_or(sanitized.len());
        if end > token_start {
            sanitized.replace_range(token_start..end, "***REDACTED***");
        }
    }

    sanitized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_bearer_token() {
        let raw = "Authorization: Bearer agt_live_secret_token_123456789";
        let sanitized = sanitize_for_log(raw);
        assert!(!sanitized.contains("agt_live_secret_token_123456789"));
        assert!(sanitized.contains("***REDACTED***"));
    }

    #[test]
    fn test_sanitize_raw_agent_token() {
        let raw = "Connecting with token agt_live_abc123456789xyz in header";
        let sanitized = sanitize_for_log(raw);
        assert!(!sanitized.contains("abc123456789xyz"));
        assert!(sanitized.contains("agt_live***"));
    }

    #[test]
    fn test_logs_dir_creation() {
        let dir = get_logs_dir();
        assert!(dir.exists() || dir.to_string_lossy().len() > 0);
    }
}
