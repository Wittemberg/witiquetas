import { Router, Request, Response } from 'express';
import {
  LabelDocumentSchema,
  NICHES,
  normalizeNicheId,
  type LabelElement,
  type TextElement,
  type PriceElement,
  type BarcodeElement,
  type QrCodeElement,
} from '@witiquetas/label-schema';
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
import { EffectiveConfigurationService } from '../services/effectiveConfigurationService.js';

type FieldBoundElement = TextElement | PriceElement | BarcodeElement | QrCodeElement;

function isFieldBoundElement(element: LabelElement): element is FieldBoundElement {
  return (
    element.type === 'text' ||
    element.type === 'price' ||
    element.type === 'barcode' ||
    element.type === 'qrcode'
  );
}

function getElementField(element: LabelElement): string | undefined {
  if (isFieldBoundElement(element)) {
    const rawField = element.field;
    if (typeof rawField === 'string' && rawField.trim().length > 0) {
      return rawField.trim();
    }
  }
  const bindingField = element.binding?.fieldId || element.binding?.field;
  if (typeof bindingField === 'string' && bindingField.trim().length > 0) {
    return bindingField.trim();
  }
  return undefined;
}

interface BindingValidationError {
  error: string;
  code: string;
}

function validateElementBinding(
  element: LabelElement,
  allowedFields: string[],
  nicheAvailability: Record<string, { manual: boolean; integration: boolean }>,
  targetNicheId: string,
  isNewBinding: boolean
): BindingValidationError | null {
  const field = getElementField(element);
  if (!field || field.startsWith('system.')) {
    return null;
  }

  if (!allowedFields.includes(field)) {
    return {
      error: isNewBinding
        ? `Novo binding para o campo '${field}' está desabilitado na política atual do nicho.`
        : `Campo canônico '${field}' está desabilitado na política atual do nicho '${targetNicheId}'.`,
      code: isNewBinding ? 'NEW_DISABLED_BINDING_FORBIDDEN' : 'CANONICAL_FIELD_DISABLED',
    };
  }

  const fieldAvail = nicheAvailability[field];
  if (element.binding?.source === 'manual' && fieldAvail && fieldAvail.manual === false) {
    return {
      error: `Entrada manual para o campo '${field}' está desabilitada na política do nicho.`,
      code: 'MANUAL_INPUT_DISABLED',
    };
  }

  if (element.binding?.source === 'integration' && fieldAvail && fieldAvail.integration === false) {
    return {
      error: `Integração para o campo '${field}' está desabilitada na política do nicho.`,
      code: 'INTEGRATION_INPUT_DISABLED',
    };
  }

  return null;
}

function resolveCanonicalNicheId(nicheIdOrSlug?: string): string {
  if (!nicheIdOrSlug) return 'niche-gondola';
  const match = NICHES.find((n) => n.id === nicheIdOrSlug || n.slug === nicheIdOrSlug);
  if (match) return match.id;
  const slug = normalizeNicheId(nicheIdOrSlug);
  const bySlug = NICHES.find((n) => n.slug === slug);
  return bySlug ? bySlug.id : 'niche-gondola';
}

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

    // Validação Server-Authoritative (Pacote 5.5)
    const principal = req.principal;
    if (!principal) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const isDev = Boolean(req.isPlatformDeveloper || principal.user.id === 'developer-marcel');
    const effectiveConfig = await EffectiveConfigurationService.resolve({
      companyId,
      userId: isDev ? undefined : principal.user.id,
    });

    const targetNicheId = resolveCanonicalNicheId(body.nicheId || body.document?.nicheId);

    // 1. Validação de Nicho Autorizado
    if (!isDev && !effectiveConfig.allowedNiches.includes(targetNicheId)) {
      return res.status(403).json({
        error: `Nicho '${targetNicheId}' não está autorizado para este perfil ou está desabilitado na empresa.`,
        code: 'NICHE_NOT_ALLOWED',
      });
    }

    // 2. Validação de Elementos e Bindings
    const allowedElements = effectiveConfig.enabledElementsByNiche[targetNicheId] || [];
    const allowedFields = effectiveConfig.enabledFieldsByNiche[targetNicheId] || [];
    const fieldsAvailability = effectiveConfig.fieldsAvailabilityByNiche ?? {};
    const nicheAvailability = fieldsAvailability[targetNicheId] ?? {};

    for (const el of body.document.elements || []) {
      if (!allowedElements.includes(el.type)) {
        return res.status(400).json({
          error: `Elemento visual '${el.type}' está desabilitado na política atual do nicho '${targetNicheId}'.`,
          code: 'ELEMENT_TYPE_DISABLED',
        });
      }

      const bindingError = validateElementBinding(el, allowedFields, nicheAvailability, targetNicheId, false);
      if (bindingError) {
        return res.status(400).json(bindingError);
      }
    }

    const created = await templateRepository.createTemplate(body, companyId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao criar modelo.', message: err.message });
  }
});

