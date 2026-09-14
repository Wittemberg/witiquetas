import { Router, Request, Response } from 'express';
import type { PrinterDTO, CreatePrinterDTO, PrinterProfileDTO } from '@witiquetas/contracts';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuthenticatedUser);

// Storage em memória inicial com modelos pré-configurados e perfis de capacidades homologadas
const defaultPrinters: PrinterDTO[] = [
  {
    id: 'prn-gondola-elgin-tcp',
    companyId: 'comp-matriz-01',
    name: 'Elgin L42 Pro (Gôndola / Estoque)',
    model: 'Elgin L42 Pro',
    protocol: 'RAW_TCP',
    host: '192.168.1.200',
    port: 9100,
    language: 'PPLB',
    dpi: 203,
    active: true,
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capabilities: {
      nativeFonts: ['Roboto', 'Arial', 'Courier New', 'Noto Sans'],
      supportedFonts: ['Roboto', 'Arial', 'Inter', 'Noto Sans', 'Montserrat', 'Noto Serif', 'Courier New', 'Roboto Mono'],
      maxWidthMm: 104,
      maxDpi: 203,
      supportsQrCode: true,
      supportsEan13: true,
      supportsCode128: true,
      supportsImages: true,
      notes: 'Equipamento homologado com cabeçote térmico de 4 polegadas (104 mm).',
    },
  },
  {
    id: 'prn-expedicao-argox-tcp',
    companyId: 'comp-matriz-01',
    name: 'Argox OS-214plus (Expedição / Logística)',
    model: 'Argox OS-214plus',
    protocol: 'RAW_TCP',
    host: '192.168.1.201',
    port: 9100,
    language: 'PPLA',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capabilities: {
      nativeFonts: ['Courier New', 'Arial', 'Roboto'],
      supportedFonts: ['Roboto', 'Arial', 'Inter', 'Noto Sans', 'Noto Serif', 'Courier New', 'Roboto Mono'],
      maxWidthMm: 104,
      maxDpi: 203,
      supportsQrCode: true,
      supportsEan13: true,
      supportsCode128: true,
      supportsImages: true,
      notes: 'Equipamento homologado padrão Argox PPLA.',
    },
  },
  {
    id: 'prn-zebra-zd220-tcp',
    companyId: 'comp-matriz-01',
    name: 'Zebra ZD220 (E-commerce / Farmácia)',
    model: 'Zebra ZD220',
    protocol: 'RAW_TCP',
    host: '192.168.1.202',
    port: 9100,
    language: 'ZPL',
    dpi: 203,
    active: true,
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capabilities: {
      nativeFonts: ['Roboto', 'Arial', 'Courier New', 'Noto Sans'],
      supportedFonts: ['Roboto', 'Arial', 'Inter', 'Noto Sans', 'Montserrat', 'Noto Serif', 'Courier New', 'Roboto Mono'],
      maxWidthMm: 104,
      maxDpi: 203,
      supportsQrCode: true,
      supportsEan13: true,
      supportsCode128: true,
      supportsImages: true,
      notes: 'Equipamento homologado Zebra ZPL.',
    },
  },
];

const printersStore = new Map<string, PrinterDTO>(
  defaultPrinters.map((p) => [p.id, p])
);

function getCompanyId(req: Request): string {
  if (req.principal?.company?.id) {
    return req.principal.company.id;
  }
  const headerCompany = req.headers['x-company-id'] as string;
  if (headerCompany && headerCompany.trim()) {
    return headerCompany.trim();
  }
  return 'comp-matriz-01';
}

// 1. Listar todas as impressoras
router.get('/', requirePermission('printers.view'), (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const printers = Array.from(printersStore.values()).filter((p) => p.companyId === companyId);
  res.json({
    total: printers.length,
    printers,
  });
});

// 2. Buscar impressora por ID
router.get('/:id', requirePermission('printers.view'), (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const printer = printersStore.get(req.params.id);
  if (!printer || printer.companyId !== companyId) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }
  res.json(printer);
});

// 3. Cadastrar nova impressora
router.post('/', requirePermission('printers.manage'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const body = req.body as CreatePrinterDTO & { companyId?: string };

  if (body.companyId && body.companyId !== companyId) {
    return res.status(400).json({
      code: 'INVALID_COMPANY_ID',
      error: 'Não é permitido criar impressora para outro tenant.',
    });
  }

  if (!body.name || !body.protocol || !body.language) {
    return res.status(400).json({ error: 'Nome, protocolo e linguagem são obrigatórios.' });
  }

  const id = `prn-${Date.now()}`;
  const now = new Date().toISOString();

  // Se marcar como padrão, desmarcar apenas as do mesmo tenant
  if (body.isDefault) {
    printersStore.forEach((p) => {
      if (p.companyId === companyId) {
        p.isDefault = false;
      }
    });
  }

  const newPrinter: PrinterDTO = {
    id,
    companyId,
    name: body.name,
    model: body.model || 'Térmica Padrão',
    protocol: body.protocol,
    host: body.host,
    port: body.port || 9100,
    baudRate: body.baudRate,
    serialPort: body.serialPort,
    language: body.language,
    dpi: body.dpi || 203,
    active: true,
    isDefault: !!body.isDefault,
    createdAt: now,
    updatedAt: now,
    capabilities: {
      nativeFonts: ['Roboto', 'Arial', 'Courier New'],
      supportedFonts: ['Roboto', 'Arial', 'Inter', 'Noto Sans', 'Montserrat', 'Noto Serif', 'Courier New', 'Roboto Mono'],
      maxWidthMm: 104,
      maxDpi: body.dpi || 203,
      supportsQrCode: true,
      supportsEan13: true,
      supportsCode128: true,
      supportsImages: true,
    },
  };

  printersStore.set(id, newPrinter);
  res.status(201).json(newPrinter);
});

// 4. Atualizar impressora
router.put('/:id', requirePermission('printers.manage'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const printer = printersStore.get(req.params.id);
  if (!printer || printer.companyId !== companyId) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }

  const body = req.body;
  if (body.companyId && body.companyId !== companyId) {
    return res.status(400).json({
      code: 'INVALID_COMPANY_ID',
      error: 'Não é permitido alterar o tenant da impressora.',
    });
  }

  if (body.isDefault) {
    printersStore.forEach((p) => {
      if (p.companyId === companyId) {
        p.isDefault = false;
      }
    });
  }

  const { id: _ignoredId, companyId: _ignoredCompanyId, ...updates } = body;

  Object.assign(printer, {
    ...updates,
    companyId,
    updatedAt: new Date().toISOString(),
  });

  printersStore.set(printer.id, printer);
  res.json(printer);
});

// 5. Excluir impressora
router.delete('/:id', requirePermission('printers.manage'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const printer = printersStore.get(req.params.id);
  if (!printer || printer.companyId !== companyId) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }
  printersStore.delete(req.params.id);
  res.json({ success: true, message: 'Impressora removida com sucesso.' });
});

export { printersStore };
export default router;
