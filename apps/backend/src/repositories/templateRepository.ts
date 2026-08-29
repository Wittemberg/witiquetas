import { pgPool, isProduction } from '../db.js';
import type { LabelDocument } from '@witiquetas/label-schema';
import { normalizeNicheId } from '@witiquetas/label-schema';
import type {
  TemplateDTO,
  TemplateSummaryDTO,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '@witiquetas/contracts';
import { presenceRepository, ActiveEditingSessionError } from './presenceRepository.js';

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

export function getSeedTemplates(): TemplateDTO[] {
  return [
    {
      id: 'tpl-seed-retail',
      companyId: 'comp-default',
      title: 'Etiqueta de Gôndola Varejo',
      name: 'Etiqueta de Gôndola Varejo',
      nicheId: 'retail',
      nicheName: 'Varejo / Supermercado',
      widthMm: 100,
      heightMm: 30,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Etiqueta de Gôndola Varejo',
        nicheId: 'retail',
        nicheName: 'Varejo / Supermercado',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'h-bg', type: 'rectangle', x: 0, y: 0, width: 100, height: 6, strokeWidth: 0, fillColor: '#1e293b' },
          { id: 'h-txt', type: 'text', text: 'GÔNDOLA / VAREJO', x: 2, y: 1, width: 96, height: 4, fontFamily: 'Inter', fontSize: 10, fontWeight: 'bold', alignment: 'center', color: '#ffffff' },
          { id: 'p-desc', type: 'text', text: 'REFRIGERANTE COCA-COLA 2L', field: 'produto.descricao', x: 4, y: 8, width: 60, height: 10, fontFamily: 'Inter', fontSize: 12, fontWeight: 'bold', color: '#0f172a' },
          { id: 'p-price', type: 'price', field: 'produto.preco', prefix: 'R$', x: 65, y: 7, width: 31, height: 14, integerFontSize: 24, fractionFontSize: 14, currencyFontSize: 12, color: '#dc2626' },
          { id: 'p-ean', type: 'barcode', format: 'EAN13', field: 'produto.ean', value: '7894900011517', x: 4, y: 19, width: 50, height: 9, showText: true },
        ],
      },
    },
    {
      id: 'tpl-seed-hospital',
      companyId: 'comp-default',
      title: 'Identificação de Paciente Hospitalar',
      name: 'Identificação de Paciente Hospitalar',
      nicheId: 'hospital',
      nicheName: 'Hospital / Identificação',
      widthMm: 100,
      heightMm: 30,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Identificação de Paciente Hospitalar',
        nicheId: 'hospital',
        nicheName: 'Hospital / Identificação',
        dimensions: { widthMm: 100, heightMm: 30, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'h-bg', type: 'rectangle', x: 0, y: 0, width: 100, height: 6, strokeWidth: 0, fillColor: '#0284c7' },
          { id: 'h-txt', type: 'text', text: 'HOSPITAL SANTA CRUZ', x: 2, y: 1, width: 96, height: 4, fontFamily: 'Inter', fontSize: 10, fontWeight: 'bold', alignment: 'center', color: '#ffffff' },
          { id: 'p-name', type: 'text', text: 'MARIA APARECIDA SILVA', field: 'paciente.nome', x: 4, y: 8, width: 65, height: 8, fontFamily: 'Inter', fontSize: 12, fontWeight: 'bold', color: '#0f172a' },
          { id: 'p-bed', type: 'text', text: 'LEITO: 304-B', field: 'atendimento.leito', x: 4, y: 16, width: 40, height: 6, fontFamily: 'Inter', fontSize: 10, color: '#334155' },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'paciente.id', value: 'PAC-847291', x: 4, y: 22, width: 50, height: 7, showText: true },
          { id: 'p-qr', type: 'qrcode', field: 'atendimento.id', value: 'ATD-2026-9041', x: 75, y: 8, width: 20, height: 20 },
        ],
      },
    },
    {
      id: 'tpl-seed-laboratory',
      companyId: 'comp-default',
      title: 'Amostra de Laboratório Specimen',
      name: 'Amostra de Laboratório Specimen',
      nicheId: 'laboratory',
      nicheName: 'Laboratório Clínico',
      widthMm: 50.8,
      heightMm: 25.4,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Amostra de Laboratório Specimen',
        nicheId: 'laboratory',
        nicheName: 'Laboratório Clínico',
        dimensions: { widthMm: 50.8, heightMm: 25.4, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'p-name', type: 'text', text: 'JOÃO CARLOS PEREIRA', field: 'paciente.nome', x: 2, y: 2, width: 46, height: 5, fontFamily: 'Inter', fontSize: 10, fontWeight: 'bold' },
          { id: 'p-type', type: 'text', text: 'SORO / SANGUE TOTAL', field: 'amostra.tipo', x: 2, y: 7, width: 46, height: 4, fontFamily: 'Inter', fontSize: 8 },
          { id: 'p-exam', type: 'text', text: 'HEMOGRAMA COMPLETO', field: 'exame.nome', x: 2, y: 11, width: 46, height: 4, fontFamily: 'Inter', fontSize: 8 },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'coleta.id', value: 'COL-88412', x: 2, y: 15, width: 46, height: 8, showText: true },
        ],
      },
    },
    {
      id: 'tpl-seed-logistics',
      companyId: 'comp-default',
      title: 'Etiqueta de Logística GS1',
      name: 'Etiqueta de Logística GS1',
      nicheId: 'logistics',
      nicheName: 'Logística / Expedição',
      widthMm: 100,
      heightMm: 100,
      dpi: 203,
      orientation: 'portrait',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Etiqueta de Logística GS1',
        nicheId: 'logistics',
        nicheName: 'Logística / Expedição',
        dimensions: { widthMm: 100, heightMm: 100, dpi: 203, orientation: 'portrait' },
        elements: [
          { id: 'h-bg', type: 'rectangle', x: 0, y: 0, width: 100, height: 10, strokeWidth: 0, fillColor: '#0f172a' },
          { id: 'h-txt', type: 'text', text: 'LOGÍSTICA GS1 / EXPEDIÇÃO', x: 2, y: 2, width: 96, height: 6, fontFamily: 'Inter', fontSize: 12, fontWeight: 'bold', alignment: 'center', color: '#ffffff' },
          { id: 'p-dest', type: 'text', text: 'DESTINO: CENTRO DE DISTRIBUIÇÃO SP', field: 'destino', x: 4, y: 14, width: 92, height: 8, fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold' },
          { id: 'p-sscc-txt', type: 'text', text: 'SSCC: 178912345678901234', field: 'sscc', x: 4, y: 24, width: 92, height: 6, fontFamily: 'Inter', fontSize: 10 },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'sscc', value: '178912345678901234', x: 4, y: 32, width: 92, height: 35, showText: true },
          { id: 'p-qr', type: 'qrcode', field: 'logistics.trackingCode', value: 'BR884910293PT', x: 35, y: 70, width: 25, height: 25 },
        ],
      },
    },
    {
      id: 'tpl-seed-industry',
      companyId: 'comp-default',
      title: 'Ordem de Produção Industrial',
      name: 'Ordem de Produção Industrial',
      nicheId: 'industry',
      nicheName: 'Indústria / Produção',
      widthMm: 100,
      heightMm: 50,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Ordem de Produção Industrial',
        nicheId: 'industry',
        nicheName: 'Indústria / Produção',
        dimensions: { widthMm: 100, heightMm: 50, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'h-bg', type: 'rectangle', x: 0, y: 0, width: 100, height: 8, strokeWidth: 0, fillColor: '#334155' },
          { id: 'h-txt', type: 'text', text: 'ORDEM DE PRODUÇÃO (OP)', x: 2, y: 1, width: 96, height: 6, fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold', alignment: 'center', color: '#ffffff' },
          { id: 'p-item', type: 'text', text: 'ITEM: PLACA ELETRÔNICA PRINCIPAL', field: 'produto.descricao', x: 4, y: 11, width: 92, height: 7, fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold' },
          { id: 'p-op', type: 'text', text: 'OP: OP-4491', field: 'ordemProducao', x: 4, y: 19, width: 44, height: 6, fontFamily: 'Inter', fontSize: 10 },
          { id: 'p-lot', type: 'text', text: 'LOTE: LT-IND-2026', field: 'lote.numero', x: 50, y: 19, width: 46, height: 6, fontFamily: 'Inter', fontSize: 10 },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'produto.codigo', value: 'PRD-8840', x: 4, y: 27, width: 92, height: 18, showText: true },
        ],
      },
    },
    {
      id: 'tpl-seed-food',
      companyId: 'comp-default',
      title: 'Etiqueta de Alimento / Perecível',
      name: 'Etiqueta de Alimento / Perecível',
      nicheId: 'food',
      nicheName: 'Alimentos / Perecíveis',
      widthMm: 60,
      heightMm: 40,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Etiqueta de Alimento / Perecível',
        nicheId: 'food',
        nicheName: 'Alimentos / Perecíveis',
        dimensions: { widthMm: 60, heightMm: 40, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'p-desc', type: 'text', text: 'QUEIJO MUSSARELA FATIADO', field: 'produto.descricao', x: 2, y: 2, width: 56, height: 6, fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold' },
          { id: 'p-weight', type: 'text', text: 'PESO: 0.450 kg', field: 'peso', x: 2, y: 9, width: 30, height: 5, fontFamily: 'Inter', fontSize: 9 },
          { id: 'p-val', type: 'text', text: 'VAL: 15/09/2026', field: 'dataValidade', x: 2, y: 15, width: 30, height: 5, fontFamily: 'Inter', fontSize: 9 },
          { id: 'p-price', type: 'price', field: 'preco', prefix: 'R$', x: 34, y: 8, width: 24, height: 12, integerFontSize: 18, fractionFontSize: 12, currencyFontSize: 10, color: '#dc2626' },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'lote.numero', value: 'LT-ALM-102', x: 2, y: 22, width: 56, height: 14, showText: true },
        ],
      },
    },
    {
      id: 'tpl-seed-pharmacy',
      companyId: 'comp-default',
      title: 'Identificação de Medicamento',
      name: 'Identificação de Medicamento',
      nicheId: 'pharmacy',
      nicheName: 'Farmácia / Medicamentos',
      widthMm: 50,
      heightMm: 30,
      dpi: 203,
      orientation: 'landscape',
      printerLanguage: 'PPLB',
      version: 1,
      scope: 'DEMO',
      isSeed: true,
      createdAt: '2026-08-28T12:00:00.000Z',
      updatedAt: '2026-08-28T12:00:00.000Z',
      document: {
        schemaVersion: 1,
        title: 'Identificação de Medicamento',
        nicheId: 'pharmacy',
        nicheName: 'Farmácia / Medicamentos',
        dimensions: { widthMm: 50, heightMm: 30, dpi: 203, orientation: 'landscape' },
        elements: [
          { id: 'p-name', type: 'text', text: 'AMOXICILINA 500MG', field: 'medicamento.nome', x: 2, y: 2, width: 46, height: 6, fontFamily: 'Inter', fontSize: 11, fontWeight: 'bold' },
          { id: 'p-active', type: 'text', text: 'AMOXICILINA TRI-HIDRATADA', field: 'medicamento.principioAtivo', x: 2, y: 9, width: 46, height: 4, fontFamily: 'Inter', fontSize: 8 },
          { id: 'p-ms', type: 'text', text: 'MS: 1.0043.0912', field: 'medicamento.registro', x: 2, y: 14, width: 46, height: 4, fontFamily: 'Inter', fontSize: 8 },
          { id: 'p-bc', type: 'barcode', format: 'CODE128', field: 'medicamento.lote', value: 'FAR-2026-X', x: 2, y: 19, width: 46, height: 9, showText: true },
        ],
      },
    },
  ];
}