/**
 * PUT /api/templates/:id
 * Atualizar modelo com suporte a Optimistic Locking e distinção entre PRESERVAÇÃO LEGADA vs NOVA CRIAÇÃO PROIBIDA
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

      // Validação Server-Authoritative P0: Distinção de legado existente vs nova criação
      const existing = await templateRepository.getTemplateById(req.params.id, companyId);
      if (existing && existing.document) {
        const principal = req.principal;
        if (!principal) {
          return res.status(401).json({ error: 'Não autenticado.' });
        }
        const isDev = Boolean(req.isPlatformDeveloper || principal.user.id === 'developer-marcel');
        const effectiveConfig = await EffectiveConfigurationService.resolve({
          companyId,
          userId: isDev ? undefined : principal.user.id,
        });

        const targetNicheId = resolveCanonicalNicheId(
          body.nicheId || body.document.nicheId || existing.nicheId || existing.document.nicheId
        );
        const allowedElements = effectiveConfig.enabledElementsByNiche[targetNicheId] || [];
        const allowedFields = effectiveConfig.enabledFieldsByNiche[targetNicheId] || [];
        const fieldsAvailability = effectiveConfig.fieldsAvailabilityByNiche ?? {};
        const nicheAvailability = fieldsAvailability[targetNicheId] ?? {};

        const existingElementsMap = new Map<string, LabelElement>(
          (existing.document.elements || []).map((e) => [e.id, e])
        );

        for (const el of body.document.elements || []) {
          const prevEl = existingElementsMap.get(el.id);
          if (!prevEl) {
            // NOVO elemento adicionado: tipo NÃO pode ser desabilitado na política atual
            if (!allowedElements.includes(el.type)) {
              return res.status(400).json({
                error: `Elemento visual '${el.type}' está desabilitado na política atual do nicho e não pode ser adicionado.`,
                code: 'NEW_DISABLED_ELEMENT_FORBIDDEN',
              });
            }
            const bindingError = validateElementBinding(el, allowedFields, nicheAvailability, targetNicheId, true);
            if (bindingError) {
              return res.status(400).json(bindingError);
            }
          } else {
            // ELEMENTO PRÉ-EXISTENTE (EXISTING_DISABLED_ELEMENT):
            // Permitido manter o tipo antigo mesmo que atualmente OFF, mas se mudar o tipo para outro desabilitado:
            if (el.type !== prevEl.type && !allowedElements.includes(el.type)) {
              return res.status(400).json({
                error: `Tipo de elemento alterado para '${el.type}', que está desabilitado na política atual.`,
                code: 'ELEMENT_TYPE_DISABLED',
              });
            }
            // BINDING PRÉ-EXISTENTE (EXISTING_DISABLED_BINDING):
            // Permitido manter o binding antigo mesmo que atualmente OFF. Mas se criar NOVO binding ou trocar para campo OFF:
            const currentField = getElementField(el);
            const prevField = getElementField(prevEl);
            if (currentField && currentField !== prevField) {
              const bindingError = validateElementBinding(el, allowedFields, nicheAvailability, targetNicheId, true);
              if (bindingError) {
                return res.status(400).json(bindingError);
              }
            }
          }
        }
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
    const existing = await templateRepository.getTemplateById(req.params.id, companyId);
    if (!existing) {
      return res.status(404).json({
        code: 'MODEL_NOT_FOUND',
        error: 'MODELO_NÃO_ENCONTRADO',
        message: `Modelo '${req.params.id}' não encontrado.`,
      });
    }

    const principal = req.principal;
    if (!principal) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    const isDev = Boolean(req.isPlatformDeveloper || principal.user.id === 'developer-marcel');
    const effectiveConfig = await EffectiveConfigurationService.resolve({
      companyId,
      userId: isDev ? undefined : principal.user.id,
    });

    const targetNicheId = resolveCanonicalNicheId(existing.nicheId || existing.document?.nicheId);
    if (!isDev && !effectiveConfig.allowedNiches.includes(targetNicheId)) {
      return res.status(403).json({
        error: `Nicho '${targetNicheId}' não está autorizado para este perfil.`,
        code: 'NICHE_NOT_ALLOWED',
      });
    }

    const allowedElements = effectiveConfig.enabledElementsByNiche[targetNicheId] || [];
    for (const el of existing.document?.elements || []) {
      if (!allowedElements.includes(el.type)) {
        return res.status(400).json({
          error: `O modelo contém elemento do tipo '${el.type}', que está desabilitado na política atual e não pode ser duplicado.`,
          code: 'DUPLICATE_DISABLED_ELEMENT_FORBIDDEN',
        });
      }
    }

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
