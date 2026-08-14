import { Router, Request, Response } from 'express';
import { PrinterDTO, CreatePrinterDTO } from '@witiquetas/contracts';

const router = Router();

// Storage em memória inicial com modelos pré-configurados
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
  },
];

const printersStore = new Map<string, PrinterDTO>(
  defaultPrinters.map((p) => [p.id, p])
);

// 1. Listar todas as impressoras
router.get('/', (_req: Request, res: Response) => {
  const printers = Array.from(printersStore.values());
  res.json({
    total: printers.length,
    printers,
  });
});

// 2. Buscar impressora por ID
router.get('/:id', (req: Request, res: Response) => {
  const printer = printersStore.get(req.params.id);
  if (!printer) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }
  res.json(printer);
});

// 3. Cadastrar nova impressora
router.post('/', (req: Request, res: Response) => {
  const body = req.body as CreatePrinterDTO;

  if (!body.name || !body.protocol || !body.language) {
    return res.status(400).json({ error: 'Nome, protocolo e linguagem são obrigatórios.' });
  }

  const id = `prn-${Date.now()}`;
  const now = new Date().toISOString();

  // Se marcar como padrão, desmarcar as outras
  if (body.isDefault) {
    printersStore.forEach((p) => {
      p.isDefault = false;
    });
  }

  const newPrinter: PrinterDTO = {
    id,
    companyId: 'comp-matriz-01',
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
  };

  printersStore.set(id, newPrinter);
  res.status(201).json(newPrinter);
});

// 4. Atualizar impressora
router.put('/:id', (req: Request, res: Response) => {
  const printer = printersStore.get(req.params.id);
  if (!printer) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }

  const body = req.body;

  if (body.isDefault) {
    printersStore.forEach((p) => {
      p.isDefault = false;
    });
  }

  Object.assign(printer, {
    ...body,
    updatedAt: new Date().toISOString(),
  });

  printersStore.set(printer.id, printer);
  res.json(printer);
});

// 5. Excluir impressora
router.delete('/:id', (req: Request, res: Response) => {
  if (!printersStore.has(req.params.id)) {
    return res.status(404).json({ error: 'Impressora não encontrada.' });
  }
  printersStore.delete(req.params.id);
  res.json({ success: true, message: 'Impressora removida com sucesso.' });
});

export { printersStore };
export default router;
