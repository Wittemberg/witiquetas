import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { verifyWebUserToken, type AuthWebUser } from './agents.js';
import { PasswordService } from '../services/passwordService.js';
import { SessionService } from '../services/sessionService.js';
import { SessionRepository } from '../repositories/sessionRepository.js';
import { UserRepository, CompanyRepository } from '../repositories/adminRepositories.js';
import { loginRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

export interface WebSession {
  sessionId: string;
  userId: string;
  companyId: string;
  role: 'ADMIN' | 'OPERATOR' | 'SUPER_ADMIN';
  createdAt: number;
  expiresAt: number;
}

// Store em memória de sessões temporárias pré-RBAC
export const webSessionsStore = new Map<string, WebSession>();
export const SESSION_COOKIE_NAME = 'witiquetas_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

export function isPreRbacEnabled(): boolean {
  return process.env.AUTH_MODE === 'PRE_RBAC' || process.env.PRE_RBAC === 'true';
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const list: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      list[name] = decodeURIComponent(val);
    }
  });
  return list;
}

export function createWebSession(user: AuthWebUser): WebSession {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session: WebSession = {
    sessionId,
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  webSessionsStore.set(sessionId, session);
  return session;
}

export function getWebSession(sessionId: string): WebSession | null {
  if (!sessionId) return null;
  const session = webSessionsStore.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    webSessionsStore.delete(sessionId);
    return null;
  }
  return session;
}

export function invalidateWebSession(sessionId: string): boolean {
  return webSessionsStore.delete(sessionId);
}

