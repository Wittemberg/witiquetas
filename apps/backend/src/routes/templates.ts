import { Router, Request, Response } from 'express';
import { type LabelDocument, LabelDocumentSchema } from '@witiquetas/label-schema';
import type { TemplateDTO, CreateTemplateDTO } from '@witiquetas/contracts';

const router = Router();

// In-memory templates storage (com suporte a fallback se o banco relacional não estiver povoado com migrations)
const sampleTemplate: TemplateDTO = {
  id: 'tpl-gondola-padrao-100x30',
  name: 'Etiqueta de Gôndola Padrão (100x30mm)',
  scope: 'PLATFORM',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
      {
        id: 'company-name',
        type: 'text',
        text: 'SUPERMERCADO WR',
        field: 'empresa.nomeFantasia',
        x: 56,
        y: 22,
        width: 40,
        height: 5,
        fontFamily: 'Inter',
        fontSize: 8,
        alignment: 'right',
        color: '#475569',
      },
    ],
  },
};

const templatesStore = new Map<string, TemplateDTO>([
  [sampleTemplate.id, sampleTemplate],
]);

// Listar todos os modelos
router.get('/', (_req: Request, res: Response) => {
  const templates = Array.from(templatesStore.values());
  res.json({
    total: templates.length,
    templates,
  });
});

// Buscar modelo por ID
router.get('/:id', (req: Request, res: Response) => {
  const template = templatesStore.get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Modelo de etiqueta não encontrado.' });
  }
  res.json(template);
});

// Criar modelo
router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreateTemplateDTO;

  if (!body.name || !body.document) {
    return res.status(400).json({ error: 'Nome e documento da etiqueta são obrigatórios.' });
  }

  const validation = LabelDocumentSchema.safeParse(body.document);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Documento de etiqueta inválido.',
      details: validation.error.format(),
    });
  }

  const id = `tpl-${Date.now()}`;
  const now = new Date().toISOString();
  const newTemplate: TemplateDTO = {
    id,
    name: body.name,
    scope: body.scope || 'COMPANY',
    document: body.document,
    createdAt: now,
    updatedAt: now,
  };

  templatesStore.set(id, newTemplate);
  res.status(201).json(newTemplate);
});

// Atualizar modelo existente
router.put('/:id', (req: Request, res: Response) => {
  const template = templatesStore.get(req.params.id);
  if (!template) {
    return res.status(404).json({ error: 'Modelo de etiqueta não encontrado.' });
  }

  const { name, document } = req.body;

  if (document) {
    const validation = LabelDocumentSchema.safeParse(document);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Documento de etiqueta inválido.',
        details: validation.error.format(),
      });
    }
    template.document = document;
  }

  if (name) {
    template.name = name;
  }

  template.updatedAt = new Date().toISOString();
  templatesStore.set(template.id, template);

  res.json(template);
});

export default router;
