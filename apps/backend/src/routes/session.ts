import { Router, Request, Response } from 'express';
import { requireAuthenticatedUser } from '../middleware/authMiddleware.js';
import { EffectiveConfigurationService } from '../services/effectiveConfigurationService.js';

const router = Router();

/**
 * CANONICAL EFFECTIVE SESSION CONTEXT ENDPOINT (PACOTE 5.2)
 * GET /context ou GET /api/session/context
 *
 * Retorna o contexto seguro completo da sessão autenticada:
 * - user: dados do usuário autenticado
 * - company: dados da empresa associada
 * - roles: códigos de perfil atribuídos
 * - permissions: permissões unificadas dos papéis
 * - allowedNiches / enabledNiches: nichos permitidos
 * - enabledElementsByNiche: elementos habilitados por nicho
 * - enabledFieldsByNiche: campos habilitados por nicho
 * - csrfToken: token CSRF vinculado à sessão
 */
export const isDccEnabled = (): boolean => {
  if (process.env.DCC_ENABLED !== undefined) {
    return process.env.DCC_ENABLED === 'true';
  }
  return (
    process.env.ENABLE_DEV_CONTROL_CENTER === 'true' ||
    process.env.VITE_ENABLE_DEV_CONTROL_CENTER === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
};

router.get('/context', requireAuthenticatedUser, async (req: Request, res: Response) => {
  const principal = req.principal!;

  try {
    const effectiveConfig = await EffectiveConfigurationService.resolve({
      companyId: principal.user.companyId,
      userId: principal.user.id,
    });

    const dccEnabled = isDccEnabled();
    const isMaster = Boolean(principal.user.isDccMaster);
    const hasDccPerm = principal.permissions.includes('*') || principal.permissions.includes('devcontrol.view');
    const canAccessDcc = dccEnabled && isMaster && hasDccPerm;

    return res.status(200).json({
      user: principal.user,
      company: principal.company,
      roles: principal.roles.map((r) => r.code),
      permissions: principal.permissions,
      allowedNiches: effectiveConfig.allowedNiches,
      enabledNiches: effectiveConfig.enabledNiches,
      enabledElementsByNiche: effectiveConfig.enabledElementsByNiche,
      enabledFieldsByNiche: effectiveConfig.enabledFieldsByNiche,
      csrfToken: principal.csrfToken,
      dccEnabled,
      canAccessDcc,
    });
  } catch (err: any) {
    console.error(`[SessionContext] Falha ao resolver configuração efetiva para usuário '${principal.user.id}':`, err.message);
    return res.status(500).json({
      error: 'Falha ao resolver contexto efetivo de sessão.',
      details: err.message,
    });
  }
});

export default router;
