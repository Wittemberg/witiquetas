import { pgPool, isProduction } from '../db';
import type { LabelDocument } from '@witiquetas/label-schema';
import type {
  TemplateDTO,
  TemplateSummaryDTO,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '@witiquetas/contracts';

export class MismatchedVersionError extends Error {
  currentVersion: number;
  constructor(currentVersion: number) {
    super(`Conflito de versão. A versão atual no servidor é ${currentVersion}.`);
    this.name = 'MismatchedVersionError';
    this.currentVersion = currentVersion;
  }
}

// Storage em memória estritamente restrito a testes locais / dev quando sem PostgreSQL
const memoryStore = new Map<string, TemplateDTO>();

function getSampleTemplate(): TemplateDTO {
  return {
    id: 'tpl-gondola-padrao-100x30',
    companyId: 'comp-default',
    title: 'Etiqueta de Gôndola Padrão (100x30mm)',
    name: 'Etiqueta de Gôndola Padrão (100x30mm)',
    nicheName: 'Gôndola / Supermercado',
    widthMm: 100,
    heightMm: 30,
    dpi: 203,
    orientation: 'landscape',
    printerLanguage: 'PPLB',
    version: 1,
    scope: 'COMPANY',
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
    document: {
      schemaVersion: 1,
      title: 'Etiqueta de Gôndola Padrão (100x30mm)',
      dimensions: {
        widthMm: 100,
        heightMm: 30,
        dpi: 203,
        orientation: 'landscape',
      },
      elements: [
        {
          id: 'header-bg',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 6,
          strokeWidth: 0,
          fillColor: '#1e293b',
        },
        {
          id: 'header-text',
          type: 'text',
          text: 'OFERTA ESPECIAL',
          x: 2,
          y: 1,
          width: 96,
          height: 4,
          fontFamily: 'Inter',
          fontSize: 10,
          fontWeight: 'bold',
          alignment: 'center',
          color: '#ffffff',
        },
        {
          id: 'prod-desc',
          type: 'text',
          text: 'REFRIGERANTE COCA-COLA 2L',
          field: 'produto.descricao',
          x: 4,
          y: 8,
          width: 60,
          height: 10,
          fontFamily: 'Inter',
          fontSize: 12,
          fontWeight: 'bold',
          alignment: 'left',
          color: '#0f172a',
        },
        {
          id: 'prod-price',
          type: 'price',
          field: 'produto.preco',
          prefix: 'R$',
          x: 65,
          y: 7,
          width: 31,
          height: 14,
          integerFontSize: 24,
          fractionFontSize: 14,
          currencyFontSize: 12,
          color: '#dc2626',
        },
        {
          id: 'prod-ean',
          type: 'barcode',
          format: 'EAN13',
          field: 'produto.ean',
          value: '7894900011517',
          x: 4,
          y: 19,
          width: 50,
          height: 9,
          showText: true,
        },
      ],
    },
  };
}

// Inicializar mẫu mẫu em memória para testes
const sample = getSampleTemplate();
memoryStore.set(sample.id, sample);

export interface ListTemplatesOptions {
  companyId: string;
  search?: string;
}

export const templateRepository = {
  /**
   * Listar resumos de modelos (Sem carregar o JSONB pesado document_schema)
   */
  async listTemplates(opts: ListTemplatesOptions): Promise<TemplateSummaryDTO[]> {
    const { companyId, search } = opts;

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      let items = Array.from(memoryStore.values()).filter(
        (t) => t.companyId === companyId || companyId === 'comp-default'
      );

      if (search && search.trim() !== '') {
        const q = search.toLowerCase().trim();
        items = items.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.nicheName.toLowerCase().includes(q) ||
            t.printerLanguage.toLowerCase().includes(q) ||
            `${t.widthMm}x${t.heightMm}`.includes(q)
        );
      }

      return items.map((t) => {
        const { document, ...summary } = t;
        return summary;
      });
    }

    let sql = `
      SELECT id, company_id, title, description, niche_id, niche_name, width_mm, height_mm,
             dpi, orientation, printer_language, version, created_at, updated_at
      FROM label_templates
      WHERE company_id = $1 AND deleted_at IS NULL
    `;
    const params: any[] = [companyId];

    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(title) LIKE $2 OR LOWER(niche_name) LIKE $2 OR LOWER(printer_language) LIKE $2)`;
    }

    sql += ` ORDER BY updated_at DESC`;

    const res = await pgPool.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      name: row.title,
      description: row.description || undefined,
      nicheId: row.niche_id || undefined,
      nicheName: row.niche_name,
      widthMm: Number(row.width_mm),
      heightMm: Number(row.height_mm),
      dpi: Number(row.dpi),
      orientation: row.orientation as 'portrait' | 'landscape',
      printerLanguage: row.printer_language,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      scope: 'COMPANY',
    }));
  },

  /**
   * Buscar modelo completo com document_schema
   */
  async getTemplateById(id: string, companyId: string): Promise<TemplateDTO | null> {
    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const item = memoryStore.get(id);
      if (!item) return null;
      if (item.companyId !== companyId && companyId !== 'comp-default') return null;
      return JSON.parse(JSON.stringify(item));
    }

    const res = await pgPool.query(
      `SELECT id, company_id, title, description, niche_id, niche_name, width_mm, height_mm,
              dpi, orientation, printer_language, document_schema, version, created_at, updated_at
       FROM label_templates
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, companyId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    return {
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      name: row.title,
      description: row.description || undefined,
      nicheId: row.niche_id || undefined,
      nicheName: row.niche_name,
      widthMm: Number(row.width_mm),
      heightMm: Number(row.height_mm),
      dpi: Number(row.dpi),
      orientation: row.orientation as 'portrait' | 'landscape',
      printerLanguage: row.printer_language,
      document: row.document_schema as LabelDocument,
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      scope: 'COMPANY',
    };
  },

  /**
   * Criar novo modelo
   */
  async createTemplate(dto: CreateTemplateDTO, companyId: string): Promise<TemplateDTO> {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const title = dto.title || dto.name || 'Sem Título';
    const doc = dto.document;
    const widthMm = doc.dimensions?.widthMm || 100;
    const heightMm = doc.dimensions?.heightMm || 30;
    const dpi = doc.dimensions?.dpi || 203;
    const orientation = doc.dimensions?.orientation || 'landscape';
    const printerLanguage = dto.printerLanguage || 'PPLB';
    const nicheName = dto.nicheName || 'Geral';
    const now = new Date().toISOString();

    const newTemplate: TemplateDTO = {
      id,
      companyId,
      title,
      name: title,
      description: dto.description,
      nicheId: dto.nicheId,
      nicheName,
      widthMm,
      heightMm,
      dpi,
      orientation,
      printerLanguage,
      document: doc,
      version: 1,
      createdAt: now,
      updatedAt: now,
      scope: 'COMPANY',
    };

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      memoryStore.set(id, newTemplate);
      return JSON.parse(JSON.stringify(newTemplate));
    }

    await pgPool.query(
      `INSERT INTO label_templates (
        id, company_id, title, description, niche_id, niche_name,
        width_mm, height_mm, dpi, orientation, printer_language,
        document_schema, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        companyId,
        title,
        dto.description || null,
        dto.nicheId || null,
        nicheName,
        widthMm,
        heightMm,
        dpi,
        orientation,
        printerLanguage,
        JSON.stringify(doc),
        1,
        now,
        now,
      ]
    );

    return newTemplate;
  },

  /**
   * Atualizar modelo existente com suporte a Optimistic Locking (expectedVersion)
   */
  async updateTemplate(
    id: string,
    dto: UpdateTemplateDTO,
    companyId: string
  ): Promise<TemplateDTO> {
    const existing = await this.getTemplateById(id, companyId);
    if (!existing) {
      throw new Error(`Modelo "${id}" não encontrado para a empresa "${companyId}".`);
    }

    if (
      dto.expectedVersion !== undefined &&
      dto.expectedVersion !== null &&
      dto.expectedVersion !== existing.version
    ) {
      throw new MismatchedVersionError(existing.version);
    }

    const newVersion = existing.version + 1;
    const now = new Date().toISOString();
    const updatedTitle = dto.title || dto.name || existing.title;
    const updatedDoc = dto.document || existing.document;

    const widthMm = updatedDoc.dimensions?.widthMm || existing.widthMm;
    const heightMm = updatedDoc.dimensions?.heightMm || existing.heightMm;
    const dpi = updatedDoc.dimensions?.dpi || existing.dpi;
    const orientation = updatedDoc.dimensions?.orientation || existing.orientation;
    const printerLanguage = dto.printerLanguage || existing.printerLanguage;

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const updated: TemplateDTO = {
        ...existing,
        title: updatedTitle,
        name: updatedTitle,
        description: dto.description !== undefined ? dto.description : existing.description,
        document: updatedDoc,
        widthMm,
        heightMm,
        dpi,
        orientation,
        printerLanguage,
        version: newVersion,
        updatedAt: now,
      };
      memoryStore.set(id, updated);
      return JSON.parse(JSON.stringify(updated));
    }

    const updateRes = await pgPool.query(
      `UPDATE label_templates
       SET title = $1,
           description = COALESCE($2, description),
           document_schema = $3,
           width_mm = $4,
           height_mm = $5,
           dpi = $6,
           orientation = $7,
           printer_language = $8,
           version = $9,
           updated_at = $10
       WHERE id = $11 AND company_id = $12 AND version = $13 AND deleted_at IS NULL
       RETURNING id`,
      [
        updatedTitle,
        dto.description !== undefined ? dto.description : null,
        JSON.stringify(updatedDoc),
        widthMm,
        heightMm,
        dpi,
        orientation,
        printerLanguage,
        newVersion,
        now,
        id,
        companyId,
        existing.version,
      ]
    );

    if (updateRes.rows.length === 0) {
      // Re-consultar para obter versão mais recente
      const fresh = await this.getTemplateById(id, companyId);
      if (fresh && fresh.version !== existing.version) {
        throw new MismatchedVersionError(fresh.version);
      }
      throw new Error(`Falha ao atualizar o modelo "${id}".`);
    }

    return (await this.getTemplateById(id, companyId))!;
  },

  /**
   * Duplicar modelo no backend (Server-side clone)
   */
  async duplicateTemplate(id: string, companyId: string): Promise<TemplateDTO> {
    const existing = await this.getTemplateById(id, companyId);
    if (!existing) {
      throw new Error(`Modelo "${id}" não encontrado.`);
    }

    const newTitle = `${existing.title} - Cópia`;
    const clonedDoc: LabelDocument = JSON.parse(JSON.stringify(existing.document));
    clonedDoc.title = newTitle;

    return this.createTemplate(
      {
        title: newTitle,
        name: newTitle,
        nicheId: existing.nicheId,
        nicheName: existing.nicheName,
        description: existing.description,
        printerLanguage: existing.printerLanguage,
        document: clonedDoc,
      },
      companyId
    );
  },

  /**
   * Renomear modelo
   */
  async renameTemplate(id: string, newTitle: string, companyId: string): Promise<TemplateDTO> {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      throw new Error('O título do modelo não pode ser vazio.');
    }
    const existing = await this.getTemplateById(id, companyId);
    if (!existing) {
      throw new Error(`Modelo "${id}" não encontrado.`);
    }
    const updatedDoc: LabelDocument = JSON.parse(JSON.stringify(existing.document));
    updatedDoc.title = trimmed;

    return this.updateTemplate(
      id,
      {
        title: trimmed,
        name: trimmed,
        document: updatedDoc,
        expectedVersion: existing.version,
      },
      companyId
    );
  },

  /**
   * Soft Delete do modelo (deleted_at = NOW())
   */
  async deleteTemplate(id: string, companyId: string): Promise<void> {
    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const existing = memoryStore.get(id);
      if (existing && (existing.companyId === companyId || companyId === 'comp-default')) {
        memoryStore.delete(id);
      }
      return;
    }

    await pgPool.query(
      `UPDATE label_templates
       SET deleted_at = NOW()
       WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, companyId]
    );
  },
};
