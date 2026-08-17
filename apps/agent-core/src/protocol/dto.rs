use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHeartbeatRequestDTO {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHeartbeatResponseDTO {
    pub acknowledged: bool,
    pub server_time: String,
    pub pending_jobs_count: u64,
    pub poll_interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJobItemDTO {
    pub job_id: String,
    pub lease_id: String,
    pub attempt_id: String,
    pub printer_id: String,
    pub printer_name: String,
    pub protocol: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub serial_port: Option<String>,
    pub baud_rate: Option<u32>,
    pub spooler_name: Option<String>,
    pub language: String,
    pub encoding: String,
    pub payload: Option<String>,
    pub payload_base64: String,
    pub payload_bytes_length: usize,
    pub checksum_sha256: String,
    pub copy_strategy: String,
    pub copies: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingJobsResponseDTO {
    pub total: usize,
    pub jobs: Vec<PrintJobItemDTO>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePrintJobStatusRequestDTO {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_time_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePrintJobStatusResponseDTO {
    pub success: bool,
}
