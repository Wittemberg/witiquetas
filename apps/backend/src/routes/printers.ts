import { Router, Request, Response } from 'express';
import type { PrinterDTO, CreatePrinterDTO, UpdatePrinterDTO } from '@witiquetas/contracts';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';
import {
  PrintersRepository,
  memPrinters as printersStore,
} from '../repositories/printersRepository.js';
import { AgentsRepository } from '../repositories/agentsRepository.js';

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

// 1. Listar todas as impressoras do tenant
router.get('/', requirePermission('printers.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const printers = await PrintersRepository.listByCompany(companyId);
    return res.json({
      total: printers.length,
      printers,
    });
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao listar impressoras: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao listar impressoras.' });
  }
});

// 2. Buscar impressora por ID com isolamento multi-tenant estrito (Anti-IDOR)
router.get('/:id', requirePermission('printers.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const printer = await PrintersRepository.findById(companyId, req.params.id);
    if (!printer) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }
    return res.json(printer);
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao buscar impressora: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao buscar impressora.' });
  }
});

// 3. Cadastrar nova impressora
router.post('/', requirePermission('printers.manage'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const body = req.body as CreatePrinterDTO & { companyId?: string };

    if (body.companyId && body.companyId !== companyId) {
      return res.status(400).json({
        code: 'INVALID_COMPANY_ID',
        error: 'Não é permitido criar impressora para outro tenant.',
      });
    }

    if (!body.name || (!body.protocol && !body.language && !body.connectionType)) {
      return res.status(400).json({ error: 'Nome e protocolo/tipo de conexão são obrigatórios.' });
    }

    // Se agentId fornecido, valida vínculo same-tenant
    if (body.agentId) {
      const agent = await AgentsRepository.findByIdAndCompany(companyId, body.agentId);
      if (!agent) {
        return res.status(400).json({
          code: 'INVALID_AGENT',
          error: 'O agente de impressão especificado não existe ou pertence a outra empresa.',
        });
      }
    }

    const newPrinter = await PrintersRepository.create(companyId, body);
    return res.status(201).json(newPrinter);
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao cadastrar impressora: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao cadastrar impressora.' });
  }
});

// 4. Atualizar impressora existente
router.put('/:id', requirePermission('printers.manage'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const existing = await PrintersRepository.findById(companyId, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }

    const body = req.body as UpdatePrinterDTO & { companyId?: string };
    if (body.companyId && body.companyId !== companyId) {
      return res.status(400).json({
        code: 'INVALID_COMPANY_ID',
        error: 'Não é permitido alterar o tenant da impressora.',
      });
    }

    // Se agentId fornecido, valida vínculo same-tenant
    if (body.agentId) {
      const agent = await AgentsRepository.findByIdAndCompany(companyId, body.agentId);
      if (!agent) {
        return res.status(400).json({
          code: 'INVALID_AGENT',
          error: 'O agente de impressão especificado não existe ou pertence a outra empresa.',
        });
      }
    }

    const updated = await PrintersRepository.update(companyId, req.params.id, body);
    if (!updated) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }

    return res.json(updated);
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao atualizar impressora: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao atualizar impressora.' });
  }
});

// 5. Excluir impressora
router.delete('/:id', requirePermission('printers.manage'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const deleted = await PrintersRepository.delete(companyId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }
    return res.json({ success: true, message: 'Impressora removida com sucesso.' });
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao excluir impressora: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao excluir impressora.' });
  }
});

// 6. Definir impressora como padrão do tenant
router.post('/:id/default', requirePermission('printers.manage'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const success = await PrintersRepository.setDefault(companyId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }
    return res.json({ success: true, message: 'Impressora definida como padrão com sucesso.' });
  } catch (err: any) {
    console.error(`[PrintersRoute] Erro ao definir impressora padrão: ${err.message}`);
    return res.status(500).json({ error: 'Erro ao definir impressora padrão.' });
  }
});

export { printersStore };
export default router;
