import type {
  TemplateDTO,
  TemplateSummaryDTO,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '@witiquetas/contracts';

const API_BASE = '/api/templates';

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

    const res = await fetch(url);
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
    const res = await fetch(`${API_BASE}/${id}`);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new ApiError(res.status, errData.error || 'Falha ao remover modelo.', errData);
    }
  },
};
