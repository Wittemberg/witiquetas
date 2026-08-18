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
/// O roteamento é estritamente Fail-Closed: nunca usa fallback silencioso de memória para destinos físicos inválidos.
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
                let host = target.host.as_deref().unwrap_or("").trim();
                if host.is_empty() {
                    Err(TransportError::InvalidTarget(
                        "Host/IP da impressora não informado para transporte RAW TCP".to_string(),
                    ))
                } else {
                    self.raw_tcp.send(target, payload).await
                }
            }
            "MEMORY" => self.memory.send(target, payload).await,
            other => Err(TransportError::InvalidTarget(format!(
                "Protocolo de transporte '{}' não suportado",
                other
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_router_raw_tcp_with_valid_host() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let payload = b"I8,A,001\nQ240,024\nP1\n";

        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = Vec::new();
            socket.read_to_end(&mut buf).await.unwrap();
            buf
        });

        let router = DynamicRouterTransport::new();
        let target = PrinterTarget {
            printer_id: "prn-01".to_string(),
            name: "Zebra Rede".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
        };

        let result = router.send(&target, payload).await;
        assert!(result.is_ok(), "RAW_TCP com host válido deve enviar com sucesso");
        let res = result.unwrap();
        assert_eq!(res.bytes_written, payload.len());

        let received = server_task.await.unwrap();
        assert_eq!(received, payload);
    }

    #[tokio::test]
    async fn test_router_raw_tcp_missing_host_fails_closed() {
        let router = DynamicRouterTransport::new();

        // Host None
        let target_none = PrinterTarget {
            printer_id: "prn-02".to_string(),
            name: "Zebra Sem Host".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: None,
            port: Some(9100),
        };
        let res_none = router.send(&target_none, b"test").await;
        assert!(
            matches!(res_none, Err(TransportError::InvalidTarget(_))),
            "RAW_TCP sem host deve retornar InvalidTarget (NUNCA MemoryTransport)"
        );

        // Host vazio / whitespace
        let target_empty = PrinterTarget {
            printer_id: "prn-03".to_string(),
            name: "Zebra Host Vazio".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("   ".to_string()),
            port: Some(9100),
        };
        let res_empty = router.send(&target_empty, b"test").await;
        assert!(
            matches!(res_empty, Err(TransportError::InvalidTarget(_))),
            "RAW_TCP com host em branco deve retornar InvalidTarget"
        );
    }

    #[tokio::test]
    async fn test_router_memory_protocol() {
        let router = DynamicRouterTransport::new();
        let target = PrinterTarget::memory("Impressora Virtual");

        let result = router.send(&target, b"MEMORY TEST").await;
        assert!(result.is_ok(), "protocol MEMORY deve usar MemoryTransport");
        let history = router.memory.get_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].payload, b"MEMORY TEST");
    }

    #[tokio::test]
    async fn test_router_unknown_protocol_with_host_fails_closed() {
        let router = DynamicRouterTransport::new();
        let target = PrinterTarget {
            printer_id: "prn-04".to_string(),
            name: "Impressora Bluetooth".to_string(),
            protocol: "BLUETOOTH".to_string(),
            host: Some("192.168.1.50".to_string()),
            port: Some(9100),
        };

        let result = router.send(&target, b"test").await;
        assert!(
            matches!(result, Err(TransportError::InvalidTarget(msg)) if msg.contains("não suportado")),
            "Protocolo desconhecido mesmo com host deve retornar InvalidTarget"
        );
    }

    #[tokio::test]
    async fn test_router_unknown_protocol_without_host_fails_closed() {
        let router = DynamicRouterTransport::new();
        let target = PrinterTarget {
            printer_id: "prn-05".to_string(),
            name: "Impressora Serial".to_string(),
            protocol: "SERIAL_RS232".to_string(),
            host: None,
            port: None,
        };

        let result = router.send(&target, b"test").await;
        assert!(
            matches!(result, Err(TransportError::InvalidTarget(msg)) if msg.contains("não suportado")),
            "Protocolo desconhecido sem host deve retornar InvalidTarget"
        );
    }
}
