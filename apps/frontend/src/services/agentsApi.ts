import type {
  AgentDTO,
  GeneratePairingCodeResponseDTO,
  PairingStatusResponseDTO,
} from '@witiquetas/contracts';
import { getCsrfToken } from '../auth/session.js';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errMsg = `Erro ${res.status}: ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {}
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

export type PairingCodeResponse = GeneratePairingCodeResponseDTO;

export const agentsApi = {
  async listAgents(): Promise<AgentDTO[]> {
    const data = await request<{ total?: number; agents?: AgentDTO[] }>('/api/agents');
    return data.agents || [];
  },

  async generatePairingCode(): Promise<PairingCodeResponse> {
    return request<PairingCodeResponse>('/api/agents/generate-pairing-code', {
      method: 'POST',
    });
  },

  async getPairingStatus(code: string): Promise<PairingStatusResponseDTO> {
    return request<PairingStatusResponseDTO>(`/api/agents/pairing-status/${encodeURIComponent(code)}`);
  },

  async revokeAgent(agentId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/agents/${encodeURIComponent(agentId)}/revoke`, {
      method: 'POST',
    });
  },
};
