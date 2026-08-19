import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { verifyWebUserToken, type AuthWebUser } from './agents.js';

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
  return process.env.AUTH_MODE !== 'RBAC' && process.env.RBAC_ENABLED !== 'true';
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

export function setSessionCookie(res: Response, sessionId: string, req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = Boolean(
    (req && (req.secure || req.headers['x-forwarded-proto'] === 'https')) || isProd
  );

  const cookieFlags = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
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

// 1. PRE-RBAC / TEMPORÁRIA: Bootstrap de Sessão Server-Side
// Permite ao Dashboard obter sessão web válida com cookie HttpOnly para o tenant configurado.
router.post('/pre-rbac-session', (req: Request, res: Response) => {
  const explicitApiKey = req.body?.apiKey || (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : '');
  let user: AuthWebUser | null = null;

  if (explicitApiKey) {
    user = verifyWebUserToken(explicitApiKey);
    if (!user) {
      return res.status(403).json({ error: 'Credencial administrativa de homologação inválida.' });
    }
  } else {
    // PRE-RBAC / TEMPORÁRIA: Se pre-RBAC não estiver ativo e nenhuma chave foi enviada, rejeita
    if (!isPreRbacEnabled()) {
      return res.status(403).json({ error: 'Bootstrap pré-RBAC desativado.' });
    }

    // Inicialização controlada server-side da sessão web para o tenant configurado
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
router.get('/session', (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  let session = sessionId ? getWebSession(sessionId) : null;

  // Se a sessão não existir mas o sistema estiver em modo PRE-RBAC,
  // inicializa a sessão server-side e emite o cookie HttpOnly automaticamente
  if (!session && isPreRbacEnabled() && req.query.no_auto_bootstrap !== 'true') {
    const user: AuthWebUser = {
      id: 'usr-admin',
      companyId: process.env.ADMIN_COMPANY_ID || 'comp-matriz-01',
      role: 'ADMIN',
    };
    session = createWebSession(user);
    setSessionCookie(res, session.sessionId, req);
  }

  if (!session) {
    return res.status(200).json({ authenticated: false });
  }

  res.status(200).json({
    authenticated: true,
    user: {
      id: session.userId,
      companyId: session.companyId,
      role: session.role,
    },
    expiresAt: new Date(session.expiresAt).toISOString(),
  });
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

// 4. Logout / Invalidação de Sessão
router.post('/logout', (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (sessionId) {
    invalidateWebSession(sessionId);
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
  res.status(200).json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

export default router;
