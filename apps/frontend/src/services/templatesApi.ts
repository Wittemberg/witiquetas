import type {
  TemplateDTO,
  TemplateSummaryDTO,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '@witiquetas/contracts';
import { getCsrfToken } from '../auth/session.js';

const API_BASE = '/api/templates';

function getMutatingHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const csrf = getCsrfToken();
  if (csrf) {
    headers['x-csrf-token'] = csrf;
  }
  return headers;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export const templatesApi = {
  /**
   * Listar resumos leves de modelos
   */
  async listTemplates(search?: string): Promise<TemplateSummaryDTO[]> {
    let url = API_BASE;
    if (search && search.trim()) {
      url += `?search=${encodeURIComponent(search.trim())}`;
    }

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao buscar modelos de etiquetas.', errData);
    }

    const data = await res.json();
    return data.templates || [];
  },

  /**
   * Buscar modelo completo por ID (com document_schema)
   */
  async getTemplateById(id: string): Promise<TemplateDTO> {
    const res = await fetch(`${API_BASE}/${id}`, { credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Modelo não encontrado.', errData);
    }
    return res.json();
  },

  /**
   * Criar modelo
   */
  async createTemplate(dto: CreateTemplateDTO): Promise<TemplateDTO> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: getMutatingHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao criar modelo.', errData);
    }

    return res.json();
  },

  /**
   * Atualizar modelo existente (com suporte a expectedVersion -> 409 Conflict)
   */
  async updateTemplate(id: string, dto: UpdateTemplateDTO): Promise<TemplateDTO> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: getMutatingHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(
        res.status,
        errData.message || errData.error || 'Falha ao salvar modelo.',
        errData
      );
    }

    return res.json();
  },

  /**
   * Duplicar modelo no backend (Server-side)
   */
  async duplicateTemplate(id: string): Promise<TemplateDTO> {
    const res = await fetch(`${API_BASE}/${id}/duplicate`, {
      method: 'POST',
      credentials: 'include',
      headers: getMutatingHeaders(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao duplicar modelo.', errData);
    }

    return res.json();
  },

  /**
   * Renomear modelo
   */
  async renameTemplate(id: string, title: string): Promise<TemplateDTO> {
    const res = await fetch(`${API_BASE}/${id}/name`, {
      method: 'PATCH',
      credentials: 'include',
      headers: getMutatingHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao renomear modelo.', errData);
    }

    return res.json();
  },

  /**
   * Excluir modelo (Soft Delete)
   */
  async deleteTemplate(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getMutatingHeaders(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.message || errData.error || 'Falha ao remover modelo.', errData);
    }
  },

  /**
   * Enviar heartbeat de presença de edição
   */
  async sendHeartbeat(
    id: string,
    payload: { sessionId: string; userIdentifier: string; os?: string; browser?: string; deviceName?: string }
  ): Promise<any> {
    const res = await fetch(`${API_BASE}/${id}/presence/heartbeat`, {
      method: 'POST',
      credentials: 'include',
      headers: getMutatingHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha no heartbeat.', errData);
    }
    return res.json();
  },

  /**
   * Notificar saída da presença de edição
   */
  async leavePresence(id: string, sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/${id}/presence/leave`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getMutatingHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  },

  /**
   * Buscar presença ativa do modelo
   */
  async getPresence(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/${id}/presence`, { credentials: 'include' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao buscar presença.', errData);
    }
    return res.json();
  },
};