// Inicializar os 7 modelos de demonstração/seed em memória idempotentemente
function initMemorySeeds() {
  const seeds = getSeedTemplates();
  for (const seed of seeds) {
    if (!memoryStore.has(seed.id)) {
      memoryStore.set(seed.id, seed);
    }
  }
}
initMemorySeeds();

export interface ListTemplatesOptions {
  companyId: string;
  search?: string;
  nicheId?: string;
}

export const templateRepository = {
  /**
   * Listar resumos de modelos (Sem carregar o JSONB pesado document_schema)
   */
  async listTemplates(opts: ListTemplatesOptions): Promise<TemplateSummaryDTO[]> {
    const { companyId, search, nicheId } = opts;

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      let items = Array.from(memoryStore.values()).filter(
        (t) => t.companyId === companyId || companyId === 'comp-default' || t.scope === 'DEMO'
      );

      if (nicheId && nicheId.trim() !== '') {
        const norm = normalizeNicheId(nicheId);
        items = items.filter((t) => normalizeNicheId(t.nicheId || t.nicheName) === norm);
      }

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
      WHERE (company_id = $1 OR company_id = 'comp-default') AND deleted_at IS NULL
    `;
    const params: any[] = [companyId];

    if (nicheId && nicheId.trim() !== '') {
      const norm = normalizeNicheId(nicheId);
      params.push(norm);
      sql += ` AND (niche_id = $${params.length} OR LOWER(niche_name) LIKE $${params.length})`;
    }

    if (search && search.trim() !== '') {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(niche_name) LIKE $${params.length} OR LOWER(printer_language) LIKE $${params.length})`;
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
      const t = memoryStore.get(id);
      if (!t) return null;
      if (t.companyId !== companyId && companyId !== 'comp-default' && t.scope !== 'DEMO') {
        return null;
      }
      return t;
    }

    const res = await pgPool.query(
      `SELECT id, company_id, title, description, niche_id, niche_name, width_mm, height_mm,
              dpi, orientation, printer_language, document_schema, version, created_at, updated_at
       FROM label_templates
       WHERE id = $1 AND (company_id = $2 OR company_id = 'comp-default') AND deleted_at IS NULL`,
      [id, companyId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const document: LabelDocument = row.document_schema;

    return {
      id: row.id,
      companyId: row.company_id,
      title: row.title,
      name: row.title,
      description: row.description || undefined,
      nicheId: row.niche_id || normalizeNicheId(row.niche_name),
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
      document,
    };
  },

  /**
   * Criar um novo modelo de etiqueta
   */
  async createTemplate(dto: CreateTemplateDTO, companyIdOverride?: string): Promise<TemplateDTO> {
    const id = `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const companyId = companyIdOverride || dto.companyId || 'comp-default';
    const now = new Date().toISOString();
    const title = dto.name || dto.title || 'Novo Modelo de Etiqueta';
    const nicheId = dto.nicheId || normalizeNicheId(dto.nicheName);
    const nicheName = dto.nicheName || 'Varejo / Supermercado';

    const document: LabelDocument = {
      ...dto.document,
      title,
      nicheId,
      nicheName,
    };

    const template: TemplateDTO = {
      id,
      companyId,
      title,
      name: title,
      description: dto.description,
      nicheId,
      nicheName,
      widthMm: document.dimensions.widthMm,
      heightMm: document.dimensions.heightMm,
      dpi: document.dimensions.dpi,
      orientation: document.dimensions.orientation || 'landscape',
      printerLanguage: dto.printerLanguage || 'PPLB',
      version: 1,
      scope: dto.scope || 'COMPANY',
      createdAt: now,
      updatedAt: now,
      document,
    };

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      memoryStore.set(id, template);
      return template;
    }

    await pgPool.query(
      `INSERT INTO label_templates (
        id, company_id, title, description, niche_id, niche_name, width_mm, height_mm,
        dpi, orientation, printer_language, document_schema, version, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 1, NOW(), NOW())`,
      [
        id,
        companyId,
        title,
        dto.description || null,
        nicheId,
        nicheName,
        document.dimensions.widthMm,
        document.dimensions.heightMm,
        document.dimensions.dpi,
        document.dimensions.orientation || 'landscape',
        dto.printerLanguage || 'PPLB',
        JSON.stringify(document),
      ]
    );

    return template;
  },

  /**
   * Atualizar modelo com otimista locking (versão) e verificação de concorrência
   */
  async updateTemplate(
    id: string,
    dto: UpdateTemplateDTO,
    companyIdOverride?: string,
    sessionId?: string,
    userIdentifier?: string
  ): Promise<TemplateDTO> {
    const companyId = companyIdOverride || dto.companyId || 'comp-default';

    if (sessionId) {
      const activeSessions = await presenceRepository.getActiveSessions(id, companyId);
      const otherSessions = activeSessions.filter((s) => s.sessionId !== sessionId);
      if (otherSessions.length > 0) {
        throw new ActiveEditingSessionError(otherSessions);
      }
    }

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      const existing = memoryStore.get(id);
      if (!existing || (companyId !== 'comp-default' && existing.companyId !== companyId)) {
        throw new Error('Modelo não encontrado.');
      }

      const expectedVer = dto.expectedVersion ?? dto.version;
      if (expectedVer !== undefined && expectedVer !== existing.version) {
        throw new MismatchedVersionError(existing.version);
      }

      const newVersion = existing.version + 1;
      const now = new Date().toISOString();
      const updatedDoc: LabelDocument = dto.document ? {
        ...dto.document,
        nicheId: dto.nicheId || dto.document.nicheId || existing.nicheId,
        nicheName: dto.nicheName || dto.document.nicheName || existing.nicheName,
      } : existing.document;

      const updated: TemplateDTO = {
        ...existing,
        title: dto.name || dto.title || existing.title,
        name: dto.name || dto.title || existing.title,
        description: dto.description !== undefined ? dto.description : existing.description,
        nicheId: dto.nicheId || existing.nicheId,
        nicheName: dto.nicheName || existing.nicheName,
        widthMm: updatedDoc.dimensions.widthMm,
        heightMm: updatedDoc.dimensions.heightMm,
        dpi: updatedDoc.dimensions.dpi,
        orientation: updatedDoc.dimensions.orientation || existing.orientation,
        printerLanguage: dto.printerLanguage || existing.printerLanguage,
        version: newVersion,
        updatedAt: now,
        document: updatedDoc,
      };

      memoryStore.set(id, updated);
      return updated;
    }

    const currentRes = await pgPool.query(
      `SELECT version FROM label_templates WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, companyId]
    );

    if (currentRes.rows.length === 0) {
      throw new Error('Modelo não encontrado.');
    }

    const currentVersion = Number(currentRes.rows[0].version);
    const expectedVer = dto.expectedVersion ?? dto.version;
    if (expectedVer !== undefined && expectedVer !== currentVersion) {
      throw new MismatchedVersionError(currentVersion);
    }

    const newVersion = currentVersion + 1;
    const existingTemplate = await this.getTemplateById(id, companyId);
    const title = dto.name || dto.title || existingTemplate?.title || 'Modelo Atualizado';
    const nicheId = dto.nicheId || existingTemplate?.nicheId;
    const nicheName = dto.nicheName || existingTemplate?.nicheName || 'Varejo / Supermercado';

    const document: LabelDocument = dto.document ? {
      ...dto.document,
      nicheId,
      nicheName,
    } : existingTemplate!.document;

    const res = await pgPool.query(
      `UPDATE label_templates
       SET title = $1,
           description = $2,
           niche_id = $3,
           niche_name = $4,
           width_mm = $5,
           height_mm = $6,
           dpi = $7,
           orientation = $8,
           printer_language = $9,
           document_schema = $10,
           version = $11,
           updated_at = NOW()
       WHERE id = $12 AND company_id = $13 AND version = $14 AND deleted_at IS NULL
       RETURNING *`,
      [
        title,
        dto.description !== undefined ? dto.description : (existingTemplate?.description || null),
        nicheId,
        nicheName,
        document.dimensions.widthMm,
        document.dimensions.heightMm,
        document.dimensions.dpi,
        document.dimensions.orientation || 'landscape',
        dto.printerLanguage || existingTemplate?.printerLanguage || 'PPLB',
        JSON.stringify(document),
        newVersion,
        id,
        companyId,
        currentVersion,
      ]
    );

    if (res.rows.length === 0) {
      throw new MismatchedVersionError(currentVersion);
    }

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
      version: Number(row.version),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      scope: 'COMPANY',
      document: row.document_schema,
    };
  },

  /**
   * Deletar modelo (Soft delete)
   */
  async deleteTemplate(id: string, companyId: string): Promise<boolean> {
    const activeSessions = await presenceRepository.getActiveSessions(id, companyId);
    if (activeSessions.length > 0) {
      throw new ActiveEditingSessionError(activeSessions);
    }

    if (!pgPool) {
      if (isProduction) {
        throw new Error('FAIL-CLOSED: Conexão PostgreSQL indisponível em ambiente de produção.');
      }
      return memoryStore.delete(id);
    }

    const res = await pgPool.query(
      `UPDATE label_templates SET deleted_at = NOW() WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, companyId]
    );
    return (res.rowCount ?? 0) > 0;
  },

  /**
   * Duplicar modelo existente
   */
  async duplicateTemplate(id: string, companyId: string = 'comp-default'): Promise<TemplateDTO> {
    const original = await this.getTemplateById(id, companyId);
    if (!original) {
      throw new Error(`Modelo '${id}' não encontrado para duplicação.`);
    }

    const title = `${original.title} - Cópia`;
    const document: LabelDocument = {
      ...JSON.parse(JSON.stringify(original.document)),
      title,
    };

    return this.createTemplate(
      {
        name: title,
        title,
        companyId,
        description: original.description,
        nicheId: original.nicheId,
        nicheName: original.nicheName,
        scope: original.scope === 'DEMO' ? 'COMPANY' : original.scope,
        printerLanguage: original.printerLanguage,
        document,
      },
      companyId
    );
  },

  /**
   * Renomear modelo existente
   */
  async renameTemplate(id: string, newTitle: string, companyId: string = 'comp-default'): Promise<TemplateDTO> {
    const original = await this.getTemplateById(id, companyId);
    if (!original) {
      throw new Error(`Modelo '${id}' não encontrado para renomear.`);
    }

    const document: LabelDocument = {
      ...JSON.parse(JSON.stringify(original.document)),
      title: newTitle,
    };

    return this.updateTemplate(
      id,
      {
        name: newTitle,
        title: newTitle,
        companyId,
        document,
      },
      companyId
    );
  },
};

function modelIdKey(companyId: string, modelId: string): string {
  return `${companyId}:${modelId}`;
}
