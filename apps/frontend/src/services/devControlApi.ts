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
  getOverview: async (): Promise<DevelopmentOverviewDTO> => {
    const res = await fetch('/api/development-control/overview', { credentials: 'include' });
    if (!res.ok) {
      throw new Error(`Falha ao carregar a visão geral do Development Control Center (HTTP ${res.status}).`);
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
