import { Router, Request, Response } from 'express';
import { LabelDocumentSchema } from '@witiquetas/label-schema';
import {
  templateRepository,
  MismatchedVersionError,
} from '../repositories/templateRepository';
import {
  presenceRepository,
  ActiveEditingSessionError,
} from '../repositories/presenceRepository';
import type { CreateTemplateDTO, UpdateTemplateDTO, RenameTemplateDTO } from '@witiquetas/contracts';
import {
  requireAuthenticatedUser,
  requirePermission,
  requireCsrf,
} from '../middleware/authMiddleware.js';

const router = Router();

// Proteção mandatória de autenticação
router.use(requireAuthenticatedUser);

// Helper para obter companyId da requisição (prioriza contexto seguro do principal)
function getCompanyId(req: Request): string {
  if (req.principal?.company?.id) {
    return req.principal.company.id;
  }
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
router.get('/', requirePermission('templates.view'), async (req: Request, res: Response) => {
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
 * GET /api/templates/:id/presence
 * Retorna sessões ativas do modelo
 */
router.get('/:id/presence', requirePermission('templates.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const active = await presenceRepository.getActiveSessions(req.params.id, companyId);
    res.json({ total: active.length, sessions: active });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar presença.', message: err.message });
  }
});

/**
 * POST /api/templates/:id/presence/heartbeat
 * Registra ou atualiza heartbeat de uma sessão de edição
 */
router.post('/:id/presence/heartbeat', requirePermission('templates.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId, userIdentifier, os, browser, deviceName } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }

    const session = await presenceRepository.registerOrHeartbeatSession({
      modelId: req.params.id,
      companyId,
      sessionId,
      userIdentifier: userIdentifier || 'Sessão de Edição',
      os,
      browser,
      deviceName,
    });

    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro no heartbeat de presença.', message: err.message });
  }
});

/**
 * DELETE /api/templates/:id/presence/leave
 * Encerra sessão de edição ao fechar/navegar
 */
router.delete('/:id/presence/leave', requirePermission('templates.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }

    await presenceRepository.leaveSession({
      modelId: req.params.id,
      companyId,
      sessionId,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao encerrar sessão de presença.', message: err.message });
  }
});

/**
 * GET /api/templates/:id
 * Retorna o modelo completo incluindo document_schema
 */
router.get('/:id', requirePermission('templates.view'), async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const template = await templateRepository.getTemplateById(req.params.id, companyId);

    if (!template) {
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: 'Modelo de etiqueta não encontrado.',
      });
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
router.post('/', requirePermission('templates.create'), requireCsrf, async (req: Request, res: Response) => {
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
router.put('/:id', requirePermission('templates.edit'), requireCsrf, async (req: Request, res: Response) => {
  const body = req.body as UpdateTemplateDTO;
  try {
    const companyId = getCompanyId(req);

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
        code: 'MODEL_VERSION_CONFLICT',
        error: 'CONFLITO DE VERSÃO (Optimistic Locking)',
        message:
          'Este modelo foi alterado em outro local enquanto você o editava.',
        currentVersion: err.currentVersion,
        expectedVersion: body.expectedVersion,
      });
    }
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: 'Este modelo não existe mais no servidor.',
      });
    }
    res.status(500).json({ error: 'Erro ao atualizar modelo.', message: err.message });
  }
});

/**
 * POST /api/templates/:id/duplicate
 * Duplicar modelo no servidor
 */
router.post('/:id/duplicate', requirePermission('templates.edit'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const duplicated = await templateRepository.duplicateTemplate(req.params.id, companyId);
    res.status(201).json(duplicated);
  } catch (err: any) {
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: err.message,
      });
    }
    res.status(500).json({ error: 'Erro ao duplicar modelo.', message: err.message });
  }
});

/**
 * PATCH /api/templates/:id/name
 * Renomear modelo
 */
router.patch('/:id/name', requirePermission('templates.edit'), requireCsrf, async (req: Request, res: Response) => {
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
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: err.message,
      });
    }
    res.status(500).json({ error: 'Erro ao renomear modelo.', message: err.message });
  }
});

/**
 * DELETE /api/templates/:id
 * Soft Delete do modelo (deleted_at = NOW()) com bloqueio contra sessões ativas em edição
 */
router.delete('/:id', requirePermission('templates.delete'), requireCsrf, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    await templateRepository.deleteTemplate(req.params.id, companyId);
    res.status(200).json({ success: true, message: 'Modelo removido com sucesso.' });
  } catch (err: any) {
    if (err instanceof ActiveEditingSessionError) {
      return res.status(409).json({
        code: 'MODEL_EDITING_ACTIVE',
        error: 'MODELO_EM_EDIÇÃO',
        message: 'Este modelo está sendo editado no momento por outra sessão.',
        activeSessions: err.activeSessions,
      });
    }
    if (err.message.includes('não encontrado')) {
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: err.message,
      });
    }
    res.status(500).json({ error: 'Erro ao remover modelo.', message: err.message });
  }
});

export default router;
