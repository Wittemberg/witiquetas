import type {
  DevelopmentOverviewDTO,
  DevelopmentPhase,
  DevelopmentCheckpoint,
  DevelopmentModuleProgress,
  ProjectHealthOverview,
} from '@witiquetas/contracts';

export const isDevControlCenterEnabled = (): boolean => {
  if (import.meta.env.MODE === 'development') return true;
  if (import.meta.env.VITE_ENABLE_DEV_CONTROL_CENTER === 'true') return true;
  if (import.meta.env.VITE_APP_MODE === 'development') return true;
  return false;
};

export const devControlApi = {
  checkDeveloperAuth: async (): Promise<{ authenticated: boolean; username?: string }> => {
    try {
      const res = await fetch('/api/development-control/auth/me', { credentials: 'include' });
      if (!res.ok) return { authenticated: false };
      return res.json();
    } catch {
      return { authenticated: false };
    }
  },

  developerLogin: async (username: string, code: string): Promise<{ success: boolean; username?: string; error?: string; code?: string }> => {
    const res = await fetch('/api/development-control/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Erro de autenticação (HTTP ${res.status}).`);
    }
    return data;
  },

  developerLogout: async (): Promise<void> => {
    await fetch('/api/development-control/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  },

  getOverview: async (): Promise<DevelopmentOverviewDTO> => {
    const res = await fetch('/api/development-control/overview', { credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.error || `Falha ao carregar visão geral do DCC (HTTP ${res.status}).`);
      (err as any).status = res.status;
      (err as any).code = errData.code;
      throw err;
    }
    return res.json();
  },

  getRoadmap: async (): Promise<{ phases: DevelopmentPhase[] }> => {
    const res = await fetch('/api/development-control/roadmap', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Falha ao carregar roadmap (HTTP ${res.status}).`);
    }
    return res.json();
  },

  getCheckpoints: async (): Promise<{ checkpoints: DevelopmentCheckpoint[] }> => {
    const res = await fetch('/api/development-control/checkpoints', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Falha ao carregar checkpoints (HTTP ${res.status}).`);
    }
    return res.json();
  },

  getModules: async (): Promise<{ modules: DevelopmentModuleProgress[] }> => {
    const res = await fetch('/api/development-control/modules', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Falha ao carregar módulos (HTTP ${res.status}).`);
    }
    return res.json();
  },

  getHealth: async (): Promise<ProjectHealthOverview> => {
    const res = await fetch('/api/development-control/health', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Falha ao carregar saúde do projeto (HTTP ${res.status}).`);
    }
    return res.json();
  },
};
