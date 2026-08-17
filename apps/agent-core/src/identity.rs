use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub agent_id: String,
    pub installation_id: String,
    pub machine_name: String,
    pub os: String,
    pub architecture: String,
    pub agent_version: String,
}

impl AgentIdentity {
    pub fn new(agent_id: String, installation_id: String, machine_name: String, agent_version: String) -> Self {
        Self {
            agent_id,
            installation_id,
            machine_name,
            os: env::consts::OS.to_string(),
            architecture: env::consts::ARCH.to_string(),
            agent_version,
        }
    }
}
