use super::{PrinterTarget, PrinterTransport, TransportError, TransportResult};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct MemoryPrintEvent {
    pub printer_id: String,
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
    async fn send(&self, target: &PrinterTarget, payload: &[u8]) -> Result<TransportResult, TransportError> {
        let start = Instant::now();

        let event = MemoryPrintEvent {
            printer_id: target.printer_id.clone(),
            printer_name: target.name.clone(),
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

    #[tokio::test]
    async fn test_memory_transport_send_and_history() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP1\n";
        let target = PrinterTarget::memory("Impressora Elgin L42");

        let result = transport.send(&target, payload).await;
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

    #[tokio::test]
    async fn test_memory_transport_copy_strategy_embedded() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP5\n"; // 5 cópias já embutidas no payload
        let target = PrinterTarget::memory("Zebra ZD220");

        // Estratégia EMBEDDED_IN_PAYLOAD -> 1 envio físico
        let result = transport.send(&target, payload).await;
        assert!(result.is_ok());

        let history = transport.get_history();
        assert_eq!(history.len(), 1, "EMBEDDED_IN_PAYLOAD deve enviar exatamente 1 vez");
        assert_eq!(history[0].payload, payload);
    }

    #[tokio::test]
    async fn test_memory_transport_copy_strategy_transport_repeat() {
        let transport = MemoryTransport::new();
        let payload = b"I8,A,001\nQ240,024\nP1\n";
        let target = PrinterTarget::memory("Argox OS-214");
        let copies = 3;

        // Estratégia TRANSPORT_REPEAT -> N envios físicos
        for _ in 0..copies {
            let res = transport.send(&target, payload).await;
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
