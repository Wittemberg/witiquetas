import { Request, Response, NextFunction } from 'express';
import { SessionService, AuthenticatedPrincipal } from '../services/sessionService.js';
import { parseCookies, SESSION_COOKIE_NAME, getWebSession, isPreRbacEnabled } from '../routes/auth.js';
import {
  developerAuthService,
  DCC_SESSION_COOKIE_NAME,
  getDeveloperCompanyId,
} from '../services/developerAuthService.js';
import { CompanyRepository } from '../repositories/adminRepositories.js';

declare global {
  namespace Express {
    interface Request {
      principal?: AuthenticatedPrincipal;
      authMethod?: 'cookie' | 'bearer';
    }
  }
}

/**
 * Middleware: Exige que a requisição venha de um usuário autenticado com sessão válida.
 * Suporta:
 * 1. Cookie HttpOnly de tenant (witiquetas_session) e Header Authorization (Bearer <token>);
 * 2. Cookie HttpOnly de desenvolvedor da plataforma (witiquetas_dcc_session) e Header x-dcc-session
 *    concedendo identidade PLATFORM_DEVELOPER com acesso integral ao produto na empresa configurada.
 * Valida status ativo de usuário e empresa com revogação imediata em caso de inativação.
 */
export async function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);

  // 1. Verificar Sessão Tenant Comercial (Cookie HttpOnly)
  const cookieToken = cookies[SESSION_COOKIE_NAME];

  // 2. Verificar Header Authorization (Bearer)
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : undefined;

  const rawTenantToken = cookieToken || bearerToken;

  if (rawTenantToken) {
    // Resolver principal tenant via SessionService (Persistente / Hash no banco)
    const principal = await SessionService.resolvePrincipalFromRawToken(rawTenantToken);
    if (principal) {
      req.principal = principal;
      (req as any).user = principal.user;
      (req as any).company = principal.company;
      req.authMethod = cookieToken ? 'cookie' : 'bearer';
      return next();
    }

    // Fallback de compatibilidade retroativa para sessões em memória pré-RBAC
    const legacySession = getWebSession(rawTenantToken);
    if (legacySession) {
      req.principal = {
        sessionId: legacySession.sessionId,
        csrfToken: 'legacy-exempt',
        user: {
          id: legacySession.userId,
          companyId: legacySession.companyId,
          name: legacySession.userId,
          email: `${legacySession.userId}@local`,
          status: 'ACTIVE',
        },
        company: {
          id: legacySession.companyId,
          name: 'Default Company',
          slug: 'default',
          status: 'ACTIVE',
        },
        roles: [],
        permissions: ['*'],
      };
      (req as any).user = req.principal.user;
      (req as any).company = req.principal.company;
      req.authMethod = cookieToken ? 'cookie' : 'bearer';
      return next();
    }
  }

  // 3. Verificar Sessão de Desenvolvedor da Plataforma (PLATFORM_DEVELOPER)
  const dccCookieToken = cookies[DCC_SESSION_COOKIE_NAME];
  const dccHeaderToken = typeof req.headers['x-dcc-session'] === 'string' ? req.headers['x-dcc-session'].trim() : undefined;
  const rawDccToken = dccCookieToken || dccHeaderToken;

  if (rawDccToken) {
    const dccSession = developerAuthService.validateSession(rawDccToken);
    if (dccSession) {
      const devCompanyId = getDeveloperCompanyId();
      const foundCompany = await CompanyRepository.findById(devCompanyId);
      const now = new Date().toISOString();
      const company = foundCompany || {
        id: devCompanyId,
        name: 'Empresa Principal',
        legalName: null,
        document: null,
        slug: 'default',
        status: 'ACTIVE' as const,
        createdAt: now,
        updatedAt: now,
      };

      req.principal = {
        sessionId: `dcc-${dccSession.username.toLowerCase()}`,
        csrfToken: dccSession.csrfToken || 'dcc-csrf-exempt',
        user: {
          id: 'developer-marcel',
          companyId: company.id,
          name: dccSession.username,
          email: 'developer@witiquetas.local',
          status: 'ACTIVE',
          isDccMaster: true,
        },
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          status: company.status,
        },
        roles: [], // Sem roles fakes de tenant
        permissions: ['*'], // Acesso ao produto completo dentro da empresa configurada
      };

      (req as any).user = req.principal.user;
      (req as any).company = req.principal.company;
      (req as any).isPlatformDeveloper = true;
      req.authMethod = dccCookieToken ? 'cookie' : 'bearer';
      return next();
    }
  }

  // Se nenhuma sessão válida foi fornecida
  if (!rawTenantToken && !rawDccToken) {
    return res.status(401).json({
      error: 'Não autenticado. Sessão ausente.',
      code: 'UNAUTHENTICATED',
    });
  }

  // Se a sessão expirou, foi revogada ou usuário/empresa foi inativado
  return res.status(401).json({
    error: 'Sessão inválida, expirada ou usuário inativo.',
    code: 'SESSION_INVALID',
  });
}

/**
 * Middleware: Exige que o principal autenticado possua uma permissão específica.
 */
export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.principal) {
      return res.status(401).json({
        error: 'Não autenticado.',
        code: 'UNAUTHENTICATED',
      });
    }

    const { permissions } = req.principal;
    // Permissão wildcard '*' concede tudo
    const hasPermission = permissions.includes('*') || permissions.includes(permissionCode);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Permissão insuficiente para acessar este recurso.',
        code: 'FORBIDDEN',
        requiredPermission: permissionCode,
      });
    }

    return next();
  };
}

/**
 * Middleware: Proteção CSRF para requisições com mutação de estado (POST, PUT, PATCH, DELETE).
 * - GET, HEAD, OPTIONS são seguros e passam sem validação.
 * - Valida cabeçalho 'x-csrf-token' contra o token da sessão.
 * - Valida 'origin' ou 'referer' quando presente.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Se não estiver usando autenticação baseada em sessão/cookie, CSRF é opcional
  if (!req.principal) {
    return next();
  }

  // Em modo pré-rbac / legacy, isentar
  if (req.principal.csrfToken === 'legacy-exempt') {
    return next();
  }

  // Validação de Origin / Host quando aplicável
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== host && !originUrl.host.includes('localhost') && !originUrl.host.includes('127.0.0.1')) {
        // Se a origem não bater com host nem ambiente local
        return res.status(403).json({
          error: 'Origem de requisição não permitida (CSRF origin mismatch).',
          code: 'CSRF_ORIGIN_INVALID',
        });
      }
    } catch {
      return res.status(403).json({
        error: 'Origem de requisição malformada.',
        code: 'CSRF_ORIGIN_MALFORMED',
      });
    }
  }

  // Validação do Token CSRF
  const clientCsrf = req.headers['x-csrf-token'] || req.headers['csrf-token'];

  if (!clientCsrf || typeof clientCsrf !== 'string') {
    return res.status(403).json({
      error: 'Token CSRF ausente.',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  if (clientCsrf !== req.principal.csrfToken) {
    return res.status(403).json({
      error: 'Token CSRF inválido.',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  return next();
}
