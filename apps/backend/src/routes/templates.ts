import { Router, Request, Response } from 'express';
import { LabelDocumentSchema } from '@witiquetas/label-schema';
import {
  templateRepository,
  MismatchedVersionError,
} from '../repositories/templateRepository';
import type { CreateTemplateDTO, UpdateTemplateDTO, RenameTemplateDTO } from '@witiquetas/contracts';

const router = Router();

// Helper para obter companyId da requisição
function getCompanyId(req: Request): string {
  const headerCompany = req.headers['x-company-id'] as string;
  if (headerCompany && headerCompany.trim()) {
    return headerCompany.trim();
  }
  return 'comp-default';
}

/**
 * GET /api/templates
 * Retorna resumos leves dos modelos (Sem carregar document_schema JSONB)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const search = req.query.search as string;
    const templates = await templateRepository.listTemplates({ companyId, search });

    res.json({
      total: templates.length,
      templates,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar modelos.', message: err.message });
  }
});

/**
 * GET /api/templates/:id
 * Retorna o modelo completo incluindo document_schema
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const template = await templateRepository.getTemplateById(req.params.id, companyId);

    if (!template) {
      return res.status(404).json({ error: 'Modelo de etiqueta não encontrado.' });
    }

    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar modelo.', message: err.message });
  }
});

/**
 * POST /api/templates
 * Criar novo modelo
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const body = req.body as CreateTemplateDTO;

    if ((!body.name && !body.title) || !body.document) {
      return res.status(400).json({ error: 'Nome e documento da etiqueta são obrigatórios.' });
    }

    const validation = LabelDocumentSchema.safeParse(body.document);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Documento de etiqueta inválido.',
        details: validation.error.format(),
      });
    }

    const created = await templateRepository.createTemplate(body, companyId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao criar modelo.', message: err.message });
  }
});

/**
 * PUT /api/templates/:id
 * Atualizar modelo com suporte a Optimistic Locking (expectedVersion -> HTTP 409 Conflict)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const body = req.body as UpdateTemplateDTO;

    if (body.document) {
      const validation = LabelDocumentSchema.safeParse(body.document);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Documento de etiqueta inválido.',
          details: validation.error.format(),
        });
      }
    }

    const updated = await templateRepository.updateTemplate(req.params.id, body, companyId);
    res.json(updated);
  } catch (err: any) {
    if (err instanceof MismatchedVersionError) {
      return res.status(409).json({
        error: 'CONFLITO DE VERSÃO (Optimistic Locking)',
        message:
          'Este modelo foi alterado em outra sessão. Recarregue o modelo antes de salvar novamente.',
        currentVersion: err.currentVersion,
      });
    }
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro ao atualizar modelo.', message: err.message });
  }
});

/**
 * POST /api/templates/:id/duplicate
 * Duplicar modelo no servidor
 */
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const duplicated = await templateRepository.duplicateTemplate(req.params.id, companyId);
    res.status(201).json(duplicated);
  } catch (err: any) {
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro ao duplicar modelo.', message: err.message });
  }
});

/**
 * PATCH /api/templates/:id/name
 * Renomear modelo
 */
router.patch('/:id/name', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const body = req.body as RenameTemplateDTO;

    if (!body.title || !body.title.trim()) {
      return res.status(400).json({ error: 'Título do modelo é obrigatório.' });
    }

    const updated = await templateRepository.renameTemplate(
      req.params.id,
      body.title.trim(),
      companyId
    );
    res.json(updated);
  } catch (err: any) {
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: 'Erro ao renomear modelo.', message: err.message });
  }
});

/**
 * DELETE /api/templates/:id
 * Soft Delete do modelo (deleted_at = NOW())
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    await templateRepository.deleteTemplate(req.params.id, companyId);
    res.status(200).json({ success: true, message: 'Modelo removido com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao remover modelo.', message: err.message });
  }
});

export default router;
