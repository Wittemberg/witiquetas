import type {
  UpdateCenterOverviewDTO,
  ReleaseManifestDTO,
  UpdateCheckResultDTO,
  UpdateReleaseNoteDTO,
  ReleaseChannel,
  WhatsNewResponseDTO,
  MarkReleaseReadResponseDTO,
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

export const updatesApi = {
  async getOverview(): Promise<UpdateCenterOverviewDTO> {
    return request<UpdateCenterOverviewDTO>('/api/updates/overview');
  },

  async getHistory(): Promise<ReleaseManifestDTO[]> {
    const data = await request<{ total: number; releases: ReleaseManifestDTO[] }>('/api/updates/history');
    return data.releases || [];
  },

  async getRelease(version: string): Promise<ReleaseManifestDTO> {
    return request<ReleaseManifestDTO>(`/api/updates/releases/${encodeURIComponent(version)}`);
  },

  async updateReleaseNote(version: string, dto: UpdateReleaseNoteDTO): Promise<ReleaseManifestDTO> {
    return request<ReleaseManifestDTO>(`/api/updates/releases/${encodeURIComponent(version)}`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  },

  async checkForUpdates(channel?: ReleaseChannel): Promise<UpdateCheckResultDTO> {
    return request<UpdateCheckResultDTO>('/api/updates/check', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    });
  },

  async getWhatsNew(): Promise<WhatsNewResponseDTO> {
    return request<WhatsNewResponseDTO>('/api/updates/whats-new');
  },

  async markReleasesAsRead(versions: string[]): Promise<MarkReleaseReadResponseDTO> {
    return request<MarkReleaseReadResponseDTO>('/api/updates/whats-new/mark-read', {
      method: 'POST',
      body: JSON.stringify({ versions }),
    });
  },
};
