import type { AgentDTO } from '@witiquetas/contracts';
import { build_api_url } from '../config/api.js';

export const agentsApi = {
  async listAgents(): Promise<AgentDTO[]> {
    try {
      const res = await fetch(build_api_url('/api/agents'));
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return data.agents || [];
    } catch {
      return [];
    }
  },
};
