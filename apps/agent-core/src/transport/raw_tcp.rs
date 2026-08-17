use super::{PrinterTarget, PrinterTransport, TransportError, TransportResult};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;

/// Transporte físico TCP RAW (Porta padrão 9100 / JetDirect / RAW Socket)
/// Transmite bytes opacos exatamente como recebidos (INPUT BYTES == NETWORK BYTES).
#[derive(Debug, Clone)]
pub struct RawTcpTransport {
    pub connect_timeout: Duration,
    pub write_timeout: Duration,
}

impl Default for RawTcpTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl RawTcpTransport {
    pub fn new() -> Self {
        Self {
            connect_timeout: Duration::from_secs(4),
            write_timeout: Duration::from_secs(5),
        }
    }

    pub fn with_timeouts(connect_timeout: Duration, write_timeout: Duration) -> Self {
        Self {
            connect_timeout,
            write_timeout,
        }
    }
}

impl PrinterTransport for RawTcpTransport {
    async fn send(&self, target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError> {
        let start = Instant::now();

        // 1. Validação defensiva de destino
        let host = target.host.as_deref().unwrap_or("").trim();
        if host.is_empty() {
            return Err(TransportError::InvalidTarget(
                "Host/IP da impressora não informado para transporte RAW TCP".to_string(),
            ));
        }

        let port = target.port.unwrap_or(9100);
        if port == 0 {
            return Err(TransportError::InvalidTarget(
                "Porta TCP inválida (porta 0 não é permitida)".to_string(),
            ));
        }

        let addr = format!("{}:{}", host, port);

        // 2. Conexão TCP com Timeout configurado
        let connect_fut = TcpStream::connect(&addr);
        let mut stream = match tokio::time::timeout(self.connect_timeout, connect_fut).await {
            Err(_) => {
                return Err(TransportError::ConnectTimeout(format!(
                    "Tempo limite de conexão ({:?}) excedido ao conectar em {}",
                    self.connect_timeout, addr
                )));
            }
            Ok(Err(e)) => {
                return Err(TransportError::ConnectFailed(format!(
                    "Falha ao estabelecer conexão TCP com {}: {}",
                    addr, e
                )));
            }
            Ok(Ok(s)) => s,
        };

        // 3. Transmissão sequencial de bytes com proteção contra escrita parcial
        let mut total_written = 0usize;
        let total_bytes = payload.len();

        while total_written < total_bytes {
            let write_fut = stream.write(&payload[total_written..]);
            match tokio::time::timeout(self.write_timeout, write_fut).await {
                Err(_) => {
                    if total_written > 0 {
                        return Err(TransportError::PartialWrite {
                            bytes_written: total_written,
                            total_bytes,
                            message: format!(
                                "Tempo limite de transmissão excedido após enviar {} de {} bytes para {}",
                                total_written, total_bytes, addr
                            ),
                        });
                    } else {
                        return Err(TransportError::WriteTimeout(format!(
                            "Tempo limite de transmissão excedido antes do envio de qualquer byte para {}",
                            addr
                        )));
                    }
                }
                Ok(Err(e)) => {
                    if total_written > 0 {
                        return Err(TransportError::PartialWrite {
                            bytes_written: total_written,
                            total_bytes,
                            message: format!(
                                "Erro de I/O após enviar {} de {} bytes para {}: {}",
                                total_written, total_bytes, addr, e
                            ),
                        });
                    } else {
                        return Err(TransportError::WriteFailedBeforeAnyByte(format!(
                            "Erro de I/O na transmissão para {}: {}",
                            addr, e
                        )));
                    }
                }
                Ok(Ok(0)) => {
                    if total_written > 0 {
                        return Err(TransportError::PartialWrite {
                            bytes_written: total_written,
                            total_bytes,
                            message: format!(
                                "Conexão encerrada prematuramente pelo destino após {} de {} bytes para {}",
                                total_written, total_bytes, addr
                            ),
                        });
                    } else {
                        return Err(TransportError::WriteFailedBeforeAnyByte(format!(
                            "Conexão encerrada pelo destino antes de receber qualquer byte em {}",
                            addr
                        )));
                    }
                }
                Ok(Ok(n)) => {
                    total_written += n;
                }
            }
        }

        // 4. Flush e Shutdown gracioso da conexão
        if let Err(e) = stream.flush().await {
            return Err(TransportError::PartialWrite {
                bytes_written: total_written,
                total_bytes,
                message: format!("Falha no flush TCP para {}: {}", addr, e),
            });
        }

        let _ = stream.shutdown().await;

        let elapsed = start.elapsed().as_millis() as u64;

        Ok(TransportResult {
            bytes_written: total_written,
            execution_time_ms: elapsed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn test_raw_tcp_send_exact_bytes_to_fake_server() {
        // 1. Iniciar servidor TCP efêmero local
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let local_addr = listener.local_addr().unwrap();

        let payload = b"I8,A,001\nQ240,024\nP1\n";

        // Task receptora que captura os bytes
        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = Vec::new();
            socket.read_to_end(&mut buf).await.unwrap();
            buf
        });

        // 2. Executar RawTcpTransport
        let transport = RawTcpTransport::new();
        let target = PrinterTarget {
            printer_id: "prn-01".to_string(),
            name: "Zebra ZD220 Rede".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(local_addr.port()),
        };

        let result = transport.send(&target, payload).await;
        assert!(result.is_ok(), "Envio TCP deve ter sucesso");
        let res = result.unwrap();
        assert_eq!(res.bytes_written, payload.len());

        let received = server_task.await.unwrap();
        assert_eq!(received, payload, "Bytes recebidos no servidor devem ser idênticos byte a byte");
    }

    #[tokio::test]
    async fn test_raw_tcp_binary_payload_preservation() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();

        // Bytes contendo 0x00, STX 0x02, CR 0x0D, 0x80, 0xFF
        let binary_payload = vec![0x00, 0x02, b'O', b'0', b'2', b'2', b'0', 0x0D, 0x80, 0xFF];

        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = Vec::new();
            socket.read_to_end(&mut buf).await.unwrap();
            buf
        });

