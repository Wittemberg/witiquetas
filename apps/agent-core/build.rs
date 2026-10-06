//! Build script para `witiquetas-agent-core`
//!
//! Injeta metadados de compilação em tempo de build:
//! - WITIQUETAS_BUILD_COMMIT: Git commit hash (ou fallback se .git não estiver acessível)
//! - WITIQUETAS_BUILD_TIMESTAMP: Build timestamp UTC no padrão ISO 8601
//! - WITIQUETAS_BUILD_TARGET: Arquitetura de destino (via variável TARGET fornecida pelo Cargo)

use std::env;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    // 1. Re-run triggers
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=WITIQUETAS_BUILD_COMMIT");
    println!("cargo:rerun-if-env-changed=WITIQUETAS_BUILD_TIMESTAMP");
    println!("cargo:rerun-if-env-changed=SOURCE_DATE_EPOCH");

    // 2. Captura do Git Commit Hash
    let commit = resolve_git_commit();
    println!("cargo:rustc-env=WITIQUETAS_BUILD_COMMIT={}", commit);

    // 3. Captura do Build Timestamp (ISO 8601 UTC)
    let timestamp = resolve_build_timestamp();
    println!("cargo:rustc-env=WITIQUETAS_BUILD_TIMESTAMP={}", timestamp);

    // 4. Captura do Target Architecture (TARGET env var do Cargo)
    let target = env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=WITIQUETAS_BUILD_TARGET={}", target);
}

/// Resolve o commit hash git atual com fallback gracioso
fn resolve_git_commit() -> String {
    // Prioridade 1: Variável de ambiente explícita (útil para CI/CD sem .git completo)
    if let Ok(commit) = env::var("WITIQUETAS_BUILD_COMMIT") {
        let trimmed = commit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Ok(commit) = env::var("GIT_COMMIT") {
        let trimmed = commit.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // Prioridade 2: Tentar invocar `git rev-parse HEAD`
    let git_cmd = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output();

    if let Ok(output) = git_cmd {
        if output.status.success() {
            if let Ok(commit_str) = String::from_utf8(output.stdout) {
                let trimmed = commit_str.trim();
                if !trimmed.is_empty() {
                    // Tentar registrar gatilhos de re-execução do cargo para alterações no repositório git
                    register_git_rerun_triggers();
                    return trimmed.to_string();
                }
            }
        }
    }

    // Fallback gracioso quando .git não está disponível (ex.: release de tarball/archive)
    "unknown".to_string()
}

/// Registra gatilhos de rerun se o diretório .git for acessível
fn register_git_rerun_triggers() {
    if let Ok(output) = Command::new("git").args(["rev-parse", "--git-dir"]).output() {
        if output.status.success() {
            if let Ok(dir_str) = String::from_utf8(output.stdout) {
                let git_dir = Path::new(dir_str.trim());
                let head_file = git_dir.join("HEAD");
                if head_file.exists() {
                    println!("cargo:rerun-if-changed={}", head_file.display());
                }
            }
        }
    }
}

/// Resolve timestamp de compilação em ISO 8601 UTC
fn resolve_build_timestamp() -> String {
    // Prioridade 1: Variável WITIQUETAS_BUILD_TIMESTAMP explícita
    if let Ok(ts) = env::var("WITIQUETAS_BUILD_TIMESTAMP") {
        let trimmed = ts.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // Prioridade 2: Variável padronizada SOURCE_DATE_EPOCH (para builds reproduzíveis)
    if let Ok(epoch_str) = env::var("SOURCE_DATE_EPOCH") {
        if let Ok(secs) = epoch_str.trim().parse::<u64>() {
            return format_iso8601_utc(secs);
        }
    }

    // Prioridade 3: SystemTime atual
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    format_iso8601_utc(now)
}

/// Converte segundos desde a Unix Epoch (1970-01-01T00:00:00Z) para string ISO 8601 UTC.
/// Implementação pura em std sem dependências externas.
fn format_iso8601_utc(secs: u64) -> String {
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3600) % 24;
    let days = (secs / 86400) as i64;

    let (year, month, day) = days_to_civil(days);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

/// Algoritmo civil de Howard Hinnant para conversão de dias desde 1970-01-01 para (Ano, Mês, Dia).
fn days_to_civil(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_unix_epoch + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + (era * 400) as i32;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d)
}
