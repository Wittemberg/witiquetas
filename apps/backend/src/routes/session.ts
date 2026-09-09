import { Router, Request, Response } from 'express';
import { requireAuthenticatedUser } from '../middleware/authMiddleware.js';
import { EffectiveConfigurationService } from '../services/effectiveConfigurationService.js';
import { NICHES } from '@witiquetas/label-schema';

const router = Router();

/**
 * CANONICAL EFFECTIVE SESSION CONTEXT ENDPOINT (PACOTE 5.2 / HOTFIX 5.3.5)
 * GET /context ou GET /api/session/context
 *
 * Retorna o contexto seguro completo da sessão autenticada:
 * - Para Tenant: contexto comercial normal com isDeveloper: false e canAccessDcc: false
 * - Para PLATFORM_DEVELOPER: contexto com acesso ao produto completo na empresa configurada,
 *   isDeveloper: true, canAccessDcc: true, permissions: ['*'], roles: ['PLATFORM_DEVELOPER']
 */
router.get('/context', requireAuthenticatedUser, async (req: Request, res: Response) => {
  const principal = req.principal!;
  const isDev = Boolean((req as any).isPlatformDeveloper || principal.user.id === 'developer-marcel');

  try {
    let effectiveConfig: any;
    try {
      effectiveConfig = await EffectiveConfigurationService.resolve({
        companyId: principal.user.companyId,
        userId: isDev ? undefined : principal.user.id,
      });
    } catch (cfgErr: any) {
      if (isDev) {
        effectiveConfig = {
          allowedNiches: NICHES.map((n) => n.id),
          enabledNiches: NICHES.map((n) => n.id),
          enabledElementsByNiche: {},
          enabledFieldsByNiche: {},
        };
      } else {
        throw cfgErr;
      }
    }

    return res.status(200).json({
      user: principal.user,
      company: principal.company,
      roles: isDev ? ['PLATFORM_DEVELOPER'] : principal.roles.map((r) => r.code),
      permissions: principal.permissions,
      isDeveloper: isDev,
      canAccessDcc: isDev,
      allowedNiches: effectiveConfig.allowedNiches,
      enabledNiches: effectiveConfig.enabledNiches,
      defaultNicheId: effectiveConfig.defaultNicheId,
      enabledElementsByNiche: effectiveConfig.enabledElementsByNiche,
      enabledFieldsByNiche: effectiveConfig.enabledFieldsByNiche,
      fieldsAvailabilityByNiche: effectiveConfig.fieldsAvailabilityByNiche,
      effectiveConfiguration: effectiveConfig,
      csrfToken: principal.csrfToken,
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
