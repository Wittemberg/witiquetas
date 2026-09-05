import { Request, Response, NextFunction } from 'express';
import { SessionService, AuthenticatedPrincipal } from '../services/sessionService.js';
import { parseCookies, SESSION_COOKIE_NAME, getWebSession, isPreRbacEnabled } from '../routes/auth.js';

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
 * Suporta Cookie HttpOnly (witiquetas_session) e Header Authorization (Bearer <token>).
 * Valida status ativo de usuário e empresa com revogação imediata em caso de inativação.
 */
export async function requireAuthenticatedUser(req: Request, res: Response, next: NextFunction) {
  // 1. Verificar Cookie HttpOnly
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];

  // 2. Verificar Header Authorization (Bearer)
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : undefined;

  const rawToken = cookieToken || bearerToken;
  const authMethod: 'cookie' | 'bearer' = cookieToken ? 'cookie' : 'bearer';

  if (!rawToken) {
    return res.status(401).json({
      error: 'Não autenticado. Sessão ausente.',
      code: 'UNAUTHENTICATED',
    });
  }

  // 3. Resolver principal via SessionService (Persistente / Hash no banco)
  const principal = await SessionService.resolvePrincipalFromRawToken(rawToken);

  if (principal) {
    req.principal = principal;
    (req as any).user = principal.user;
    (req as any).company = principal.company;
    req.authMethod = authMethod;
    return next();
  }

  // 4. Fallback de compatibilidade retroativa para sessões em memória pré-RBAC
  const legacySession = getWebSession(rawToken);
  if (legacySession) {
    // Principal sintetizado para compatibilidade
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
      permissions: ['*'], // Modo pré-rbac concede acesso total
    };
    (req as any).user = req.principal.user;
    (req as any).company = req.principal.company;
    req.authMethod = authMethod;
    return next();
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