        let transport = RawTcpTransport::new();
        let target = PrinterTarget {
            printer_id: "prn-binary".to_string(),
            name: "Argox PPLA".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
        };

        let result = transport.send(&target, &binary_payload).await;
        assert!(result.is_ok());

        let received = server_task.await.unwrap();
        assert_eq!(received, binary_payload, "Payload binário não pode sofrer alteração ou conversão");
    }

    #[tokio::test]
    async fn test_raw_tcp_invalid_target_validation() {
        let transport = RawTcpTransport::new();

        // Host vazio
        let target_no_host = PrinterTarget {
            printer_id: "prn-02".to_string(),
            name: "Sem IP".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: None,
            port: Some(9100),
        };
        let err_no_host = transport.send(&target_no_host, b"test").await;
        assert!(matches!(err_no_host, Err(TransportError::InvalidTarget(_))));

        // Porta 0
        let target_port_zero = PrinterTarget {
            printer_id: "prn-03".to_string(),
            name: "Porta Zero".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("192.168.1.100".to_string()),
            port: Some(0),
        };
        let err_port_zero = transport.send(&target_port_zero, b"test").await;
        assert!(matches!(err_port_zero, Err(TransportError::InvalidTarget(_))));
    }

    #[tokio::test]
    async fn test_raw_tcp_connection_refused() {
        let transport = RawTcpTransport::with_timeouts(Duration::from_millis(500), Duration::from_millis(500));

        // Porta improvável de estar em escuta
        let target = PrinterTarget {
            printer_id: "prn-refused".to_string(),
            name: "Offline".to_string(),
            protocol: "RAW_TCP".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(59999),
        };

        let result = transport.send(&target, b"test").await;
        assert!(matches!(result, Err(TransportError::ConnectFailed(_)) | Err(TransportError::ConnectTimeout(_))));
        if let Err(e) = result {
            assert!(!e.is_ambiguous_partial_write(), "Falha de conexão não é ambígua (0 bytes entregues)");
        }
    }

    #[test]
    fn test_partial_write_error_classification() {
        let partial_err = TransportError::PartialWrite {
            bytes_written: 500,
            total_bytes: 1000,
            message: "Conexão interrompida".to_string(),
        };
        assert!(partial_err.is_ambiguous_partial_write(), "PartialWrite com bytes > 0 é ambíguo (UNKNOWN_RESULT)");

        let connect_err = TransportError::ConnectFailed("Connection refused".to_string());
        assert!(!connect_err.is_ambiguous_partial_write(), "ConnectFailed é 0 bytes e deve reportar FAILED");

        let zero_byte_err = TransportError::WriteFailedBeforeAnyByte("Error".to_string());
        assert!(!zero_byte_err.is_ambiguous_partial_write(), "0 bytes antes do envio é seguro para FAILED");
    }
}