export function setSessionCookie(res: Response, token: string, req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = Boolean(
    (req && (req.secure || req.headers['x-forwarded-proto'] === 'https')) || isProd
  );

  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_MS / 1000}`,
  ];
  if (isHttps) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));
}

/**
 * CANONICAL LOGIN ENDPOINT (PACOTE 5.2)
 * POST /login ou POST /api/auth/login
 *
 * Implementa:
 * - Rate limiting por IP real (Express trust proxy auditado)
 * - Validação estrita de credenciais com resposta indistinguível para email inexistente, senha errada ou usuário inativo
 * - Geração de sessão de alta entropia (256 bits) com cookie HttpOnly
 * - CSRF token gerado e retornado no corpo da resposta
 */
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Buscar usuário com hash de senha
  const userRecord = await UserRepository.findByEmailWithPassword(normalizedEmail);

  // REFINEMENT P0 (ERROR CONTRACT):
  // Login inválido deve retornar resposta indistinguível entre:
  // - email inexistente
  // - senha errada
  // - usuário inativo
  // Não revelar motivo ao cliente. O motivo específico existe apenas no log de auditoria interno.
  if (!userRecord || !userRecord.passwordHash) {
    // Executa dummy verification para mitigar timing attacks
    await PasswordService.dummyVerify();
    console.warn(`[AuthAudit] Falha de login para email '${normalizedEmail}': usuário ou credencial não encontrada.`);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const isPasswordValid = await PasswordService.verify(password, userRecord.passwordHash);
  if (!isPasswordValid) {
    console.warn(`[AuthAudit] Falha de login para usuário '${userRecord.id}': senha incorreta.`);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (userRecord.status !== 'ACTIVE') {
    console.warn(`[AuthAudit] Falha de login para usuário '${userRecord.id}': status '${userRecord.status}' não ativo.`);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const company = await CompanyRepository.findById(userRecord.companyId);
  if (!company || company.status !== 'ACTIVE') {
    console.warn(`[AuthAudit] Falha de login para usuário '${userRecord.id}': empresa '${userRecord.companyId}' inativa.`);
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  // Criação da sessão autenticada
  const clientIp = req.ip || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const sessionResult = await SessionService.createAuthenticatedSession({
    userId: userRecord.id,
    companyId: userRecord.companyId,
    ipAddress: clientIp,
    userAgent,
  });

  // Emite cookie HttpOnly com o token de sessão
  setSessionCookie(res, sessionResult.rawToken, req);

  console.log(`[AuthAudit] Login realizado com sucesso para usuário '${userRecord.id}' na empresa '${company.id}'.`);

  return res.status(200).json({
    success: true,
    user: {
      id: userRecord.id,
      companyId: userRecord.companyId,
      name: userRecord.name,
      email: userRecord.email,
      status: userRecord.status,
    },
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      status: company.status,
    },
    csrfToken: sessionResult.csrfToken,
    expiresAt: sessionResult.expiresAt.toISOString(),
  });
});

/**
 * CANONICAL LOGOUT ENDPOINT (PACOTE 5.2)
 * POST /logout ou POST /api/auth/logout
 *
 * Invalida a sessão no banco e limpa o cookie HttpOnly
 */
router.post('/logout', async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;

  const rawToken = cookieToken || bearerToken;

  if (rawToken) {
    const tokenHash = SessionService.hashToken(rawToken);
    const session = await SessionRepository.findByTokenHash(tokenHash);
    if (session) {
      await SessionRepository.revoke(session.id);
      console.log(`[AuthAudit] Sessão '${session.id}' revogada com sucesso.`);
    }

    // Invalida também do store legado se aplicável
    invalidateWebSession(rawToken);
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );

  return res.status(200).json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

// 1. PRE-RBAC / TEMPORÁRIA: Bootstrap de Sessão Server-Side
router.post('/pre-rbac-session', (req: Request, res: Response) => {
  const explicitApiKey = req.body?.apiKey || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : '');
  let user: AuthWebUser | null = null;

  if (explicitApiKey) {
    user = verifyWebUserToken(explicitApiKey);
    if (!user) {
      return res.status(403).json({ error: 'Credencial administrativa de homologação inválida.' });
    }
  } else {
    if (!isPreRbacEnabled()) {
      return res.status(403).json({ error: 'Bootstrap pré-RBAC desativado.' });
    }

    user = {
      id: 'usr-admin',
      companyId: process.env.ADMIN_COMPANY_ID || 'comp-matriz-01',
      role: 'ADMIN',
    };
  }

  const session = createWebSession(user);
  setSessionCookie(res, session.sessionId, req);

  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      companyId: user.companyId,
      role: user.role,
    },
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
});

// 2. Status da Sessão Web Atual (com auto-bootstrap em ambiente pré-RBAC)
router.get('/session', async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];

  if (rawToken) {
    const legacySession = getWebSession(rawToken);
    if (legacySession) {
      return res.status(200).json({
        authenticated: true,
        user: {
          id: legacySession.userId,
          companyId: legacySession.companyId,
          role: legacySession.role,
        },
        expiresAt: new Date(legacySession.expiresAt).toISOString(),
      });
    }

    const principal = await SessionService.resolvePrincipalFromRawToken(rawToken);
    if (principal) {
      return res.status(200).json({
        authenticated: true,
        user: principal.user,
        company: principal.company,
        roles: principal.roles.map((r) => r.code),
        permissions: principal.permissions,
        csrfToken: principal.csrfToken,
      });
    }
  }

  // Auto-bootstrap em ambiente pre-RBAC se solicitado
  if (isPreRbacEnabled() && req.query.no_auto_bootstrap !== 'true') {
    const user: AuthWebUser = {
      id: 'usr-admin',
      companyId: process.env.ADMIN_COMPANY_ID || 'comp-matriz-01',
      role: 'ADMIN',
    };
    const session = createWebSession(user);
    setSessionCookie(res, session.sessionId, req);
    return res.status(200).json({
      authenticated: true,
      user: {
        id: session.userId,
        companyId: session.companyId,
        role: session.role,
      },
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  }

  return res.status(200).json({ authenticated: false });
});

// 3. Diagnóstico Seguro Pré-RBAC (Sem expor credenciais)
router.get('/diagnostics', (_req: Request, res: Response) => {
  res.status(200).json({
    PRE_RBAC_ENABLED: isPreRbacEnabled(),
    ADMIN_API_KEY_CONFIGURED: Boolean(process.env.ADMIN_API_KEY),
    SUPER_ADMIN_API_KEY_CONFIGURED: Boolean(process.env.SUPER_ADMIN_API_KEY),
    ADMIN_COMPANY_ID_CONFIGURED: Boolean(process.env.ADMIN_COMPANY_ID),
    SESSION_STORE_READY: true,
    activeSessionsCount: webSessionsStore.size,
  });
});

export default router;
