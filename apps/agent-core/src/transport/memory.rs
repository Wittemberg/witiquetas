use thiserror::Error;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Error, Debug)]
pub enum TransportError {
    #[error("Erro de conexão com impressora: {0}")]
    ConnectionError(String),
    #[error("Erro de transmissão de bytes: {0}")]
    TransmissionError(String),
    #[error("Tempo limite excedido na impressora: {0}")]
    TimeoutError(String),
}

#[derive(Debug, Clone)]
pub struct TransportResult {
    pub bytes_written: usize,
    pub execution_time_ms: u64,
}

pub trait PrinterTransport: Send + Sync {
    fn send(&self, printer_name: &str, payload: &[u8]) -> Result<TransportResult, TransportError>;
}

#[derive(Debug, Clone)]
pub struct MemoryPrintEvent {
    pub printer_name: String,
    pub payload: Vec<u8>,
    pub timestamp: std::time::SystemTime,
}

#[derive(Debug, Clone, Default)]
pub struct MemoryTransport {
    history: Arc<Mutex<Vec<MemoryPrintEvent>>>,
}

impl MemoryTransport {
    pub fn new() -> Self {
        Self {
            history: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn get_history(&self) -> Vec<MemoryPrintEvent> {
        let guard = self.history.lock().unwrap();
        guard.clone()
    }

    pub fn clear(&self) {
        let mut guard = self.history.lock().unwrap();
        guard.clear();
    }
}

impl PrinterTransport for MemoryTransport {
    fn send(&self, printer_name: &str, payload: &[u8]) -> Result<TransportResult, TransportError> {
        let start = Instant::now();

        let event = MemoryPrintEvent {
            printer_name: printer_name.to_string(),
            payload: payload.to_vec(),
            timestamp: std::time::SystemTime::now(),
        };

        {
            let mut guard = self.history.lock().unwrap();
            guard.push(event);
        }

        let elapsed = start.elapsed().as_millis() as u64;

        Ok(TransportResult {
            bytes_written: payload.len(),
            execution_time_ms: elapsed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_transport_send_and_history() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP1\n";

        let result = transport.send("Impressora Elgin L42", payload);
        assert!(result.is_ok());
        let res = result.unwrap();
        assert_eq!(res.bytes_written, payload.len());

        let history = transport.get_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].printer_name, "Impressora Elgin L42");
        assert_eq!(history[0].payload, payload);

        transport.clear();
        assert_eq!(transport.get_history().len(), 0);
    }

    #[test]
    fn test_memory_transport_copy_strategy_embedded() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP5\n"; // 5 cópias já embutidas no payload

        // Estratégia EMBEDDED_IN_PAYLOAD -> 1 envio físico
        let result = transport.send("Zebra ZD220", payload);
        assert!(result.is_ok());

        let history = transport.get_history();
        assert_eq!(history.len(), 1, "EMBEDDED_IN_PAYLOAD deve enviar exatamente 1 vez");
        assert_eq!(history[0].payload, payload);
    }

    #[test]
    fn test_memory_transport_copy_strategy_transport_repeat() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP1\n";
        let copies = 3;

        // Estratégia TRANSPORT_REPEAT -> N envios físicos
        for _ in 0..copies {
            let res = transport.send("Argox OS-214", payload);
            assert!(res.is_ok());
        }

        let history = transport.get_history();
        assert_eq!(history.len(), 3, "TRANSPORT_REPEAT com 3 cópias deve enviar 3 vezes");
        for event in history {
            assert_eq!(event.payload, payload, "Cada repetição deve conter os bytes exatos");
            assert_eq!(event.printer_name, "Argox OS-214");
        }
    }
}


