pub mod memory;
pub mod raw_tcp;

use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrinterTarget {
    pub printer_id: String,
    pub name: String,
    pub protocol: String,
    pub host: Option<String>,
    pub port: Option<u16>,
}

impl PrinterTarget {
    pub fn memory(name: impl Into<String>) -> Self {
        Self {
            printer_id: "prn-mem".to_string(),
            name: name.into(),
            protocol: "MEMORY".to_string(),
            host: None,
            port: None,
        }
    }

    pub fn tcp(name: impl Into<String>, host: impl Into<String>, port: u16) -> Self {
        Self {
            printer_id: "prn-tcp".to_string(),
            name: name.into(),
            protocol: "RAW_TCP".to_string(),
            host: Some(host.into()),
            port: Some(port),
        }
    }
}

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum TransportError {
    #[error("Destino inválido: {0}")]
    InvalidTarget(String),

    #[error("Falha de conexão com a impressora: {0}")]
    ConnectFailed(String),

    #[error("Tempo limite de conexão excedido: {0}")]
    ConnectTimeout(String),

    #[error("Falha de envio antes de qualquer byte ser transmitido: {0}")]
    WriteFailedBeforeAnyByte(String),

    #[error("Tempo limite de transmissão excedido: {0}")]
    WriteTimeout(String),

    #[error("Transmissão parcial ({bytes_written}/{total_bytes} bytes transmitidos): {message}")]
    PartialWrite {
        bytes_written: usize,
        total_bytes: usize,
        message: String,
    },

    #[error("Erro genérico de transporte: {0}")]
    Generic(String),
}

impl TransportError {
    /// Determina se o erro ocorreu após a transmissão de algum byte (> 0),
    /// configurando estado ambíguo (UNKNOWN_RESULT) para prevenir duplicação de etiquetas.
    pub fn is_ambiguous_partial_write(&self) -> bool {
        matches!(self, TransportError::PartialWrite { bytes_written, .. } if *bytes_written > 0)
    }
}

#[derive(Debug, Clone)]
pub struct TransportResult {
    pub bytes_written: usize,
    pub execution_time_ms: u64,
}

#[allow(async_fn_in_trait)]
pub trait PrinterTransport: Send + Sync {
    async fn send(&self, target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError>;
}

pub use memory::{MemoryPrintEvent, MemoryTransport};
pub use raw_tcp::RawTcpTransport;

/// Roteador dinâmico de transporte selecionando RAW_TCP vs MEMORY com base no protocolo do PrintJob
#[derive(Debug, Clone, Default)]
pub struct DynamicRouterTransport {
    pub memory: MemoryTransport,
    pub raw_tcp: RawTcpTransport,
}

impl DynamicRouterTransport {
    pub fn new() -> Self {
        Self {
            memory: MemoryTransport::new(),
            raw_tcp: RawTcpTransport::new(),
        }
    }

    pub fn with_timeouts(connect_timeout: Duration, write_timeout: Duration) -> Self {
        Self {
            memory: MemoryTransport::new(),
            raw_tcp: RawTcpTransport::with_timeouts(connect_timeout, write_timeout),
        }
    }
}

impl PrinterTransport for DynamicRouterTransport {
    async fn send(&self, target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError> {
        match target.protocol.to_uppercase().as_str() {
            "RAW_TCP" | "TCP" | "NETWORK" => {
                if target.host.is_some() {
                    self.raw_tcp.send(target, payload).await
                } else {
                    self.memory.send(target, payload).await
                }
            }
            "MEMORY" => self.memory.send(target, payload).await,
            _ => {
                if target.host.is_some() {
                    self.raw_tcp.send(target, payload).await
                } else {
                    self.memory.send(target, payload).await
                }
            }
        }
    }
}
