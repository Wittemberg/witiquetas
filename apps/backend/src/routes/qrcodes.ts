import { Router, Request, Response } from 'express';
import type { QRCodeLibraryItemDTO, CreateQRCodeDTO, UpdateQRCodeDTO } from '@witiquetas/contracts';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';

const router = Router();
router.use(requireAuthenticatedUser);

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

// Storage em memória da biblioteca de QR Codes com itens padrão da empresa
const defaultQRCodes: QRCodeLibraryItemDTO[] = [
  {
    id: 'qr-clube-compras',
    companyId: 'comp-matriz-01',
    name: 'Clube de Compras (Fidelidade)',
    url: 'https://witiquetas.wrtec.com.br/clube',
    favorite: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'qr-loja-virtual',
    companyId: 'comp-matriz-01',
    name: 'Loja Virtual / E-commerce',
    url: 'https://witiquetas.wrtec.com.br/loja',
    favorite: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'qr-cashback',
    companyId: 'comp-matriz-01',
    name: 'Cashback & Ofertas',
    url: 'https://witiquetas.wrtec.com.br/cashback',
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'qr-instagram',
    companyId: 'comp-matriz-01',
    name: 'Instagram Oficial',
    url: 'https://instagram.com/witiquetas',
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const qrCodesStore = new Map<string, QRCodeLibraryItemDTO>(
  defaultQRCodes.map((qr) => [qr.id, qr])
);

// 1. Listar QR Codes da Biblioteca (Ordenados: Favoritos primeiro, depois Nome, isolados por empresa)
router.get('/', requirePermission('templates.view'), (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const items = Array.from(qrCodesStore.values())
    .filter((item) => item.companyId === companyId)
    .sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  res.json({
    total: items.length,
    items,
  });
});

// 2. Cadastrar novo QR Code na Biblioteca
router.post('/', requirePermission('templates.create'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const body = req.body as CreateQRCodeDTO;

  if (!body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'O nome do QR Code é obrigatório.' });
  }

  if (!body.url || !body.url.trim()) {
    return res.status(400).json({ error: 'A URL / link do QR Code é obrigatória.' });
  }

  const id = `qr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newItem: QRCodeLibraryItemDTO = {
    id,
    companyId,
    name: body.name.trim(),
    url: body.url.trim(),
    favorite: !!body.favorite,
    createdAt: now,
    updatedAt: now,
  };

  qrCodesStore.set(id, newItem);
  res.status(201).json(newItem);
});

// 3. Atualizar QR Code existente (com proteção Anti-IDOR por empresa)
router.put('/:id', requirePermission('templates.edit'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const item = qrCodesStore.get(req.params.id);
  if (!item || item.companyId !== companyId) {
    return res.status(404).json({ error: 'QR Code não encontrado na biblioteca.' });
  }

  const body = req.body as UpdateQRCodeDTO;
  if (body.name !== undefined) item.name = body.name.trim();
  if (body.url !== undefined) item.url = body.url.trim();
  if (body.favorite !== undefined) item.favorite = body.favorite;
  item.updatedAt = new Date().toISOString();

  qrCodesStore.set(item.id, item);
  res.json(item);
});

// 4. Excluir QR Code da biblioteca (com proteção Anti-IDOR por empresa)
router.delete('/:id', requirePermission('templates.delete'), requireCsrf, (req: Request, res: Response) => {
  const companyId = getCompanyId(req);
  const item = qrCodesStore.get(req.params.id);
  if (!item || item.companyId !== companyId) {
    return res.status(404).json({ error: 'QR Code não encontrado na biblioteca.' });
  }

  qrCodesStore.delete(req.params.id);
  res.json({
    success: true,
    message: 'QR Code removido da biblioteca. Modelos existentes que usam este link continuam funcionando normalmente.',
  });
});

export { qrCodesStore };
export default router;
